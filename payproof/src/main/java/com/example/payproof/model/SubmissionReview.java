package com.example.payproof.model;

import com.example.payproof.enums.SubmissionReviewStatus;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "submission_reviews")
@Getter
@Setter
public class SubmissionReview {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(
            name = "submission_version_id",
            nullable = false,
            unique = true
    )
    private SubmissionVersion submissionVersion;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "reviewer_id", nullable = false)
    private UserModel reviewer;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private SubmissionReviewStatus status =
            SubmissionReviewStatus.PENDING;

    @Column(columnDefinition = "TEXT")
    private String feedback;

    @Column(name = "transaction_hash", length = 128)
    private String transactionHash;

    @Column(name = "reviewed_at")
    private LocalDateTime reviewedAt;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();

        if (status == null) {
            status = SubmissionReviewStatus.PENDING;
        }
    }
}