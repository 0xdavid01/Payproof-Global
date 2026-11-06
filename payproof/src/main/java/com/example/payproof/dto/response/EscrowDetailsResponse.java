package com.example.payproof.dto.response;

import java.util.UUID;

public record EscrowDetailsResponse(
        String escrowId,
        String jobId,
        String status,
        boolean isFunded,
        String asset,
        String amount,
        String platformFee,
        String fundedAmount,
        String clientWalletAddress,
        String freelancerWalletAddress,
        String contractId,
        String network,
        String createdAt,
        String updatedAt,
        String releaseTransactionHash,
        UUID disputeCaseId
) {
}
