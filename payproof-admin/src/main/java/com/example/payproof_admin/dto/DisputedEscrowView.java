package com.example.payproof_admin.dto;

import tools.jackson.databind.JsonNode;

import java.time.LocalDateTime;
import java.util.UUID;

public record DisputedEscrowView(
        UUID caseId,
        String escrowId,
        String jobId,
        String jobTitle,
        String caseType,
        String caseStatus,
        String caseReason,
        String caseTransactionHash,
        LocalDateTime caseCreatedAt,
        String clientUserId,
        String clientEmail,
        String freelancerUserId,
        String freelancerEmail,
        String currency,
        String budget,
        JsonNode onChainEscrow,
        JsonNode onChainProposal,
        JsonNode splitSettlement,
        String localProposalStatus
) {}