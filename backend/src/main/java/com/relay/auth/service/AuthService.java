package com.relay.auth.service;

import com.relay.auth.dto.*;
import com.relay.auth.entity.RefreshToken;
import com.relay.auth.repository.RefreshTokenRepository;
import com.relay.auth.security.JwtTokenProvider;
import com.relay.auth.security.UserPrincipal;
import com.relay.auth.util.RefreshTokenHashUtil;
import com.relay.common.exception.ApiException;
import com.relay.user.dto.UserResponse;
import com.relay.user.entity.User;
import com.relay.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.Locale;

@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final JwtTokenProvider tokenProvider;
    private final PasswordEncoder passwordEncoder;

    // SECURITY FIX (§4): Lockout logic extracted to LoginLockoutService (Redis-backed).
    // The old static ConcurrentHashMap field has been removed entirely.
    private final LoginLockoutService lockoutService;

    // ── Register ──────────────────────────────────────────────────────────────

    @Transactional
    public AuthResponse register(RegisterRequest request) {
        if (!request.password().equals(request.confirmPassword())) {
            throw ApiException.badRequest("Passwords do not match");
        }

        String normalizedEmail = request.email().trim().toLowerCase(Locale.ROOT);
        if (userRepository.existsByEmail(normalizedEmail)) {
            throw ApiException.conflict("Email already registered");
        }

        String normalizedUsername = request.username().trim().toLowerCase(Locale.ROOT);
        if (userRepository.existsByUsernameIgnoreCase(normalizedUsername)) {
            throw ApiException.conflict("Username already exists");
        }

        int age = request.age();
        if (age < 1 || age > 125) {
            throw ApiException.badRequest("Please enter a valid age");
        }
        String accountType = (age < 18) ? "MINOR" : "MAJOR";

        User user = User.builder()
                .name(request.name().trim())
                .username(normalizedUsername)
                .email(normalizedEmail)
                .age(age)
                .gender(request.gender().trim())
                .accountType(accountType)
                .passwordHash(passwordEncoder.encode(request.password()))
                .build();

        user = userRepository.save(user);
        log.info("User registered: {} (@{}, {})", normalizedEmail, normalizedUsername, accountType);

        return createAuthResponse(user);
    }

    // ── Login ─────────────────────────────────────────────────────────────────

    @Transactional
    public AuthResponse login(LoginRequest request) {
        String normalizedIdentifier = request.email().trim().toLowerCase(Locale.ROOT);

        // SECURITY FIX (§4): Distributed lockout check via Redis-backed service.
        if (lockoutService.isLockedOut(normalizedIdentifier)) {
            long minutesLeft = lockoutService.remainingLockoutMinutes(normalizedIdentifier);
            throw ApiException.forbidden(
                    "Account locked due to multiple failed login attempts. " +
                    "Try again in " + minutesLeft + " minutes.");
        }

        User user = userRepository.findByEmailOrUsername(normalizedIdentifier).orElse(null);

        if (user == null || !passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            // SECURITY FIX (§4): Record failure with client IP for distributed-attack detection.
            lockoutService.recordFailure(normalizedIdentifier, resolveClientIp());
            throw ApiException.unauthorized("Invalid email or password");
        }

        // Reset failure state on successful login.
        lockoutService.clearFailures(normalizedIdentifier);

        log.info("User logged in: {}", user.getEmail());
        return createAuthResponse(user);
    }

    // ── Refresh ───────────────────────────────────────────────────────────────

    @Transactional
    public AuthResponse refreshToken(TokenRefreshRequest request) {
        // SECURITY FIX (§11): Hash the incoming raw token before the DB lookup —
        // the token column stores SHA-256 hashes, never raw values.
        String tokenHash = RefreshTokenHashUtil.hash(request.refreshToken());

        RefreshToken refreshToken = refreshTokenRepository
                .findByTokenHashAndRevokedFalse(tokenHash)
                .orElseThrow(() -> ApiException.unauthorized("Invalid refresh token"));

        if (refreshToken.isExpired()) {
            refreshToken.setRevoked(true);
            refreshTokenRepository.save(refreshToken);
            throw ApiException.unauthorized("Refresh token expired");
        }

        // Revoke old token (rotation).
        refreshToken.setRevoked(true);
        refreshTokenRepository.save(refreshToken);

        User user = refreshToken.getUser();
        if (userRepository.findById(user.getId()).isEmpty()) {
            throw ApiException.unauthorized("User account no longer exists");
        }
        return createAuthResponse(user);
    }

    // ── Logout ────────────────────────────────────────────────────────────────

    @Transactional
    public void logout(UserPrincipal principal) {
        refreshTokenRepository.revokeAllByUserId(principal.getId());
        log.info("User logged out: {}", principal.getEmail());
    }

    // ── Current user ──────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public UserResponse getCurrentUser(UserPrincipal principal) {
        User user = userRepository.findById(principal.getId())
                .orElseThrow(() -> ApiException.notFound("User", principal.getId()));
        return UserResponse.from(user);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private AuthResponse createAuthResponse(User user) {
        String accessToken       = tokenProvider.generateAccessToken(user.getId(), user.getEmail());
        String refreshTokenValue = tokenProvider.generateRefreshTokenValue();

        // SECURITY FIX (§11): Store only the SHA-256 hash of the raw token, never the
        // raw value itself.  The raw value is returned to the client and never touches
        // the DB, so a DB read gives an attacker only an unusable hash.
        RefreshToken refreshToken = RefreshToken.builder()
                .user(user)
                .tokenHash(RefreshTokenHashUtil.hash(refreshTokenValue))
                .expiresAt(Instant.now().plusMillis(tokenProvider.getRefreshTokenExpirationMs()))
                .build();
        refreshTokenRepository.save(refreshToken);

        return new AuthResponse(accessToken, refreshTokenValue, UserResponse.from(user));
    }

    /**
     * Extracts the client IP from the current request context.
     * Returns "unknown" when called outside a request scope (e.g. tests).
     */
    private String resolveClientIp() {
        try {
            ServletRequestAttributes attrs =
                    (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
            if (attrs == null) return "unknown";
            HttpServletRequest req = attrs.getRequest();
            // NOTE: This is the raw remote addr.  RateLimitFilter has already done the
            // trusted-proxy XFF resolution for rate limiting; here we want the actual
            // TCP peer for the per-(email,IP) failure log stored in Redis.
            return req.getRemoteAddr();
        } catch (Exception ex) {
            return "unknown";
        }
    }
}
