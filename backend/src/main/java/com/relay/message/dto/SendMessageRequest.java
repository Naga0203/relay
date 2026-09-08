package com.relay.message.dto;

import com.relay.message.entity.Message.MessageType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.Map;
import java.util.UUID;

public record SendMessageRequest(
        @NotBlank(message = "Message content is required")
        @Size(max = 10000, message = "Message must be under 10000 characters")
        String content,

        MessageType messageType,

        UUID replyToId,

        @Size(max = 64, message = "Idempotency key must be under 64 characters")
        String idempotencyKey,

        // ARCH FIX (§9): Per-recipient wrapped message keys for group E2EE.
        // Map of userId → base64-encoded wrapped per-message AES key.
        // Nullable for backward compatibility with older clients in DIRECT chats.
        Map<String, String> recipientKeys
) {}

