package com.example.payproof_admin.dto;

import tools.jackson.databind.JsonNode;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public record DisputeDossierView(
        CaseView caseView,
        JobView job,
        List<SubmissionView> submissions,
        JsonNode onChainEscrow,
        JsonNode onChainProposal,
        JsonNode splitSettlement,
        String localProposalStatus
) {
    public record CaseView(
            UUID caseId,
            String escrowId,
            String jobId,
            String caseType,
            String caseStatus,
            String caseReason,
            String caseTransactionHash,
            LocalDateTime caseCreatedAt
    ) {}

    public record JobView(
            String jobId,
            String title,
            String description,
            String status,
            String budget,
            String currency,
            LocalDateTime deadline,
            String prdUrl,
            String contractUrl,
            Integer contractVersion,
            String contractStatus,
            Integer clientApprovedContractVersion,
            Integer freelancerApprovedContractVersion,
            List<RequirementView> requirements,
            PartyView client,
            PartyView freelancer
    ) {}

    public record PartyView(
            String userId,
            String email,
            String displayName
    ) {}

    public record RequirementView(
            int position,
            boolean isDone,
            String condition
    ) {}

    public record SubmissionView(
            UUID submissionId,
            String submissionStatus,
            Integer currentVersionNumber,
            List<VersionView> versions
    ) {}

    public record VersionView(
            UUID versionId,
            Integer versionNumber,
            String status,
            String fileName,
            String contentType,
            Long fileSizeBytes,
            String downloadUrl,
            String externalUrl,
            String notes,
            LocalDateTime submittedAt,
            ReviewView review,
            List<RequirementSnapshotView> requirements
    ) {}

    public record ReviewView(
            String status,
            String feedback,
            String reviewerUserId,
            String transactionHash,
            LocalDateTime reviewedAt
    ) {}

    public record RequirementSnapshotView(
            Integer position,
            String condition,
            boolean completed,
            String reviewStatus,
            String reviewFeedback
    ) {}
}