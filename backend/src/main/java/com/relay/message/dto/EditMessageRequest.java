package com.relay.message.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record EditMessageRequest(
        @NotBlank(message = "Content is required")
        @Size(max = 5000, message = "Message must be under 5000 characters")
        String content
) {}
