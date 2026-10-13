package com.relay.auth.dto;

import com.fasterxml.jackson.annotation.JsonAlias;
import jakarta.validation.constraints.NotBlank;

public record LoginRequest(
        @NotBlank(message = "Email or username is required")
        @JsonAlias({"emailOrUsername", "username"})
        String email,

        @NotBlank(message = "Password is required")
        String password
) {}
