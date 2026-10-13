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
                "testuser1_" + uniqueSuffix,
                upperEmail,
                25,
                "Other",
                "P@ssword123!",
                "P@ssword123!"
        ));
        assertThat(response).isNotNull();
        assertThat(response.user().email()).isEqualTo(lowerEmail); // stored normalized
        assertThat(response.user().accountType()).isEqualTo("MAJOR");

        // Second registration with same email (different case) should fail.
        assertThatThrownBy(() ->
                authService.register(new RegisterRequest(
                        "TestUser2",
                        "testuser2_" + uniqueSuffix,
                        lowerEmail,
                        25,
                        "Other",
                        "P@ssword123!",
                        "P@ssword123!"
                ))
        ).isInstanceOf(ApiException.class)
         .satisfies(ex -> {
             ApiException apiEx = (ApiException) ex;
             assertThat(apiEx.getStatus().value()).isEqualTo(409);
         });
    }

    @Test
    void registrationShouldDeriveMinorAccountWhenAgeUnder18() {
        String uniqueSuffix = UUID.randomUUID().toString().substring(0, 8);
        var response = authService.register(new RegisterRequest(
                "MinorUser",
                "minor_" + uniqueSuffix,
                "minor_" + uniqueSuffix + "@example.com",
                16,
                "Female",
                "P@ssword123!",
                "P@ssword123!"
        ));
        assertThat(response.user().accountType()).isEqualTo("MINOR");
    }

    @Test
    void registrationShouldRejectPasswordMismatch() {
        String uniqueSuffix = UUID.randomUUID().toString().substring(0, 8);
        assertThatThrownBy(() ->
                authService.register(new RegisterRequest(
                        "UserMismatch",
                        "mismatch_" + uniqueSuffix,
                        "mismatch_" + uniqueSuffix + "@example.com",
                        20,
                        "Male",
                        "P@ssword123!",
                        "DifferentPassword123!"
                ))
        ).isInstanceOf(ApiException.class)
         .satisfies(ex -> {
             ApiException apiEx = (ApiException) ex;
             assertThat(apiEx.getStatus().value()).isEqualTo(400);
         });
    }

    @Test
    void registrationShouldRejectDuplicateUsername() {
        String uniqueSuffix = UUID.randomUUID().toString().substring(0, 8);
        String username = "samename_" + uniqueSuffix;
        authService.register(new RegisterRequest(
                "UserA",
                username,
                "userA_" + uniqueSuffix + "@example.com",
                22,
                "Non-binary",
                "P@ssword123!",
                "P@ssword123!"
        ));

        assertThatThrownBy(() ->
                authService.register(new RegisterRequest(
                        "UserB",
                        username.toUpperCase(), // case-insensitive check
                        "userB_" + uniqueSuffix + "@example.com",
                        22,
                        "Non-binary",
                        "P@ssword123!",
                        "P@ssword123!"
                ))
        ).isInstanceOf(ApiException.class)
         .satisfies(ex -> {
             ApiException apiEx = (ApiException) ex;
             assertThat(apiEx.getStatus().value()).isEqualTo(409);
         });
    }
}
