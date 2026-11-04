package com.example.payproof.model;

import com.example.payproof.enums.RequirementReviewStatus;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(
        name = "submission_requirement_snapshots",
        uniqueConstraints = {
                @UniqueConstraint(
                        name = "uk_version_requirement_position",
                        columnNames = {"submission_version_id", "requirement_position"}
                )
        }
)
@Getter
@Setter
public class SubmissionRequirementSnapshot {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(
            name = "submission_version_id",
            nullable = false
    )
    private SubmissionVersion submissionVersion;

    @Column(name = "requirement_position", nullable = false)
    private Integer requirementPosition;

    @Column(name = "requirement_condition", nullable = false, columnDefinition = "TEXT")
    private String condition;

    @Column(name = "was_completed", nullable = false)
    private boolean completed;

    @OneToOne(
            mappedBy = "requirementSnapshot",
            cascade = CascadeType.ALL,
            orphanRemoval = true
    )
    private RequirementReview review;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }
}