package com.relay.conversation.dto;

import com.relay.conversation.entity.Conversation;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.UUID;

public record CreateConversationRequest(
        @NotNull(message = "Type is required")
        Conversation.ConversationType type,

        @Size(max = 100, message = "Name must be under 100 characters")
        String name,

        @NotNull(message = "Member IDs are required")
        @Size(min = 1, max = 256, message = "Conversations must have 1-256 members")
        List<UUID> memberIds
) {}
