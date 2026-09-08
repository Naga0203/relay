package com.relay.common.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationListener;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.util.Arrays;

/**
 * Validates critical security configuration at application startup.
 *
 * SECURITY FIX (§3): The previous implementation logged an error for the default
 * insecure JWT secret but the throw was commented out, meaning production could boot
 * with a publicly-known signing key.  This version:
 *   – On non-dev/non-test profiles: throws SecurityException → prevents the app from
 *     ever reaching "ready" state and being health-checked as up.
 *   – On dev/test profiles: keeps the warning-only behaviour so local runs don't break.
 */
@Slf4j
@Component
public class SecurityConfigValidator implements ApplicationListener<ApplicationReadyEvent> {

    private static final String DEFAULT_INSECURE_SECRET =
            "change-me-in-production-secret-key-at-least-32-bytes-long";

    /** Profiles that are allowed to run with the default insecure secret (warn only). */
    private static final java.util.Set<String> PERMISSIVE_PROFILES =
            java.util.Set.of("dev", "test");

    @Value("${app.jwt.secret}")
    private String jwtSecret;

    private final Environment environment;

    public SecurityConfigValidator(Environment environment) {
        this.environment = environment;
    }

    @Override
    public void onApplicationEvent(ApplicationReadyEvent event) {
        validateJwtSecret();
    }

    private void validateJwtSecret() {
        // Hard length check — always enforced regardless of profile.
        if (jwtSecret.length() < 32) {
            throw new SecurityException(
                    "JWT secret is too short (" + jwtSecret.length() + " chars). " +
                    "Must be at least 32 characters (256 bits). " +
                    "Set the JWT_SECRET environment variable.");
        }

        if (DEFAULT_INSECURE_SECRET.equals(jwtSecret)) {
            boolean isPermissiveProfile = Arrays.stream(environment.getActiveProfiles())
                    .anyMatch(PERMISSIVE_PROFILES::contains);

            if (isPermissiveProfile) {
                // SECURITY FIX (§3): Warning-only on dev/test — local runs should still work.
                log.warn("╔══════════════════════════════════════════════════════════════╗");
                log.warn("║  SECURITY WARNING: Using default JWT secret (dev/test only) ║");
                log.warn("║  Set JWT_SECRET environment variable before going to prod.  ║");
                log.warn("║  Example: openssl rand -base64 32                           ║");
                log.warn("╚══════════════════════════════════════════════════════════════╝");
            } else {
                // SECURITY FIX (§3): Fatal on any non-dev/non-test profile.
                // Throwing here prevents the context from ever reaching "ready" state,
                // so load balancers and health checks will never route traffic to an
                // instance that is running with a publicly-known signing key.
                log.error("╔══════════════════════════════════════════════════════════════╗");
                log.error("║  FATAL: Default JWT secret detected on a production profile ║");
                log.error("║  Set JWT_SECRET to a cryptographically random 256-bit key.  ║");
                log.error("║  Example: openssl rand -base64 32                           ║");
                log.error("╚══════════════════════════════════════════════════════════════╝");
                throw new SecurityException(
                        "JWT secret must be changed from the default insecure value before " +
                        "running on a non-dev/non-test profile. " +
                        "Set the JWT_SECRET environment variable.");
            }
        }

        log.info("Security configuration validated successfully.");
    }
}
