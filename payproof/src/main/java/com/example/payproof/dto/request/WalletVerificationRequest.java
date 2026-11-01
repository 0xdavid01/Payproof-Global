package com.example.payproof.dto.request;

import com.example.payproof.enums.BlockchainNetwork;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record WalletVerificationRequest(
        @NotBlank String accountId,
        @NotBlank String publicKey,
        @NotBlank String signature,
        @NotBlank String nonce,
        @NotBlank String blockchain,
        @NotNull BlockchainNetwork network
) {}