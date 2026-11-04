package com.example.payproof.model;

import com.example.payproof.enums.SubmissionVersionStatus;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(
        name = "submission_versions",
        uniqueConstraints = {
                @UniqueConstraint(
                        name = "uk_submission_version_number",
                        columnNames = {"submission_id", "version_number"}
                )
        }
)
@Getter
@Setter
public class SubmissionVersion {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "submission_id", nullable = false)
    private JobSubmission submission;

    @Column(name = "version_number", nullable = false)
    private Integer versionNumber;

    @Column(name = "storage_id")
    private String storageId;

    @Column(name = "file_name")
    private String fileName;

    @Column(name = "content_type")
    private String contentType;

    @Column(name = "file_size_bytes")
    private Long fileSizeBytes;

    @Column(name = "external_url", columnDefinition = "TEXT")
    private String externalUrl;

    @Column(columnDefinition = "TEXT")
    private String notes;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private SubmissionVersionStatus status =
            SubmissionVersionStatus.SUBMITTED;

    @OneToMany(
            mappedBy = "submissionVersion",
            cascade = CascadeType.ALL,
            orphanRemoval = true
    )
    private List<SubmissionRequirementSnapshot> requirementSnapshots =
            new ArrayList<>();

    @OneToOne(
            mappedBy = "submissionVersion",
            cascade = CascadeType.ALL,
            orphanRemoval = true
    )
    private SubmissionReview review;

    @Column(name = "submitted_at", nullable = false)
    private LocalDateTime submittedAt;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Version
    private Long version;

    @PrePersist
    protected void onCreate() {
        LocalDateTime now = LocalDateTime.now();

        if (submittedAt == null) {
            submittedAt = now;
        }

        if (createdAt == null) {
            createdAt = now;
        }

        if (status == null) {
            status = SubmissionVersionStatus.SUBMITTED;
        }
    }
}