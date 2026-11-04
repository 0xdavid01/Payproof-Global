package com.example.payproof.dto.response;

import com.example.payproof.enums.RequirementReviewStatus;
import com.example.payproof.enums.SubmissionVersionStatus;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public record SubmissionVersionResponse(
        UUID id,
        Integer versionNumber,
        SubmissionVersionStatus status,
        String fileName,
        Long fileSizeBytes,
        String fileUrl,
        String externalUrl,
        String notes,
        LocalDateTime submittedAt,
        String reviewFeedback,
        LocalDateTime reviewedAt,
        String releaseTransactionHash,
        List<Requirement> requirements
) {
    public record Requirement(
            Integer requirementPosition,
            String condition,
            boolean completed,
            RequirementReviewStatus reviewStatus
    ) {
    }
}
