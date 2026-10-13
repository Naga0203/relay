package com.relay.user.controller;

import com.relay.auth.security.UserPrincipal;
import com.relay.user.dto.PublicKeyRequest;
import com.relay.user.dto.UpdateProfileRequest;
import com.relay.user.dto.UserResponse;
import com.relay.user.dto.UserSearchResponse;
import com.relay.user.service.UserService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/users")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;

    @GetMapping("/{id}")
    public ResponseEntity<UserResponse> getUser(@PathVariable UUID id) {
        return ResponseEntity.ok(userService.getUserById(id));
    }

    @PatchMapping("/me")
    public ResponseEntity<UserResponse> updateProfile(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody UpdateProfileRequest request) {
        return ResponseEntity.ok(userService.updateProfile(principal, request));
    }

    @PostMapping(value = "/me/avatar", consumes = org.springframework.http.MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<UserResponse> uploadAvatar(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam("file") org.springframework.web.multipart.MultipartFile file) {
        return ResponseEntity.ok(userService.updateAvatar(principal, file));
    }

    @GetMapping("/search")
    public ResponseEntity<List<UserSearchResponse>> searchUsers(
            @RequestParam @Size(min = 1, max = 200, message = "Search query must be 1-200 characters") String q) {
        return ResponseEntity.ok(userService.searchUsers(q));
    }

    @PutMapping("/me/public-key")
    public ResponseEntity<Void> uploadPublicKey(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody PublicKeyRequest request) {
        userService.updatePublicKey(principal, request.publicKey());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{id}/public-key")
    public ResponseEntity<java.util.Map<String, String>> getPublicKey(@PathVariable UUID id) {
        String publicKey = userService.getPublicKey(id);
        return ResponseEntity.ok(java.util.Map.of("publicKey", publicKey != null ? publicKey : ""));
    }
}
