package com.example.payproof_admin.model;

import jakarta.persistence.*;
import lombok.Getter;
import org.hibernate.annotations.Immutable;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Immutable
@Table(name = "job_submissions")
@Getter
public class JobSubmissionReadModel {

    @Id
    private UUID id;

    @Column(name = "job_id", nullable = false)
    private String jobId;

    @Column(name = "status", nullable = false)
    private String status;

    @Column(name = "current_version_number", nullable = false)
    private Integer currentVersionNumber;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}