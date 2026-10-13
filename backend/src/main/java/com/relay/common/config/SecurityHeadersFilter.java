package com.relay.common.config;

import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.io.IOException;

/**
 * Security headers filter applied to all HTTP responses.
 * Mitigates: Clickjacking, MIME sniffing, XSS, information leakage.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class SecurityHeadersFilter implements Filter {

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {

        HttpServletResponse httpResponse = (HttpServletResponse) response;

        // Prevent clickjacking
        httpResponse.setHeader("X-Frame-Options", "DENY");

        // Prevent MIME type sniffing
        httpResponse.setHeader("X-Content-Type-Options", "nosniff");

        // XSS protection (legacy, CSP is primary defense)
        httpResponse.setHeader("X-XSS-Protection", "1; mode=block");

        // Referrer policy — minimize information leakage
        httpResponse.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

        // Permissions policy — disable unnecessary browser features
        httpResponse.setHeader("Permissions-Policy",
                "camera=(), microphone=(), geolocation=(), payment=()");

        // Content Security Policy
        // ARCH FIX (§12a): Added https://api.giphy.com to connect-src so that the GifPicker
        // live-search fetch() is not silently blocked by the browser.  Previously connect-src
        // was 'self' only, meaning the Giphy API call was rejected and the picker always fell
        // back to the 12 preset GIFs — misleading and undocumented.
        // The backend HTTP header takes precedence over the <meta> CSP tag in most browsers
        // when both are present on the same response; keep them in sync (see index.html).
        httpResponse.setHeader("Content-Security-Policy",
                "default-src 'self'; " +
                "script-src 'self'; " +
                "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
                "font-src 'self' https://fonts.gstatic.com; " +
                "img-src 'self' data: blob: http://localhost:8080 https://*.giphy.com; " +
                "connect-src 'self' http://localhost:8080 ws: wss: https://api.giphy.com; " +
                "frame-ancestors 'none'; " +
                "base-uri 'self'; " +
                "form-action 'self'");

        // HSTS — enforce HTTPS (only effective over TLS, but safe to always set)
        httpResponse.setHeader("Strict-Transport-Security",
                "max-age=31536000; includeSubDomains");

        chain.doFilter(request, response);
    }
}
