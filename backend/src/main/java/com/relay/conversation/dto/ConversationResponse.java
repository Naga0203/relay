package com.relay.conversation.dto;

import com.relay.conversation.entity.Conversation;
import com.relay.conversation.entity.ConversationMember;
import com.relay.user.dto.UserResponse;

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
        Instant updatedAt
) {
    public record MemberResponse(
            UUID userId,
            String name,
            String avatarUrl,
            String publicKey,
            ConversationMember.MemberRole role,
            Instant joinedAt
    ) {}

    public static ConversationResponse from(Conversation conv) {
        List<MemberResponse> memberResponses = conv.getMembers().stream()
                .map(m -> new MemberResponse(
                        m.getUserId(),
                        m.getUser() != null ? m.getUser().getName() : null,
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
                conv.getUpdatedAt()
        );
    }
}
