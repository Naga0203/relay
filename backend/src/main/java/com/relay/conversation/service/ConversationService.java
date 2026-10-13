package com.relay.conversation.service;

import com.relay.auth.security.UserPrincipal;
import com.relay.common.exception.ApiException;
import com.relay.conversation.dto.ConversationResponse;
import com.relay.conversation.dto.CreateConversationRequest;
import com.relay.conversation.entity.Conversation;
import com.relay.conversation.entity.ConversationMember;
import com.relay.conversation.repository.ConversationMemberRepository;
import com.relay.conversation.repository.ConversationRepository;
import com.relay.user.entity.User;
import com.relay.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class ConversationService {

    private final ConversationRepository conversationRepository;
    private final ConversationMemberRepository memberRepository;
    private final UserRepository userRepository;
    private final com.relay.message.repository.MessageRepository messageRepository;

    @Transactional
    public ConversationResponse createConversation(UserPrincipal principal, CreateConversationRequest request) {
        User creator = userRepository.findById(principal.getId())
                .orElseThrow(() -> ApiException.notFound("User", principal.getId()));

        // For DIRECT conversations, check if one already exists
        if (request.type() == Conversation.ConversationType.DIRECT) {
            if (request.memberIds().size() != 1) {
                throw ApiException.badRequest("Direct conversation must have exactly one other member");
            }
            UUID otherUserId = request.memberIds().get(0);
            List<Conversation> existing = conversationRepository.findDirectConversation(principal.getId(), otherUserId);
            if (!existing.isEmpty()) {
                return ConversationResponse.from(existing.get(0));
            }
        }

        Conversation conversation = Conversation.builder()
                .type(request.type())
                .name(request.name())
                .createdBy(creator)
                .build();
        conversation = conversationRepository.save(conversation);

        // Add creator as ADMIN
        addMemberInternal(conversation, creator, ConversationMember.MemberRole.ADMIN);

        // Add other members
        for (UUID memberId : request.memberIds()) {
            if (!memberId.equals(principal.getId())) {
                User member = userRepository.findById(memberId)
                        .orElseThrow(() -> ApiException.notFound("User", memberId));
                addMemberInternal(conversation, member, ConversationMember.MemberRole.MEMBER);
            }
        }

        // Reload with members
        conversation = conversationRepository.findById(conversation.getId()).orElseThrow();
        log.info("Conversation created: {} by user {}", conversation.getId(), principal.getId());
        return ConversationResponse.from(conversation);
    }

    @Transactional(readOnly = true)
    public List<ConversationResponse> getUserConversations(UserPrincipal principal) {
        List<ConversationMember> userMemberships = memberRepository.findByUserId(principal.getId());
        Map<UUID, Long> lastReadMap = userMemberships.stream()
                .collect(Collectors.toMap(
                        ConversationMember::getConversationId,
                        m -> m.getLastReadSequence() != null ? m.getLastReadSequence() : 0L,
                        (a, b) -> Math.max(a, b)
                ));

        List<Conversation> conversations = conversationRepository.findAllByUserId(principal.getId());

        return conversations.stream()
                .map(conv -> {
                    long lastRead = lastReadMap.getOrDefault(conv.getId(), 0L);
                    long unread = messageRepository.countUnreadMessages(conv.getId(), lastRead, principal.getId());
                    return ConversationResponse.from(conv, unread);
                })
                .toList();
    }

    @Transactional(readOnly = true)
    public ConversationResponse getConversation(UserPrincipal principal, UUID conversationId) {
        Conversation conversation = getConversationAndVerifyMembership(conversationId, principal.getId());
        long lastReadSeq = memberRepository.findByConversationIdAndUserId(conversationId, principal.getId())
                .map(m -> m.getLastReadSequence() != null ? m.getLastReadSequence() : 0L)
                .orElse(0L);
        long unread = messageRepository.countUnreadMessages(
                conversation.getId(), lastReadSeq, principal.getId());
        return ConversationResponse.from(conversation, unread);
    }

    @Transactional
    public void markAsRead(UserPrincipal principal, UUID conversationId) {
        Conversation conversation = getConversationAndVerifyMembership(conversationId, principal.getId());
        ConversationMember member = memberRepository
                .findByConversationIdAndUserId(conversationId, principal.getId())
                .orElseThrow(() -> ApiException.notFound("ConversationMember", conversationId + "/" + principal.getId()));

        // RACE CONDITION FIX: Use actual max sequence from messages table instead of
        // conversation.getNextSequence() - 1. The nextSequence counter is incremented
        // atomically on insert, but there's a window between reading it and saving
        // the member where another message could be inserted, causing the user to
        // mark as read up to a sequence that doesn't include the latest message.
        Long maxSeq = messageRepository.findMaxSequenceNumber(conversationId);
        long latestSeq = maxSeq != null ? maxSeq : 0L;

        member.setLastReadSequence(latestSeq);
        memberRepository.saveAndFlush(member);
        log.debug("Marked conversation {} as read up to sequence {} for user {}", conversationId, latestSeq, principal.getId());
    }

    @Transactional
    public ConversationResponse addMember(UserPrincipal principal, UUID conversationId, UUID newMemberId) {
        Conversation conversation = getConversationAndVerifyMembership(conversationId, principal.getId());

        if (conversation.getType() == Conversation.ConversationType.DIRECT) {
            throw ApiException.badRequest("Cannot add members to a direct conversation");
        }

        // Verify the requester is an admin
        ConversationMember requester = memberRepository
                .findByConversationIdAndUserId(conversationId, principal.getId())
                .orElseThrow(() -> ApiException.notFound("ConversationMember", conversationId + "/" + principal.getId()));
        if (requester.getRole() != ConversationMember.MemberRole.ADMIN) {
            throw ApiException.forbidden("Only admins can add members");
        }

        if (memberRepository.existsByConversationIdAndUserId(conversationId, newMemberId)) {
            throw ApiException.conflict("User is already a member");
        }

        User newMember = userRepository.findById(newMemberId)
                .orElseThrow(() -> ApiException.notFound("User", newMemberId));
        addMemberInternal(conversation, newMember, ConversationMember.MemberRole.MEMBER);

        conversation = conversationRepository.findById(conversationId).orElseThrow();
        return ConversationResponse.from(conversation);
    }

    @Transactional
    public void removeMember(UserPrincipal principal, UUID conversationId, UUID memberId) {
        getConversationAndVerifyMembership(conversationId, principal.getId());

        // Users can remove themselves, admins can remove anyone
        if (!principal.getId().equals(memberId)) {
            ConversationMember requester = memberRepository
                    .findByConversationIdAndUserId(conversationId, principal.getId())
                    .orElseThrow(() -> ApiException.notFound("ConversationMember", conversationId + "/" + principal.getId()));
            if (requester.getRole() != ConversationMember.MemberRole.ADMIN) {
                throw ApiException.forbidden("Only admins can remove other members");
            }
        }

        memberRepository.deleteByConversationIdAndUserId(conversationId, memberId);
        log.info("Member {} removed from conversation {}", memberId, conversationId);
    }

    private Conversation getConversationAndVerifyMembership(UUID conversationId, UUID userId) {
        Conversation conversation = conversationRepository.findById(conversationId)
                .orElseThrow(() -> ApiException.notFound("Conversation", conversationId));

        if (!memberRepository.existsByConversationIdAndUserId(conversationId, userId)) {
            throw ApiException.forbidden("You are not a member of this conversation");
        }

        return conversation;
    }

    private void addMemberInternal(Conversation conversation, User user, ConversationMember.MemberRole role) {
        ConversationMember member = ConversationMember.builder()
                .conversationId(conversation.getId())
                .userId(user.getId())
                .conversation(conversation)
                .user(user)
                .role(role)
                .build();
        member = memberRepository.save(member);
        if (conversation.getMembers() != null) {
            conversation.getMembers().add(member);
        }
    }
}
