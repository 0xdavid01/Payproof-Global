package com.example.payproof_admin.model;

import jakarta.persistence.*;
import lombok.Getter;
import org.hibernate.annotations.Immutable;

import java.util.UUID;

@Entity
@Immutable
@Table(name = "submission_requirement_snapshots")
@Getter
public class RequirementSnapshotReadModel {

    @Id
    private UUID id;

    @Column(name = "submission_version_id", nullable = false)
    private UUID submissionVersionId;

    @Column(name = "requirement_position", nullable = false)
    private Integer requirementPosition;

    @Column(name = "requirement_condition", nullable = false, columnDefinition = "TEXT")
    private String condition;

    @Column(name = "was_completed", nullable = false)
    private boolean completed;
}