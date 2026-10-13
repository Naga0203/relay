package com.relay.conversation.repository;

import com.relay.conversation.entity.ConversationMember;
import com.relay.conversation.entity.ConversationMemberId;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ConversationMemberRepository extends JpaRepository<ConversationMember, ConversationMemberId> {

    List<ConversationMember> findByConversationId(UUID conversationId);

    List<ConversationMember> findByUserId(UUID userId);

    Optional<ConversationMember> findByConversationIdAndUserId(UUID conversationId, UUID userId);

    boolean existsByConversationIdAndUserId(UUID conversationId, UUID userId);

    void deleteByConversationIdAndUserId(UUID conversationId, UUID userId);

    long countByConversationId(UUID conversationId);
}
