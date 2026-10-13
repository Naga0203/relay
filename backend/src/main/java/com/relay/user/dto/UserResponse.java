package com.relay.user.dto;

import com.relay.user.entity.User;

import java.time.Instant;
import java.util.UUID;

public record UserResponse(
        UUID id,
        String name,
        String username,
        String email,
        String avatarUrl,
        String status,
        Integer age,
        String gender,
        String accountType,
        Instant createdAt
) {
    public static UserResponse from(User user) {
        return new UserResponse(
                user.getId(),
                user.getName(),
                user.getUsername(),
                user.getEmail(),
                user.getAvatarUrl(),
                user.getStatus(),
                user.getAge(),
                user.getGender(),
                user.getAccountType(),
                user.getCreatedAt()
        );
    }
}
