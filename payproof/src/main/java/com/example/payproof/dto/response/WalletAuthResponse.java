package com.example.payproof.dto.response;

import com.example.payproof.enums.UserRole;

public record WalletAuthResponse(
        String userId,
        String walletAddress,
        String blockchain,
        String network,
        UserRole role,
        String message
) {}