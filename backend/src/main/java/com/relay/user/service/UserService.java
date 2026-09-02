package com.relay.user.service;

import com.relay.auth.security.UserPrincipal;
import com.relay.common.exception.ApiException;
import com.relay.user.dto.UpdateProfileRequest;
import com.relay.user.dto.UserResponse;
import com.relay.user.entity.User;
import com.relay.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;

    @Transactional(readOnly = true)
    public UserResponse getUserById(UUID id) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("User", id));
        return UserResponse.from(user);
    }

    @Transactional
    public UserResponse updateProfile(UserPrincipal principal, UpdateProfileRequest request) {
        User user = userRepository.findById(principal.getId())
                .orElseThrow(() -> ApiException.notFound("User", principal.getId()));

        if (request.name() != null) {
            user.setName(request.name());
        }
        if (request.avatarUrl() != null) {
            user.setAvatarUrl(request.avatarUrl());
        }
        if (request.status() != null) {
            user.setStatus(request.status());
        }

        user = userRepository.save(user);
        return UserResponse.from(user);
    }

    @Transactional(readOnly = true)
    public List<UserResponse> searchUsers(String query) {
        return userRepository.searchByNameOrEmail(query).stream()
                .map(UserResponse::from)
                .toList();
    }
}
