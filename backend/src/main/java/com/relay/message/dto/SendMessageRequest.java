package com.relay.message.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.UUID;

public record SendMessageRequest(
        @NotBlank(message = "Content is required")
        @Size(max = 5000, message = "Message must be under 5000 characters")
        String content,

        UUID replyToId,

        @Size(max = 64, message = "Idempotency key must be under 64 characters")
        String idempotencyKey
) {}
