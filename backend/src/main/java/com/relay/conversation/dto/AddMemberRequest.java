package com.relay.conversation.dto;

import jakarta.validation.constraints.NotNull;

import java.util.UUID;

public record AddMemberRequest(
        @NotNull(message = "Member ID is required")
        UUID memberId
) {}
