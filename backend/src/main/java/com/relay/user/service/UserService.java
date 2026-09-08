package com.relay.user.service;

import com.relay.auth.security.UserPrincipal;
import com.relay.common.exception.ApiException;
import com.relay.user.dto.UpdateProfileRequest;
import com.relay.user.dto.UserResponse;
import com.relay.user.dto.UserSearchResponse;
import com.relay.user.entity.PublicKeyAuditLog;
import com.relay.user.entity.User;
import com.relay.user.repository.PublicKeyAuditLogRepository;
import com.relay.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import org.springframework.web.server.ResponseStatusException;

import jakarta.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;
    private final PublicKeyAuditLogRepository auditLogRepository;

    /** SECURITY FIX (§8): Maximum key changes allowed per rate-limit window. */
    private static final int  KEY_CHANGE_RATE_LIMIT  = 1;
    /** SECURITY FIX (§8): Rate-limit window duration for key changes (1 hour). */
    private static final long KEY_CHANGE_WINDOW_SECS = 3600L;

    @Transactional(readOnly = true)
    public UserResponse getUserById(UUID id) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("User", id));
        return UserResponse.from(user);
    }

    @Transactional
    public UserResponse updateProfile(UserPrincipal principal, UpdateProfileRequest request) {
        User user = userRepository.findById(principal.getId())
                .orElseThrow(() -> ApiException.notFound("User", principal.getId()));

        if (request.name() != null) {
            user.setName(request.name());
        }
        if (request.avatarUrl() != null) {
            user.setAvatarUrl(request.avatarUrl());
        }
        if (request.status() != null) {
            user.setStatus(request.status());
        }

        user = userRepository.save(user);
        return UserResponse.from(user);
    }

    @Transactional(readOnly = true)
    public List<UserSearchResponse> searchUsers(String query) {
        return userRepository.searchByNameOrEmail(query, PageRequest.of(0, 20)).stream()
                .map(UserSearchResponse::from)
                .toList();
    }

    /**
     * SECURITY FIX (§8): Updates the user's ECDH public key with rate-limiting and
     * an audit log entry.
     *
     * Rate limit: at most {@value KEY_CHANGE_RATE_LIMIT} change per {@value KEY_CHANGE_WINDOW_SECS}
     * seconds (1 per hour).  This does not prevent a malicious server operator from
     * bypassing the DB directly, but it:
     *   1. Slows automated key-swap attacks through a compromised account.
     *   2. Creates a forensic trail (old/new key hash, timestamp, IP) for post-incident audit.
     */
    @Transactional
    public void updatePublicKey(UserPrincipal principal, String newPublicKey) {
        User user = userRepository.findById(principal.getId())
                .orElseThrow(() -> ApiException.notFound("User", principal.getId()));

        // Rate-limit check.
        Instant windowStart = Instant.now().minusSeconds(KEY_CHANGE_WINDOW_SECS);
        long recentChanges  = auditLogRepository.countByUserIdSince(principal.getId(), windowStart);
        if (recentChanges >= KEY_CHANGE_RATE_LIMIT) {
            log.warn("[SECURITY] Key-upload rate limit hit for user {}", principal.getId());
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Public key can only be changed once per hour. Please try again later.");
        }

        String oldKeyHash = user.getPublicKey() != null ? sha256Hex(user.getPublicKey()) : null;
        String newKeyHash = sha256Hex(newPublicKey);

        // Persist the new key.
        user.setPublicKey(newPublicKey);
        userRepository.save(user);

        // Write audit record.
        PublicKeyAuditLog auditEntry = PublicKeyAuditLog.builder()
                .user(user)
                .oldKeyHash(oldKeyHash)
                .newKeyHash(newKeyHash)
                .clientIp(resolveClientIp())
                .build();
        auditLogRepository.save(auditEntry);

        if (oldKeyHash != null) {
            log.info("[SECURITY] Public key changed for user {} — old hash: {}, new hash: {}, ip: {}",
                    principal.getId(), oldKeyHash, newKeyHash, auditEntry.getClientIp());
        } else {
            log.info("[SECURITY] Public key first-upload for user {} — key hash: {}, ip: {}",
                    principal.getId(), newKeyHash, auditEntry.getClientIp());
        }
    }

    @Transactional(readOnly = true)
    public String getPublicKey(UUID userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> ApiException.notFound("User", userId));
        return user.getPublicKey();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static String sha256Hex(String input) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(64);
            for (byte b : digest) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 not available", e);
        }
    }

    private String resolveClientIp() {
        try {
            ServletRequestAttributes attrs =
                    (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
            if (attrs == null) return "unknown";
            HttpServletRequest req = attrs.getRequest();
            return req.getRemoteAddr();
        } catch (Exception ex) {
            return "unknown";
        }
    }
}
