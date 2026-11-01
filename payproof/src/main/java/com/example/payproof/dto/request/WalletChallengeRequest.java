package com.example.payproof.dto.request;

import com.example.payproof.enums.BlockchainNetwork;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record WalletChallengeRequest(
        @NotBlank String walletAddress,
        @NotBlank String blockchain,
        @NotNull BlockchainNetwork network
) {}