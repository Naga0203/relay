package com.relay.message.dto;

import java.util.List;

public record MessagePage(
        List<MessageResponse> messages,
        Long nextCursor,
        boolean hasMore
) {}
