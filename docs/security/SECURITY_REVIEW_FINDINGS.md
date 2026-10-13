# Security Review — Remaining Findings

**Date**: September 2026
**Reviewer**: Independent code review (post-existing audit)
**Scope**: `backend/` (Spring Boot) and `frontend/` (React)
**Prerequisite reading**: [SECURITY_AUDIT_REPORT.md](./SECURITY_AUDIT_REPORT.md) — the prior audit remediated 33 vulnerabilities from a 3.0/10 to 9.5/10. This document identifies **remaining gaps** not covered by that remediation.

---

## Summary

The codebase is **well-hardened** overall. The prior remediation addressed all critical E2EE, authentication, rate-limiting, and file-handling issues. However, a fresh review of the *current* code identifies **10 remaining issues**, ranging from low to medium severity. None are critical or exploitable for remote code execution, but several enable **information disclosure**, **authorization bypass**, or **session hijacking amplification**.

| # | Severity | Issue |
|---|----------|-------|
| 1 | Medium | User enumeration via registration endpoint |
| 2 | Medium | IDOR — user email disclosed via `GET /users/{id}` |
| 3 | Medium-High | JWT access/refresh tokens stored in `localStorage` (XSS theft) |
| 4 | Medium | IDOR — file download has no per-user authorization (any authenticated user downloads any file) |
| 5 | Medium | Access token remains valid after logout (no server-side revocation) |
| 6 | Low | Missing input validation on `avatarUrl` and `status` profile fields |
| 7 | Low | Timing side-channel on login (user existence leaks via response latency) |
| 8 | Low | No audit log for sensitive operations (message edit/delete, conversation create, file access) |
| 9 | Low | Weak default DB password in `application.yml` postgres profile |
| 10 | Low | Recipient E2EE keys not validated against conversation membership |

---

## Detailed Findings

### 1. User Enumeration via Registration

**Severity**: Medium
**File**: `backend/src/main/java/com/relay/auth/service/AuthService.java:48-49`
**OWASP**: A07:2021 — Identification and Authentication Failures

The registration endpoint leaks whether an email address is already registered:

```java
if (userRepository.existsByEmail(normalizedEmail)) {
    throw ApiException.conflict("Email already registered");
}
```

This returns HTTP **409 Conflict** with the message `"Email already registered"`, allowing an attacker to enumerate valid email addresses by probing the endpoint. The audit report's P2-007 fix only verified that the *search* DTO excludes emails — it did not address the registration path.

**Recommendation**: Return a generic `200 OK` with a message like `"If this email is not already registered, a confirmation has been sent."` The login endpoint correctly avoids this (it always returns `"Invalid email or password"`), so the register endpoint should match that pattern. At minimum, the conflict response should not distinguish between "email exists" and other errors.

---

### 2. IDOR — User Email Disclosed via Profile Lookup

**Severity**: Medium
**File**: `backend/src/main/java/com/relay/user/controller/UserController.java:26-29` and `backend/src/main/java/com/relay/user/dto/UserResponse.java:8-15`

The `GET /api/v1/users/{id}` endpoint returns a `UserResponse` that includes the `email` field:

```java
public record UserResponse(
        UUID id,
        String name,
        String email,        // ← PII exposed to any authenticated user
        String avatarUrl,
        String status,
        Instant createdAt
) { ... }
```

Any authenticated user can retrieve **any other user's email address** by their UUID. The audit's P2-007 fix only addressed the `/search` endpoint (which uses `UserSearchResponse`, correctly excluding email). The direct lookup endpoint was missed.

**Recommendation**: Create a separate `UserProfileResponse` DTO that excludes `email` for the `GET /users/{id}` endpoint (which is used for looking up conversation participants). Reserve `UserResponse` (with email) for the `/me` and authentication endpoints only. Alternatively, only return email if the requester is the user themselves or has an existing conversation with them.

---

### 3. JWT Tokens Stored in `localStorage` (XSS Theft Risk)

**Severity**: Medium-High
**Files**: `frontend/src/stores/authStore.ts:30-32` and `frontend/src/lib/axios.ts:11-13`

Both the access token and refresh token are persisted in `localStorage`, which is readable by **any JavaScript** running on the page, including XSS payloads:

```typescript
// authStore.ts
localStorage.setItem('accessToken', accessToken);
localStorage.setItem('refreshToken', refreshToken);
// axios.ts
const token = localStorage.getItem('accessToken');
```

While the application's E2EE private keys are stored in IndexedDB (also XSS-vulnerable), the JWT tokens are the **authentication credential** — stealing them grants immediate account access. The existing audit does not list this as a finding or a remediation. The CSP in `SecurityHeadersFilter` mitigates `script-src` injection but does **not** fully prevent XSS via JSONP-style data exfiltration, DOM-based vulnerabilities, or XSS through unsafe React patterns.

**Recommendation**: If feasible, migrate token storage to **httpOnly, Secure, SameSite=Strict cookies**. This requires adding CSRF protection (double-submit cookie or same-site enforcement). If cookies are not an option, ensure the CSP is as strict as possible and conduct a frontend XSS audit.

---

### 4. IDOR — File Download Without Authorization

**Severity**: Medium
**File**: `backend/src/main/java/com/relay/file/controller/FileController.java:49-64,66-102`

Both the `uploadFile` and `downloadFile` endpoints accept **no `@AuthenticationPrincipal`** — they have no knowledge of who the requesting user is:

```java
@PostMapping("/upload")
public ResponseEntity<FileUploadResponse> uploadFile(@RequestParam("file") MultipartFile file) {
    String fileName = fileStorageService.storeFile(file);
    // ... no user recorded
}

@GetMapping("/{fileName:.+}")
public ResponseEntity<Resource> downloadFile(@PathVariable String fileName, HttpServletRequest request) {
    Resource resource = fileStorageService.loadFileAsResource(fileName);
    // ... no ownership check
}
```

Authentication *is* enforced (the `SecurityConfig` requires a valid JWT for `/api/v1/files/**`), but there is **no authorization check** — any authenticated user can download any file if they know or guess the filename. The filename is a UUID (hard to guess), but there is no file-to-user or file-to-conversation mapping, so there is no way to verify that the downloader is authorized to access the file's contents.

Additionally, the upload endpoint does not record who uploaded the file, making accountability impossible.

**Recommendation**: Add a `files` table (or metadata column) that records the uploader's user ID and the associated conversation ID. Require `@AuthenticationPrincipal` on both endpoints. On download, verify the requesting user is the uploader or a member of the associated conversation.

---

### 5. Access Token Remains Valid After Logout

**Severity**: Medium
**File**: `backend/src/main/java/com/relay/auth/service/AuthService.java:126-130`

The logout endpoint only revokes **refresh tokens** on the server:

```java
@Transactional
public void logout(UserPrincipal principal) {
    refreshTokenRepository.revokeAllByUserId(principal.getId());
    log.info("User logged out: {}", principal.getEmail());
}
```

The **access JWT** (valid for up to 15 minutes) is **not** invalidated. If an access token was stolen via XSS, calling logout on the victim's device does **not** invalidate the stolen token — it remains usable until natural expiration.

This is a known limitation of stateless JWTs, but the application does not implement any server-side revocation mechanism (e.g., a Redis blacklist of revoked JWT IDs).

**Recommendation**: Implement a JWT revocation list (store the `jti` claim or token hash in Redis with the remaining TTL) and check it in `JwtAuthenticationFilter` on every request. Alternatively, reduce access-token TTL to a few minutes with automatic refresh.

---

### 6. Missing Input Validation on Profile Fields

**Severity**: Low
**File**: `backend/src/main/java/com/relay/user/dto/UpdateProfileRequest.java:5-10`

The `avatarUrl` and `status` fields have **no validation annotations**:

```java
public record UpdateProfileRequest(
        @Size(min = 2, max = 100, message = "Name must be between 2 and 100 characters")
        String name,
        String avatarUrl,   // ← no validation
        String status       // ← no validation
) {}
```

While `name` has size validation, `avatarUrl` could be set to a `javascript:` URI or a `data:` URI with an SVG payload. If the frontend renders this in an `<img src={...}>` context without sanitization, it could enable stored XSS. Similarly, `status` could contain arbitrary content including HTML/script payloads.

React mitigates some of these risks by default (e.g., `javascript:` URLs in `src` are sanitized), but `data:` URIs containing SVG are not universally blocked and could bypass the same-origin protections intended by the E2EE design.

**Recommendation**: Add `@URL` or `@Pattern` validation on `avatarUrl` (restrict to `http(s)://` schemes and known image hosts). Add `@Pattern` validation on `status` (alphanumeric/safe characters, max length). Apply the same URL validation on the `name` field to prevent Unicode-based attacks.

---

### 7. Timing Side-Channel on Login

**Severity**: Low
**File**: `backend/src/main/java/com/relay/auth/service/AuthService.java:80-86`

The login flow short-circuits when the user is not found, skipping the password comparison:

```java
User user = userRepository.findByEmail(normalizedEmail).orElse(null);

if (user == null || !passwordEncoder.matches(request.password(), user.getPasswordHash())) {
    // user == null → no Argon2 comparison happens → faster response
    lockoutService.recordFailure(normalizedEmail, resolveClientIp());
    throw ApiException.unauthorized("Invalid email or password");
}
```

When `user == null`, the Argon2 password comparison (which intentionally takes ~100ms with 64 MB memory) is **skipped**, making the response measurably faster than when the user exists. An attacker can distinguish "email not registered" from "wrong password" by measuring response time, enabling **timing-based user enumeration**.

The error message is identical, so this is a passive side-channel — but it is practical over a network with enough samples.

**Recommendation**: Perform a dummy `passwordEncoder.matches()` against a pre-computed Argon2 hash when the user is not found, so the response time is the same regardless of whether the user exists. This constant-time approach prevents timing-based enumeration.

---

### 8. No Audit Logging for Sensitive Operations

**Severity**: Low
**Scope**: `MessageService`, `ConversationService`, `FileController`, `AuthService`

The application only audits **public key changes** (`PublicKeyAuditLog`). The following sensitive operations have **no audit trail**:

- Message **edit** and **delete** — no log entry recording who edited/deleted which message
- **Conversation creation** and **member add/remove** — no log entry
- **File upload and download** — no log entry recording the user, filename, and IP
- **Login success/failure** — only failures are recorded (via `LoginLockoutService`); successful logins are logged at INFO via `log.info` but not persisted to an audit table

For a security-conscious application with E2EE, audit logs are critical for post-incident investigation. If a security event occurs (e.g., unauthorized message deletion), there is no durable record.

**Recommendation**: Create a generic `audit_log` table and an `AuditLogService` that records user ID, action, resource ID, client IP, and timestamp for all sensitive operations. At minimum, log file access, message edits/deletes, and conversation membership changes.

---

### 9. Weak Default Database Password

**Severity**: Low
**File**: `backend/src/main/resources/application.yml:98`

The `postgres` profile contains a hardcoded weak default database password:

```yaml
spring:
  config:
    activate:
      on-profile: postgres
  datasource:
    username: ${DB_USERNAME:relay}
    password: ${DB_PASSWORD:relay_secret}   # ← weak, well-known default
```

While the value is overridable via the `DB_PASSWORD` environment variable, if the env var is not set, the application starts with the trivially-guessable password `relay_secret`. The `dev` profile's seeded users also use `password123`, but that is scoped to the dev profile only.

**Recommendation**: Remove the default value entirely (`${DB_PASSWORD}`) so the application fails fast if the env var is not set. Alternatively, require a minimum password complexity for defaults.

---

### 10. Recipient E2EE Keys Not Validated Against Conversation Membership

**Severity**: Low
**File**: `backend/src/main/java/com/relay/message/service/MessageService.java:111-124`

When a message is sent, the `recipientKeys` map from the request body is stored directly without verifying that the user IDs correspond to actual conversation members:

```java
Map<String, String> recipientKeys = request.recipientKeys();
if (recipientKeys != null && !recipientKeys.isEmpty()) {
    List<MessageRecipientKey> keyEntities = new ArrayList<>();
    for (Map.Entry<String, String> entry : recipientKeys.entrySet()) {
        keyEntities.add(MessageRecipientKey.builder()
                .messageId(message.getId())
                .userId(UUID.fromString(entry.getKey()))   // ← no membership check
                .wrappedKey(entry.getValue())
                .build());
    }
    recipientKeyRepository.saveAll(keyEntities);
}
```

An attacker could inject `recipientKeys` entries for arbitrary user IDs (including non-existent or non-member users). While these keys are cryptographically useless without the matching private key, they create unnecessary database bloat and could be used to:

- Probe which user IDs exist in a conversation (by observing which keys are accepted vs. rejected)
- Cause the response to echo back arbitrary data (the keys are returned in `MessageResponse`)

**Recommendation**: Validate each `recipientKeys` entry's user ID against `ConversationMemberRepository.existsByConversationIdAndUserId()` before persisting. Only accept keys for legitimate conversation members.

---

## Notes on Items Already Hardened

The following were **already addressed** in the prior audit and confirmed correct in this review:

- **JWT secret validation** — `SecurityConfigValidator` enforces 256-bit minimum and rejects the default secret on non-dev profiles ✅
- **Rate limiting with XFF trust** — `RateLimitFilter` only trusts `X-Forwarded-For` from configured proxy CIDRs ✅
- **Argon2id password hashing** — 64 MB, 3 iterations ✅
- **Path traversal protection** — `FileStorageService` uses `Path.startsWith()` confinement ✅
- **Magic-byte verification on uploads** — prevents MIME type spoofing ✅
- **SVG blocked** — not in allowed MIME types or extensions ✅
- **Refresh tokens hashed at rest** — SHA-256, never stored in plaintext ✅
- **TOFU key pinning** with non-dismissible change warnings ✅
- **Security headers** — CSP, X-Frame-Options, HSTS, nosniff ✅
- **CSRF disabled** — correct, since auth is via `Authorization: Bearer` header, not cookies ✅
- **Actuator locked down** — only `health` is public ✅
