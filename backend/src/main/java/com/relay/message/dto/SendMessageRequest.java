package com.relay.message.dto;

import com.relay.message.entity.Message.MessageType;
import jakarta.validation.constraints.Size;

import java.util.UUID;

public record SendMessageRequest(
        @Size(max = 5000, message = "Message must be under 5000 characters")
        String content,

        MessageType messageType,

        UUID replyToId,

        @Size(max = 64, message = "Idempotency key must be under 64 characters")
        String idempotencyKey
) {}

