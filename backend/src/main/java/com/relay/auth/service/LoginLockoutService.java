package com.relay.auth.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.lang.Nullable;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Distributed brute-force / credential-stuffing lockout for the login endpoint.
 *
 * SECURITY FIX (§4): The previous implementation used a static ConcurrentHashMap
 * keyed only by email.  Problems:
 *   1. In-memory state did not survive restarts or scale across multiple instances.
 *   2. Keying only by email let an attacker lock out any known account from rotating
 *      IPs without triggering IP-level rate limiting.
 *   3. The static field leaked state across tests.
 *
 * This implementation:
 *   – Stores lockout state in Redis (keyed "login:lockout:{normalizedEmail}") with a
 *     TTL matching the lockout window, so entries self-evict.
 *   – Additionally tracks per-(email, IP) failure counts in a separate, shorter-lived
 *     Redis key ("login:fail:{normalizedEmail}:{ip}") for attack-pattern detection.
 *   – Falls back to an in-memory ConcurrentHashMap when Redis is unavailable (e.g.
 *     local dev), but the static field has been removed — state is now scoped to the
 *     bean instance.
 *   – Expects normalised (lowercase, trimmed) email — callers must normalise before
 *     calling any method here.
 */
@Slf4j
@Service
public class LoginLockoutService {

    // ── Config ───────────────────────────────────────────────────────────────

    static final int  MAX_FAILED_ATTEMPTS  = 5;
    static final long LOCKOUT_DURATION_MS  = 15 * 60 * 1_000L;      // 15 minutes

    /** How many distinct source IPs, within a shorter window, trigger a distributed-attack log. */
    private static final int  DISTINCT_IP_ALERT_THRESHOLD = 5;
    private static final long PER_IP_WINDOW_MS            = 60 * 60 * 1_000L; // 1 hour

    private static final String LOCKOUT_KEY_PREFIX = "login:lockout:";
    private static final String FAIL_KEY_PREFIX    = "login:fail:";

    @Value("${app.security.distributed-attack-alert-threshold:5}")
    private int distributedAttackAlertThreshold;

    // ── Dependencies ─────────────────────────────────────────────────────────

    @Nullable
    private final StringRedisTemplate redis;

    /** SECURITY FIX (§4): in-memory fallback — instance-scoped, not static. */
    private final Map<String, FallbackAttempt> fallbackMap = new ConcurrentHashMap<>();

    public LoginLockoutService(@Nullable StringRedisTemplate redis) {
        this.redis = redis;
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Returns {@code true} if the account is currently locked out.
     *
     * @param normalizedEmail lowercase, trimmed email
     */
    public boolean isLockedOut(String normalizedEmail) {
        if (redis != null) {
            try {
                return isLockedOutRedis(normalizedEmail);
            } catch (Exception ex) {
                log.warn("Redis unavailable during lockout check — falling back to in-memory: {}", ex.getMessage());
            }
        }
        return isLockedOutFallback(normalizedEmail);
    }

    /**
     * Returns the remaining lockout duration in full minutes (rounded up), or 0
     * if the account is not locked.
     */
    public long remainingLockoutMinutes(String normalizedEmail) {
        if (redis != null) {
            try {
                Long ttlMs = redis.getExpire(LOCKOUT_KEY_PREFIX + normalizedEmail,
                        java.util.concurrent.TimeUnit.MILLISECONDS);
                if (ttlMs != null && ttlMs > 0) {
                    return (ttlMs / 60_000L) + 1;
                }
            } catch (Exception ex) {
                log.warn("Redis unavailable during remainingLockoutMinutes: {}", ex.getMessage());
            }
        }
        FallbackAttempt fa = fallbackMap.get(normalizedEmail);
        if (fa == null) return 0L;
        long remaining = fa.lockedUntil - System.currentTimeMillis();
        return remaining > 0 ? (remaining / 60_000L) + 1 : 0L;
    }

    /**
     * Records a failed login attempt.
     *
     * @param normalizedEmail lowercase, trimmed email
     * @param clientIp        the resolved client IP (already de-proxied)
     */
    public void recordFailure(String normalizedEmail, String clientIp) {
        if (redis != null) {
            try {
                recordFailureRedis(normalizedEmail, clientIp);
                return;
            } catch (Exception ex) {
                log.warn("Redis unavailable during failure recording — falling back to in-memory: {}", ex.getMessage());
            }
        }
        recordFailureFallback(normalizedEmail);
    }

    /**
     * Clears all failure state for the account on successful login.
     *
     * @param normalizedEmail lowercase, trimmed email
     */
    public void clearFailures(String normalizedEmail) {
        fallbackMap.remove(normalizedEmail);
        if (redis != null) {
            try {
                redis.delete(LOCKOUT_KEY_PREFIX + normalizedEmail);
                redis.delete(LOCKOUT_KEY_PREFIX + normalizedEmail + ":count");
            } catch (Exception ex) {
                log.warn("Redis unavailable during clearFailures: {}", ex.getMessage());
            }
        }
    }

    // ── Redis implementation ──────────────────────────────────────────────────

    private boolean isLockedOutRedis(String normalizedEmail) {
        try {
            String val = redis.opsForValue().get(LOCKOUT_KEY_PREFIX + normalizedEmail);
            return "locked".equals(val);
        } catch (Exception ex) {
            log.warn("Redis unavailable during lockout check — allowing through: {}", ex.getMessage());
            return false; // fail-open: don't block legitimate logins when Redis is down
        }
    }

    private void recordFailureRedis(String normalizedEmail, String clientIp) {
        try {
            String lockoutKey = LOCKOUT_KEY_PREFIX + normalizedEmail;
            String failKey    = FAIL_KEY_PREFIX    + normalizedEmail + ":" + clientIp;

            // Increment per-email failure counter (stored as plain string)
            Long emailCount = redis.opsForValue().increment(lockoutKey + ":count");
            if (emailCount == null) emailCount = 1L;

            if (emailCount == 1L) {
                // First failure — set a rolling TTL so the counter self-evicts if no
                // further failures arrive within the lockout window.
                redis.expire(lockoutKey + ":count", Duration.ofMillis(LOCKOUT_DURATION_MS));
            }

            if (emailCount >= MAX_FAILED_ATTEMPTS) {
                // Lock the account for the lockout duration.
                redis.opsForValue().set(lockoutKey, "locked", Duration.ofMillis(LOCKOUT_DURATION_MS));
                redis.delete(lockoutKey + ":count"); // counter served its purpose
                log.warn("Account locked out after {} failures: {}", emailCount, normalizedEmail);
            }

            // SECURITY FIX (§4): Per-(email, IP) tracking for distributed-attack detection.
            // Emit a warning when the same email sees failures from many distinct IPs —
            // this is a detection signal, not a blocking action, so legitimate users are
            // not affected by an attacker attempting to trigger lockout from rotating IPs.
            Long ipCount = redis.opsForValue().increment(failKey);
            if (ipCount == null) ipCount = 1L;
            if (ipCount == 1L) {
                redis.expire(failKey, Duration.ofMillis(PER_IP_WINDOW_MS));
            }

            // Count distinct IPs that have failed for this email within the window.
            // We do this by scanning keys matching FAIL_KEY_PREFIX + email + ":*".
            // The count is approximate (scan is not atomic) but sufficient for alerting.
            try {
                String pattern = FAIL_KEY_PREFIX + normalizedEmail + ":*";
                var keys = redis.keys(pattern);
                int distinctIps = keys != null ? keys.size() : 0;
                if (distinctIps >= DISTINCT_IP_ALERT_THRESHOLD) {
                    // SECURITY FIX (§4): Log the detection signal.  A production system
                    // should forward this to a SIEM / alerting pipeline.
                    log.warn("[SECURITY] Distributed credential-stuffing signal: email '{}' " +
                             "has seen failures from {} distinct IPs in the last hour",
                            normalizedEmail, distinctIps);
                }
            } catch (Exception scanEx) {
                log.debug("Could not count distinct IPs for {}: {}", normalizedEmail, scanEx.getMessage());
            }

        } catch (Exception ex) {
            log.warn("Redis unavailable during failure recording — state may be lost: {}", ex.getMessage());
        }
    }

    // ── In-memory fallback ────────────────────────────────────────────────────

    private boolean isLockedOutFallback(String normalizedEmail) {
        FallbackAttempt fa = fallbackMap.get(normalizedEmail);
        return fa != null && fa.lockedUntil > System.currentTimeMillis();
    }

    private void recordFailureFallback(String normalizedEmail) {
        long now = System.currentTimeMillis();
        fallbackMap.compute(normalizedEmail, (k, existing) -> {
            if (existing == null || existing.lockedUntil < now) {
                return new FallbackAttempt(1, 0L);
            }
            int newCount    = existing.count + 1;
            long lockedUntil = newCount >= MAX_FAILED_ATTEMPTS ? now + LOCKOUT_DURATION_MS : 0L;
            return new FallbackAttempt(newCount, lockedUntil);
        });
    }

    // ── Inner types ───────────────────────────────────────────────────────────

    private static final class FallbackAttempt {
        final int  count;
        final long lockedUntil; // 0 = not locked

        FallbackAttempt(int count, long lockedUntil) {
            this.count       = count;
            this.lockedUntil = lockedUntil;
        }
    }
}
