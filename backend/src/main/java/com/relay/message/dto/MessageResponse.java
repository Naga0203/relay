package com.relay.message.dto;

import com.relay.message.entity.Message;

import java.time.Instant;
import java.util.UUID;

public record MessageResponse(
        UUID id,
        UUID conversationId,
        UUID senderId,
        String senderName,
        String senderAvatarUrl,
        String content,
        Message.MessageType messageType,
        Long sequenceNumber,
        UUID replyToId,
        Instant createdAt,
        Instant updatedAt,
        boolean edited,
        boolean deleted
) {
    public static MessageResponse from(Message msg) {
        Instant createdAt = msg.getCreatedAt() != null ? msg.getCreatedAt() : Instant.now();
        Instant updatedAt = msg.getUpdatedAt() != null ? msg.getUpdatedAt() : Instant.now();
        boolean edited = msg.getCreatedAt() != null && msg.getUpdatedAt() != null
                && !msg.getCreatedAt().equals(msg.getUpdatedAt()) && !msg.isDeleted();

        return new MessageResponse(
                msg.getId(),
                msg.getConversation() != null ? msg.getConversation().getId() : null,
                msg.getSender() != null ? msg.getSender().getId() : null,
                msg.getSender() != null ? msg.getSender().getName() : null,
                msg.getSender() != null ? msg.getSender().getAvatarUrl() : null,
                msg.isDeleted() ? null : msg.getContent(),
                msg.getMessageType() != null ? msg.getMessageType() : Message.MessageType.TEXT,
                msg.getSequenceNumber(),
                msg.getReplyTo() != null ? msg.getReplyTo().getId() : null,
                createdAt,
                updatedAt,
                edited,
                msg.isDeleted()
        );
    }
}
