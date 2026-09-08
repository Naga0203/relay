package com.relay.user.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record PublicKeyRequest(
        @NotBlank(message = "Public key is required")
        @Size(max = 2000, message = "Public key must be under 2000 characters")
        String publicKey
) {}
