package com.relay.user.dto;

import com.relay.user.entity.User;

import java.time.Instant;
import java.util.UUID;

public record UserSearchResponse(
        UUID id,
        String name,
        String username,
        String email,
        String avatarUrl,
        String status,
        Instant createdAt
) {
    public static UserSearchResponse from(User user) {
        return new UserSearchResponse(
                user.getId(),
                user.getName(),
                user.getUsername(),
                user.getEmail(),
                user.getAvatarUrl(),
                user.getStatus(),
                user.getCreatedAt()
        );
    }
}
