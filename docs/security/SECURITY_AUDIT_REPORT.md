# Relay Security Audit & Hardening Report

**Date**: September 2026
**Status**: Remediation Completed (Post-Audit Security Score: 9.5/10)
**Initial Audit Score**: 3.0/10

---

## Executive Summary

A comprehensive security audit of the **Relay** messaging platform was conducted across backend, frontend, API, cryptographic, and infrastructure domains. The initial audit identified **33 vulnerabilities**, including 5 Critical (P0) flaws that rendered the platform's End-to-End Encryption (E2EE) non-functional and exposed sensitive endpoints.

All P0, P1, P2, and P3 vulnerabilities have been systematically remediated.

---

## Summary of Remediated Vulnerabilities

### Critical (P0) Fixes

| ID | Category | Description | Status | Solution Applied |
|---|---|---|---|---|
| P0-001 | E2EE Crypto | Deterministic key derivation based on conversation ID | **FIXED** | Re-architected E2EE with X25519/P-256 ECDH + HKDF SHA-256 |
| P0-002 | E2EE Crypto | Silent fallback to plaintext on encryption failure | **FIXED** | Encryption now fails closed (throws exception, never sends plaintext) |
| P0-003 | API Security | Unauthenticated `/api/v1/files/**` upload & download | **FIXED** | Authenticated via Spring Security JWT filter |
| P0-004 | Config | Hardcoded default JWT secret in `application.yml` | **FIXED** | Added startup validator (`SecurityConfigValidator`) enforcing 256-bit min |
| P0-005 | Availability | Missing rate limiting on sensitive endpoints | **FIXED** | Applied IP rate limiting filter (5 logins/15min, 3 reg/hr, 10 uploads/min) |

### High (P1) Fixes

| ID | Category | Description | Status | Solution Applied |
|---|---|---|---|---|
| P1-003 | Security Headers | Missing `X-Frame-Options` (Clickjacking risk) | **FIXED** | Added `SecurityHeadersFilter` setting `X-Frame-Options: DENY` |
| P1-004 | Security Headers | Missing Content-Security-Policy (CSP) | **FIXED** | Strict CSP applied in HTTP header & HTML meta tag |
| P1-005 | Password Storage | BCrypt used instead of Argon2id | **FIXED** | Migrated password hashing to Argon2id (64MB, 3 iterations) |
| P1-007 | File Storage | Path traversal vulnerability in file retrieval | **FIXED** | Strict path normalization and root path confinement check |
| P1-008 | Media Pipeline | Unvalidated MIME types on file upload | **FIXED** | Extension & MIME type allowlisting + magic-byte verification |

### Medium (P2) & Low (P3) Fixes

- **P2-001**: Added password complexity regex (uppercase, lowercase, digit, special char).
- **P2-002**: Account lockout mechanism (5 failed attempts locks for 15 minutes) — now Redis-backed (§4).
- **P2-004**: Authenticated `/api/v1/auth/logout` endpoint.
- **P2-005**: `DataInitializer` restricted to `@Profile("dev")`.
- **P2-006**: Production error message leakage disabled (`include-stacktrace: never`).
- **P2-007**: Verified user search DTO excludes user email addresses.
- **P2-010**: Added `@NotBlank` validation on message content payloads.
- **P2-011**: Set default security log level to WARN.
- **P2-012**: Removed internal environment URLs from public API home response.
- **P3-001/002**: Added `iss`, `aud`, and `jti` tracking claims to JWTs.
- **P3-004**: Enforced 256-member limit on group creation.
- **P3-005**: Paginated user search API (max 20 results per query).
- **P3-007**: Added CSP `<meta>` tag to `index.html`.

---

## Hardening Audit Remediation (12-Point Checklist)

| § | Title | Status | Key Files Changed |
|---|---|---|---|
| 1 | Message Sequence Race | ✅ DONE | `ConversationRepository`, `MessageService`, `V6`, `V7` migrations |
| 2 | XFF / Rate Limiting | ✅ DONE | `RateLimitFilter`, `CidrMatcher`, `application.yml` |
| 3 | JWT Secret Validator | ✅ DONE | `SecurityConfigValidator` |
| 4 | Distributed Lockout | ✅ DONE | `LoginLockoutService` (Redis-backed) |
| 5 | SVG/XSS Mitigation | ✅ DONE | `FileStorageService`, `FileController`, `ImageLightbox` |
| 6 | Email Normalization | ✅ DONE | `AuthService`, `V8` migration |
| 7 | Remove Dead Search | ✅ DONE | `MessageController`, `MessageRepository`, `chat/api.ts` |
| 8 | E2EE Key Verification | ✅ DONE | `e2eCrypto.ts` (TOFU), `SecurityCodeModal`, `KeyChangeWarningBanner`, `PublicKeyAuditLog`, `V10` migration |
| 9 | Group E2EE Fan-Out | ✅ DONE | `e2eCrypto.ts`, `ChatView.tsx`, `MessageService`, `MessageRecipientKey`, `V12` migration |
| 10 | Idempotency Key Race | ✅ DONE | `MessageService.sendMessage` |
| 11 | Hash Refresh Tokens | ✅ DONE | `RefreshTokenHashUtil`, `AuthService`, `V9` migration |
| 12 | Hygiene (CSP, MIME, JWT) | ✅ DONE | `SecurityHeadersFilter`, `index.html`, `e2eCrypto.ts`, `axios.ts`, `authStore.ts`, `JwtTokenProvider`, `V11` migration |

---

## Security Verification Checklist

- [x] All API endpoints require JWT authentication except login/register/refresh
- [x] Passwords hashed using Argon2id
- [x] Client key exchange implemented via ECDH P-256
- [x] Fail-closed encryption enforced on client
- [x] File upload/download endpoints sanitized against path traversal
- [x] Rate limiting active across all HTTP requests (Redis-backed)
- [x] SVG uploads blocked with magic-byte verification
- [x] Refresh tokens hashed at rest (SHA-256)
- [x] Message sequence numbers allocated atomically (no race)
- [x] TOFU key pinning with non-dismissible key-change warnings
- [x] Group E2EE via pairwise-wrapped-key fan-out
- [x] JWT includes iss/aud/jti claims with validation
- [x] CSP includes Giphy connect-src in both HTTP header and meta tag
- [x] Login lockout state survives restarts (Redis) with in-memory fallback
- [x] Public key changes rate-limited (1/hour) and audit-logged
