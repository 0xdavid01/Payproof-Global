package com.example.payproof.model;

import com.example.payproof.enums.RequirementReviewStatus;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "requirement_reviews")
@Getter
@Setter
public class RequirementReview {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(
            name = "requirement_snapshot_id",
            nullable = false,
            unique = true
    )
    private SubmissionRequirementSnapshot requirementSnapshot;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "reviewer_id", nullable = false)
    private UserModel reviewer;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private RequirementReviewStatus status =
            RequirementReviewStatus.PENDING;

    @Column(columnDefinition = "TEXT")
    private String feedback;

    @Column(name = "reviewed_at")
    private LocalDateTime reviewedAt;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();

        if (status == null) {
            status = RequirementReviewStatus.PENDING;
        }
    }
}