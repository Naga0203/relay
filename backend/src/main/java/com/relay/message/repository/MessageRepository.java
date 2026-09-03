package com.relay.message.repository;

import com.relay.message.entity.Message;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.QueryHints;

import jakarta.persistence.LockModeType;
import jakarta.persistence.QueryHint;

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

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT COALESCE(MAX(m.sequenceNumber), 0) FROM Message m WHERE m.conversation.id = :conversationId")
    @QueryHints({@QueryHint(name = "jakarta.persistence.lock.timeout", value = "5000")})
    Long findMaxSequenceNumberForUpdate(UUID conversationId);

    Optional<Message> findByIdempotencyKey(String idempotencyKey);

    @Query("SELECT m FROM Message m WHERE m.conversation.id = :conversationId " +
           "AND m.deletedAt IS NULL " +
           "AND m.content IS NOT NULL " +
           "AND LOWER(m.content) LIKE LOWER(CONCAT('%', :query, '%')) " +
           "ORDER BY m.createdAt DESC")
    List<Message> searchInConversation(UUID conversationId, String query, Pageable pageable);
}
