package com.relay.conversation.repository;

import com.relay.conversation.entity.Conversation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.UUID;

public interface ConversationRepository extends JpaRepository<Conversation, UUID> {

    @Query("SELECT DISTINCT c FROM Conversation c LEFT JOIN FETCH c.members m LEFT JOIN FETCH m.user WHERE c.id IN (SELECT cm.conversationId FROM ConversationMember cm WHERE cm.userId = :userId) ORDER BY c.updatedAt DESC")
    List<Conversation> findAllByUserId(UUID userId);

    @Query("SELECT DISTINCT c FROM Conversation c JOIN c.members m1 JOIN c.members m2 " +
           "WHERE c.type = com.relay.conversation.entity.Conversation.ConversationType.DIRECT AND m1.userId = :userId1 AND m2.userId = :userId2")
    List<Conversation> findDirectConversation(UUID userId1, UUID userId2);
}
