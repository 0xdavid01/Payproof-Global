package com.example.payproof.repository;

import com.example.payproof.enums.SubmissionReviewStatus;
import com.example.payproof.model.SubmissionReview;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface SubmissionReviewRepository
        extends JpaRepository<SubmissionReview, UUID> {

    Optional<SubmissionReview> findBySubmissionVersion_Id(
            UUID submissionVersionId
    );

    boolean existsBySubmissionVersion_IdAndStatus(
            UUID submissionVersionId,
            SubmissionReviewStatus status
    );
}