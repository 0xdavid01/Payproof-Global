package com.example.payproof.dto.response;

import java.time.LocalDateTime;

public record WalletChallengeResponse(
        String message,
        String nonce,
        String recipient,
        LocalDateTime expiresAt
) {}