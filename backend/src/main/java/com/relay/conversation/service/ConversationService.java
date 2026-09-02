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

import java.util.List;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class ConversationService {

    private final ConversationRepository conversationRepository;
    private final ConversationMemberRepository memberRepository;
    private final UserRepository userRepository;

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
        return conversationRepository.findAllByUserId(principal.getId()).stream()
                .map(ConversationResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public ConversationResponse getConversation(UserPrincipal principal, UUID conversationId) {
        Conversation conversation = getConversationAndVerifyMembership(conversationId, principal.getId());
        return ConversationResponse.from(conversation);
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
                .orElseThrow();
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
                    .orElseThrow();
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
        memberRepository.save(member);
    }
}
