package com.relay.message.repository;

import com.relay.message.entity.MessageRecipientKey;
import com.relay.message.entity.MessageRecipientKeyId;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

/**
 * ARCH FIX (§9): Repository for per-recipient wrapped message keys.
 */
public interface MessageRecipientKeyRepository extends JpaRepository<MessageRecipientKey, MessageRecipientKeyId> {

    /** Fetch all wrapped keys for a given message (used when building MessageResponse). */
    List<MessageRecipientKey> findByMessageId(UUID messageId);

    /** Fetch all wrapped keys for a batch of messages (N+1 avoidance). */
    List<MessageRecipientKey> findByMessageIdIn(List<UUID> messageIds);
}
