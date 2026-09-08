package com.relay.conversation.repository;

import com.relay.conversation.entity.Conversation;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ConversationRepository extends JpaRepository<Conversation, UUID> {

    @Query("SELECT DISTINCT c FROM Conversation c LEFT JOIN FETCH c.members m LEFT JOIN FETCH m.user WHERE c.id IN (SELECT cm.conversationId FROM ConversationMember cm WHERE cm.userId = :userId) ORDER BY c.updatedAt DESC")
    List<Conversation> findAllByUserId(UUID userId);

    @Query("SELECT DISTINCT c FROM Conversation c JOIN c.members m1 JOIN c.members m2 " +
           "WHERE c.type = com.relay.conversation.entity.Conversation.ConversationType.DIRECT AND m1.userId = :userId1 AND m2.userId = :userId2")
    List<Conversation> findDirectConversation(UUID userId1, UUID userId2);

    /**
     * ARCH FIX (§1): Pessimistic write lock on the conversations row.
     * Guarantees atomic serialization of sequence-number allocation across concurrent
     * sendMessage requests, preventing race conditions even when the messages table is empty.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT c FROM Conversation c WHERE c.id = :id")
    Optional<Conversation> findByIdForUpdate(@Param("id") UUID id);

    @Modifying
    @Query(value = "UPDATE conversations SET next_sequence = next_sequence + 1 WHERE id = :conversationId",
           nativeQuery = true)
    void incrementNextSequence(UUID conversationId);

    @Query(value = "SELECT next_sequence - 1 FROM conversations WHERE id = :conversationId",
           nativeQuery = true)
    Long getCurrentSequenceAfterIncrement(UUID conversationId);
}
