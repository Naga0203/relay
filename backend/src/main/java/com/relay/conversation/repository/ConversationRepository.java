package com.relay.conversation.repository;

import com.relay.conversation.entity.Conversation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.UUID;

public interface ConversationRepository extends JpaRepository<Conversation, UUID> {

    @Query("SELECT c FROM Conversation c JOIN c.members m WHERE m.userId = :userId ORDER BY c.updatedAt DESC")
    List<Conversation> findAllByUserId(UUID userId);

    @Query("SELECT c FROM Conversation c JOIN c.members m1 JOIN c.members m2 " +
           "WHERE c.type = 'DIRECT' AND m1.userId = :userId1 AND m2.userId = :userId2")
    List<Conversation> findDirectConversation(UUID userId1, UUID userId2);
}
