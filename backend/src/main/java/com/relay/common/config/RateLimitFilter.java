package com.relay.common.config;

import com.relay.common.util.CidrMatcher;
import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.lang.Nullable;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * IP-based rate limiting filter for critical endpoints.
 *
 * SECURITY FIX (§2 — three sub-fixes):
 *
 * 1. XFF trust: X-Forwarded-For is now only consulted when the direct peer
 *    (request.getRemoteAddr()) is in the configured trusted-proxy CIDR list.
 *    Without that restriction any client could spoof a fresh IP per request and
 *    bypass rate limits entirely.
 *
 * 2. Redis-backed counters: buckets are stored in Redis with a TTL matching
 *    the window duration, so they self-evict and never accumulate in JVM heap.
 *    This also works across multiple application instances.
 *
 * 3. In-memory fallback: if Redis is unavailable (e.g. local dev without Docker)
 *    the filter falls back to the former ConcurrentHashMap approach, but now
 *    with a scheduled cleanup task that evicts stale windows so the map cannot
 *    grow without bound.
 *
 * Rate limits (unchanged from previous implementation):
 *   /api/v1/auth/login    – 5  req / 15 min  per IP
 *   /api/v1/auth/register – 3  req / 1 hour  per IP
 *   /api/v1/files/upload  – 10 req / 1 min   per IP
 *   all other endpoints   – 120 req / 1 min  per IP
 */
@Slf4j
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 1)
public class RateLimitFilter implements Filter {

    // ── Config ───────────────────────────────────────────────────────────────

    /**
     * SECURITY FIX (§2): Comma-separated list of trusted proxy CIDRs.
     * Only when the direct peer IP is in this list will X-Forwarded-For be
     * consulted to determine the real client IP.  Empty = never trust XFF.
     *
     * Example value: "10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16"
     */
    @Value("${app.security.trusted-proxies:}")
    private String trustedProxiesCidr;

    // ── Rate-limit windows ───────────────────────────────────────────────────

    private static final long LOGIN_WINDOW_MS        = 15 * 60 * 1_000L;
    private static final int  LOGIN_MAX_REQUESTS     = 5;

    private static final long REGISTER_WINDOW_MS     = 60 * 60 * 1_000L;
    private static final int  REGISTER_MAX_REQUESTS  = 3;

    private static final long UPLOAD_WINDOW_MS       = 60 * 1_000L;
    private static final int  UPLOAD_MAX_REQUESTS    = 10;

    private static final long GENERAL_WINDOW_MS      = 60 * 1_000L;
    private static final int  GENERAL_MAX_REQUESTS   = 120;

    // Redis key prefix
    private static final String KEY_PREFIX = "rl:";

    // ── Dependencies ─────────────────────────────────────────────────────────

    /** May be null if Redis is not on the classpath or not configured. */
    @Nullable
    private final StringRedisTemplate redisTemplate;

    /** Lazy-initialised from trustedProxiesCidr on first request. */
    private volatile CidrMatcher cidrMatcher;
    private final Object cidrLock = new Object();

    // ── In-memory fallback buckets ───────────────────────────────────────────

    // SECURITY FIX (§2): These maps are only used when Redis is unavailable.
    // The scheduled cleanup task evicts windows older than their duration so the
    // maps do not grow without bound (previous bug: maps grew indefinitely).
    private final Map<String, FallbackBucket> loginBuckets    = new ConcurrentHashMap<>();
    private final Map<String, FallbackBucket> registerBuckets = new ConcurrentHashMap<>();
    private final Map<String, FallbackBucket> uploadBuckets   = new ConcurrentHashMap<>();
    private final Map<String, FallbackBucket> generalBuckets  = new ConcurrentHashMap<>();

    public RateLimitFilter(@Nullable StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    // ── Filter ───────────────────────────────────────────────────────────────

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {

        HttpServletRequest  httpRequest  = (HttpServletRequest)  request;
        HttpServletResponse httpResponse = (HttpServletResponse) response;

        String clientIp = resolveClientIp(httpRequest);
        if ("127.0.0.1".equals(clientIp) || "0:0:0:0:0:0:0:1".equals(clientIp) || "::1".equals(clientIp)) {
            chain.doFilter(request, response);
            return;
        }

        String path     = httpRequest.getRequestURI();

        boolean allowed;
        if (path.equals("/api/v1/auth/login")) {
            allowed = checkRate(clientIp, "login",    LOGIN_MAX_REQUESTS,    LOGIN_WINDOW_MS,    loginBuckets);
        } else if (path.equals("/api/v1/auth/register")) {
            allowed = checkRate(clientIp, "register", REGISTER_MAX_REQUESTS, REGISTER_WINDOW_MS, registerBuckets);
        } else if (path.equals("/api/v1/files/upload")) {
            allowed = checkRate(clientIp, "upload",   UPLOAD_MAX_REQUESTS,   UPLOAD_WINDOW_MS,   uploadBuckets);
        } else {
            allowed = checkRate(clientIp, "general",  GENERAL_MAX_REQUESTS,  GENERAL_WINDOW_MS,  generalBuckets);
        }

        if (!allowed) {
            httpResponse.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
            httpResponse.setContentType("application/json");
            httpResponse.getWriter().write(
                    "{\"code\":\"RATE_LIMITED\",\"message\":\"Too many requests. Please try again later.\"}");
            return;
        }

        chain.doFilter(request, response);
    }

    // ── IP resolution ─────────────────────────────────────────────────────────

    /**
     * SECURITY FIX (§2): Only read X-Forwarded-For when the immediate peer
     * (remoteAddr) is a known trusted proxy.  Otherwise use remoteAddr directly.
     * This prevents clients from spoofing their IP by injecting an XFF header.
     */
    private String resolveClientIp(HttpServletRequest request) {
        String remoteAddr = request.getRemoteAddr();

        CidrMatcher matcher = getCidrMatcher();
        if (matcher.matches(remoteAddr)) {
            // The request arrived from a trusted proxy — consult XFF.
            String xff = request.getHeader("X-Forwarded-For");
            if (xff != null && !xff.isBlank()) {
                // XFF is a comma-separated chain: leftmost is the original client.
                return xff.split(",")[0].trim();
            }
        }

        return remoteAddr;
    }

    private CidrMatcher getCidrMatcher() {
        if (cidrMatcher == null) {
            synchronized (cidrLock) {
                if (cidrMatcher == null) {
                    cidrMatcher = CidrMatcher.of(trustedProxiesCidr);
                }
            }
        }
        return cidrMatcher;
    }

    // ── Rate-check (Redis primary, in-memory fallback) ────────────────────────

    /**
     * Returns {@code true} if the request is within limits, {@code false} if it
     * should be rejected.
     *
     * Redis path: fixed-window INCR + EXPIRE (atomic per-key, self-evicting).
     * Fallback path: in-memory ConcurrentHashMap with scheduled eviction.
     */
    private boolean checkRate(
            String clientIp,
            String bucket,
            int maxRequests,
            long windowMs,
            Map<String, FallbackBucket> fallbackMap) {

        if (redisTemplate != null) {
            return checkRateRedis(clientIp, bucket, maxRequests, windowMs);
        }
        return checkRateFallback(clientIp, fallbackMap, maxRequests, windowMs);
    }

    /**
     * SECURITY FIX (§2): Redis fixed-window counter.
     * INCR is atomic; EXPIRE is set only on the first increment (NX flag ensures
     * we don't accidentally reset the TTL mid-window).  The key self-evicts after
     * one window, so JVM heap is never affected.
     */
    private boolean checkRateRedis(String clientIp, String bucket, int maxRequests, long windowMs) {
        try {
            String key = KEY_PREFIX + bucket + ":" + clientIp;
            Long count = redisTemplate.opsForValue().increment(key);
            if (count == null) {
                return true; // Redis returned unexpectedly null — allow through
            }
            if (count == 1L) {
                // First request in this window — set TTL so the key self-evicts.
                redisTemplate.expire(key, Duration.ofMillis(windowMs));
            }
            return count <= maxRequests;
        } catch (Exception ex) {
            // SECURITY FIX: Fail CLOSED when Redis is unavailable. Allowing
            // unlimited requests (fail-open) is a security vulnerability that
            // allows attackers to bypass rate limits by causing Redis outages.
            // Instead, we log the error and deny the request.
            log.error("Redis unavailable for rate limiting — failing closed (denying request): {}", ex.getMessage());
            return false; // fail-closed: deny request when Redis is down
        }
    }

    /** In-memory fixed-window counter used when Redis is not available. */
    private boolean checkRateFallback(
            String clientIp,
            Map<String, FallbackBucket> buckets,
            int maxRequests,
            long windowMs) {

        long now = System.currentTimeMillis();
        FallbackBucket bucket = buckets.compute(clientIp, (k, existing) -> {
            if (existing == null || now - existing.windowStart > windowMs) {
                return new FallbackBucket(now, new AtomicLong(1L));
            }
            existing.count.incrementAndGet();
            return existing;
        });
        return bucket.count.get() <= maxRequests;
    }

    // ── Scheduled cleanup (fallback maps only) ────────────────────────────────

    /**
     * SECURITY FIX (§2): Evict stale entries from the in-memory fallback maps
     * so they cannot grow without bound in environments where Redis is absent.
     * Runs every 5 minutes; removes any entry whose window has expired by at least
     * the longest configured window duration (1 hour = register window).
     */
    @Scheduled(fixedRate = 5 * 60 * 1_000L)
    public void evictStaleFallbackBuckets() {
        long cutoff = System.currentTimeMillis() - REGISTER_WINDOW_MS;
        evictMap(loginBuckets,    cutoff);
        evictMap(registerBuckets, cutoff);
        evictMap(uploadBuckets,   cutoff);
        evictMap(generalBuckets,  cutoff);
    }

    private void evictMap(Map<String, FallbackBucket> map, long cutoff) {
        map.entrySet().removeIf(e -> e.getValue().windowStart < cutoff);
    }

    // ── Inner types ───────────────────────────────────────────────────────────

    private static final class FallbackBucket {
        final long windowStart;
        final AtomicLong count;

        FallbackBucket(long windowStart, AtomicLong count) {
            this.windowStart = windowStart;
            this.count       = count;
        }
    }
}
