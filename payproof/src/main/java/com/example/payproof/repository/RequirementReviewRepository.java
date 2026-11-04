package com.example.payproof.repository;

import com.example.payproof.enums.RequirementReviewStatus;
import com.example.payproof.model.RequirementReview;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RequirementReviewRepository
        extends JpaRepository<RequirementReview, UUID> {

    Optional<RequirementReview> findByRequirementSnapshot_Id(UUID snapshotId);

    long countByRequirementSnapshot_SubmissionVersion_IdAndStatus(
            UUID submissionVersionId,
            RequirementReviewStatus status
    );
}