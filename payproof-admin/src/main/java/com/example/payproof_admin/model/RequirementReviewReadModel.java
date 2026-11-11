package com.example.payproof_admin.model;

import jakarta.persistence.*;
import lombok.Getter;
import org.hibernate.annotations.Immutable;

import java.util.UUID;

@Entity
@Immutable
@Table(name = "requirement_reviews")
@Getter
public class RequirementReviewReadModel {

    @Id
    private UUID id;

    @Column(name = "requirement_snapshot_id", nullable = false)
    private UUID requirementSnapshotId;

    @Column(nullable = false)
    private String status;

    @Column(columnDefinition = "TEXT")
    private String feedback;
}