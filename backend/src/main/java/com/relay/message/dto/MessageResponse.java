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
        Instant created = msg.getCreatedAt() != null ? msg.getCreatedAt() : Instant.now();
        Instant updated = msg.getUpdatedAt() != null ? msg.getUpdatedAt() : Instant.now();

        return new MessageResponse(
                msg.getId(),
                msg.getConversation().getId(),
                msg.getSender().getId(),
                msg.getSender().getName(),
                msg.getSender().getAvatarUrl(),
                msg.isDeleted() ? null : msg.getContent(),
                msg.getMessageType(),
                msg.getSequenceNumber(),
                msg.getReplyTo() != null ? msg.getReplyTo().getId() : null,
                created,
                updated,
                !created.equals(updated) && !msg.isDeleted(),
                msg.isDeleted()
        );
    }
}
