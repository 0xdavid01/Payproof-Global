
package com.example.payproof.dto.response;

import com.example.payproof.enums.UserRole;
import com.example.payproof.enums.UserStatus;

import java.time.LocalDateTime;

public record UserResponse(
        String userId,
        String firstName,
        String lastName,
        String displayName,
        String email,
        String profilePictureUrl,
        UserRole role,
        UserStatus status,
        LocalDateTime createdAt
) {}
