package com.example.payproof.repository;

import com.example.payproof.model.SubmissionRequirementSnapshot;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface SubmissionRequirementSnapshotRepository
        extends JpaRepository<SubmissionRequirementSnapshot, UUID> {

    List<SubmissionRequirementSnapshot>
    findBySubmissionVersion_IdOrderByRequirementPositionAsc(
            UUID submissionVersionId
    );

    long countBySubmissionVersion_Id(UUID submissionVersionId);
}