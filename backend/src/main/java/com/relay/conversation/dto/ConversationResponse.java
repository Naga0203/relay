package com.relay.conversation.dto;

import com.relay.conversation.entity.Conversation;
import com.relay.conversation.entity.ConversationMember;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record ConversationResponse(
        UUID id,
        Conversation.ConversationType type,
        String name,
        String avatarUrl,
        List<MemberResponse> members,
        Instant createdAt,
        Instant updatedAt,
        long unreadCount
) {
    public record MemberResponse(
            UUID userId,
            String name,
            String username,
            String email,
            String avatarUrl,
            String publicKey,
            ConversationMember.MemberRole role,
            Instant joinedAt
    ) {}

    public static ConversationResponse from(Conversation conv) {
        return from(conv, 0L);
    }

    public static ConversationResponse from(Conversation conv, long unreadCount) {
        List<MemberResponse> memberResponses = conv.getMembers().stream()
                .map(m -> new MemberResponse(
                        m.getUserId(),
                        m.getUser() != null ? m.getUser().getName() : null,
                        m.getUser() != null ? m.getUser().getUsername() : null,
                        m.getUser() != null ? m.getUser().getEmail() : null,
                        m.getUser() != null ? m.getUser().getAvatarUrl() : null,
                        m.getUser() != null ? m.getUser().getPublicKey() : null,
                        m.getRole(),
                        m.getJoinedAt()
                ))
                .toList();

        return new ConversationResponse(
                conv.getId(),
                conv.getType(),
                conv.getName(),
                conv.getAvatarUrl(),
                memberResponses,
                conv.getCreatedAt(),
                conv.getUpdatedAt(),
                unreadCount
        );
    }
}
