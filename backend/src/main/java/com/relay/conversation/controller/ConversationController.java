package com.relay.conversation.controller;

import com.relay.auth.security.UserPrincipal;
import com.relay.conversation.dto.ConversationResponse;
import com.relay.conversation.dto.CreateConversationRequest;
import com.relay.conversation.service.ConversationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/conversations")
@RequiredArgsConstructor
public class ConversationController {

    private final ConversationService conversationService;

    @PostMapping
    public ResponseEntity<ConversationResponse> create(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody CreateConversationRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(conversationService.createConversation(principal, request));
    }

    @GetMapping
    public ResponseEntity<List<ConversationResponse>> list(@AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(conversationService.getUserConversations(principal));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ConversationResponse> get(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID id) {
        return ResponseEntity.ok(conversationService.getConversation(principal, id));
    }

    @PostMapping("/{id}/members")
    public ResponseEntity<ConversationResponse> addMember(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID id,
            @RequestBody UUID memberId) {
        return ResponseEntity.ok(conversationService.addMember(principal, id, memberId));
    }

    @DeleteMapping("/{id}/members/{userId}")
    public ResponseEntity<Void> removeMember(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID id,
            @PathVariable UUID userId) {
        conversationService.removeMember(principal, id, userId);
        return ResponseEntity.noContent().build();
    }
}
