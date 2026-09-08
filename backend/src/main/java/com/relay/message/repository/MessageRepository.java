package com.relay.message.repository;

import com.relay.message.entity.Message;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
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

    // ARCH FIX (§7): searchInConversation REMOVED — message content is AES-GCM ciphertext,
    // so LIKE '%query%' can never match plaintext.  The method was dead code and misleading
    // (a match would imply plaintext leaked to the server).  Search is done client-side on
    // already-decrypted message history.
}
