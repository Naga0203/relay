package com.relay.message.controller;

import com.relay.auth.security.UserPrincipal;
import com.relay.message.dto.MessagePage;
import com.relay.message.dto.MessageResponse;
import com.relay.message.dto.SendMessageRequest;
import com.relay.message.service.MessageService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class MessageController {

    private final MessageService messageService;

    @PostMapping("/conversations/{conversationId}/messages")
    public ResponseEntity<MessageResponse> sendMessage(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID conversationId,
            @Valid @RequestBody SendMessageRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(messageService.sendMessage(principal, conversationId, request));
    }

    @GetMapping("/conversations/{conversationId}/messages")
    public ResponseEntity<MessagePage> getMessages(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID conversationId,
            @RequestParam(required = false) Long before,
            @RequestParam(defaultValue = "50") int limit) {
        return ResponseEntity.ok(messageService.getMessages(principal, conversationId, before, limit));
    }

    @PatchMapping("/messages/{messageId}")
    public ResponseEntity<MessageResponse> editMessage(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID messageId,
            @RequestBody Map<String, String> body) {
        return ResponseEntity.ok(messageService.editMessage(principal, messageId, body.get("content")));
    }

    @DeleteMapping("/messages/{messageId}")
    public ResponseEntity<Void> deleteMessage(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID messageId) {
        messageService.deleteMessage(principal, messageId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/conversations/{conversationId}/messages/search")
    public ResponseEntity<List<MessageResponse>> searchMessages(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID conversationId,
            @RequestParam String q) {
        return ResponseEntity.ok(messageService.searchMessages(principal, conversationId, q));
    }
}
