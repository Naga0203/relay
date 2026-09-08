package com.relay.auth.service;

import com.relay.auth.dto.RegisterRequest;
import com.relay.common.exception.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * SECURITY FIX (§6): Validates that email normalization prevents
 * duplicate accounts with different casing.
 *
 * Register "Foo@Example.com" first, then attempt to register
 * "foo@example.com" — the second should fail with 409 CONFLICT.
 */
@SpringBootTest
@ActiveProfiles("test")
class EmailNormalizationTest {

    @Autowired
    private AuthService authService;

    @Test
    void registrationShouldNormalizeEmailAndRejectDuplicateCasing() {
        String uniqueSuffix = UUID.randomUUID().toString().substring(0, 8);
        String upperEmail = "FooBar" + uniqueSuffix + "@Example.COM";
        String lowerEmail = "foobar" + uniqueSuffix + "@example.com";

        // First registration should succeed.
        var response = authService.register(new RegisterRequest(
                "TestUser1",
                upperEmail,
                "P@ssword123!"
        ));
        assertThat(response).isNotNull();
        assertThat(response.user().email()).isEqualTo(lowerEmail); // stored normalized

        // Second registration with same email (different case) should fail.
        assertThatThrownBy(() ->
                authService.register(new RegisterRequest(
                        "TestUser2",
                        lowerEmail,
                        "P@ssword123!"
                ))
        ).isInstanceOf(ApiException.class)
         .satisfies(ex -> {
             ApiException apiEx = (ApiException) ex;
             assertThat(apiEx.getStatus().value()).isEqualTo(409);
         });
    }
}
