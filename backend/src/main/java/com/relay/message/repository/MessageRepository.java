package com.relay.message.repository;

import com.relay.message.entity.Message;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

public interface MessageRepository extends JpaRepository<Message, UUID> {

    @Query("SELECT m FROM Message m JOIN FETCH m.sender WHERE m.conversation.id = :conversationId " +
           "AND m.deletedAt IS NULL ORDER BY m.sequenceNumber DESC")
    List<Message> findByConversationId(UUID conversationId, Pageable pageable);

    @Query("SELECT m FROM Message m JOIN FETCH m.sender WHERE m.conversation.id = :conversationId " +
           "AND m.sequenceNumber < :beforeSequence AND m.deletedAt IS NULL " +
           "ORDER BY m.sequenceNumber DESC")
    List<Message> findByConversationIdBefore(UUID conversationId, Long beforeSequence, Pageable pageable);

    // ARCH FIX (§1): findMaxSequenceNumberForUpdate REMOVED — replaced by the atomic
    // UPDATE on conversations.next_sequence in ConversationRepository.  The old query
    // acquired no row lock when the messages table was empty, allowing two concurrent
    // first-messages to both compute sequenceNumber = 1.

    Optional<Message> findByIdempotencyKey(String idempotencyKey);

    @Query("SELECT COUNT(m) FROM Message m WHERE m.conversation.id = :conversationId " +
           "AND m.sequenceNumber > :lastReadSequence AND m.sender.id != :userId AND m.deletedAt IS NULL")
    long countUnreadMessages(UUID conversationId, Long lastReadSequence, UUID userId);



    // ARCH FIX (§7): searchInConversation REMOVED — message content is AES-GCM ciphertext,
    // so LIKE '%query%' can never match plaintext.  The method was dead code and misleading
    // (a match would imply plaintext leaked to the server).  Search is done client-side on
    // already-decrypted message history.

    /**
     * Get the maximum sequence number for a conversation.
     * Used by markAsRead to avoid race conditions with nextSequence counter.
     */
    @Query("SELECT MAX(m.sequenceNumber) FROM Message m WHERE m.conversation.id = :conversationId AND m.deletedAt IS NULL")
    Long findMaxSequenceNumber(UUID conversationId);
}
