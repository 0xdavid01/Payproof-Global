package com.example.payproof_admin.model;

import jakarta.persistence.*;
import lombok.Getter;
import org.hibernate.annotations.Immutable;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Immutable
@Table(name = "submission_reviews")
@Getter
public class SubmissionReviewReadModel {

    @Id
    private UUID id;

    @Column(name = "submission_version_id", nullable = false)
    private UUID submissionVersionId;

    @Column(name = "reviewer_id", nullable = false)
    private String reviewerId;

    @Column(nullable = false)
    private String status;

    @Column(columnDefinition = "TEXT")
    private String feedback;

    @Column(name = "transaction_hash", length = 128)
    private String transactionHash;

    @Column(name = "reviewed_at")
    private LocalDateTime reviewedAt;
}