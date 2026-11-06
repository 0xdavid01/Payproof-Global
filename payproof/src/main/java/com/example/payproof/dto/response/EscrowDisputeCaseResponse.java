package com.example.payproof.dto.response;

import com.example.payproof.enums.EscrowCaseType;

import java.time.LocalDateTime;
import java.util.UUID;

public record EscrowDisputeCaseResponse(
        UUID id,
        String jobId,
        String escrowId,
        EscrowCaseType type,
        String status,
        String reason,
        String transactionHash,
        String requestedBy,
        String requesterRole,
        LocalDateTime createdAt
) {
}
