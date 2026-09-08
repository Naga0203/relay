package com.relay.common.config;

import org.junit.jupiter.api.Test;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * SECURITY FIX (§3): Validates that the application refuses to start on a
 * non-dev profile when the JWT secret is the default placeholder value.
 *
 * SecurityConfigValidator runs as a @PostConstruct bean and throws a
 * SecurityException if the secret matches the default and the active
 * profile is not "dev" or "test".
 */
class SecurityConfigValidatorTest {

    /**
     * Booting with profile=prod and the default JWT secret should fail with
     * a SecurityException at startup.
     *
     * We test this by creating a SpringApplication programmatically and
     * asserting that it throws on run().  We do NOT use @SpringBootTest here
     * because the context is expected to fail — @SpringBootTest would
     * interpret that as a test infrastructure error.
     */
    @Test
    void applicationShouldFailOnProdProfileWithDefaultSecret() {
        SpringApplication app = new SpringApplication(
                com.relay.RelayApplication.class
        );

        // Override to 'prod' profile and keep the default JWT secret.
        assertThatThrownBy(() ->
                app.run(
                        "--spring.profiles.active=prod",
                        "--app.jwt.secret=change-me-in-production-secret-key-at-least-32-bytes-long",
                        "--spring.main.web-application-type=none",  // don't start server
                        "--spring.data.redis.host=localhost"         // avoid Redis noise
                )
        ).isInstanceOf(SecurityException.class)
         .hasMessageContaining("JWT secret");
    }
}
