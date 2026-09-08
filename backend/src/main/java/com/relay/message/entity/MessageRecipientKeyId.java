package com.relay.message.entity;

import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;

/**
 * Composite primary key for {@link MessageRecipientKey}.
 */
public class MessageRecipientKeyId implements Serializable {

    private UUID messageId;
    private UUID userId;

    public MessageRecipientKeyId() {}

    public MessageRecipientKeyId(UUID messageId, UUID userId) {
        this.messageId = messageId;
        this.userId = userId;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof MessageRecipientKeyId that)) return false;
        return Objects.equals(messageId, that.messageId) && Objects.equals(userId, that.userId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(messageId, userId);
    }
}
