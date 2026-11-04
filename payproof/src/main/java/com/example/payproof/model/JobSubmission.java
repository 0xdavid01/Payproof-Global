package com.example.payproof.model;

import com.example.payproof.enums.SubmissionStatus;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(
        name = "job_submissions",
        uniqueConstraints = {
                @UniqueConstraint(
                        name = "uk_job_submission_job",
                        columnNames = "job_id"
                )
        }
)
@Getter
@Setter
public class JobSubmission {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(
            name = "job_id",
            nullable = false,
            unique = true
    )
    private JobModel job;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private SubmissionStatus status = SubmissionStatus.NOT_SUBMITTED;

    @Column(name = "current_version_number", nullable = false)
    private Integer currentVersionNumber = 0;

    @OneToMany(
            mappedBy = "submission",
            cascade = CascadeType.ALL,
            orphanRemoval = true
    )
    @OrderBy("versionNumber DESC")
    private List<SubmissionVersion> versions = new ArrayList<>();

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @Version
    private Long version;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();

        if (status == null) {
            status = SubmissionStatus.NOT_SUBMITTED;
        }

        if (currentVersionNumber == null) {
            currentVersionNumber = 0;
        }
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}