package com.example.payproof.repository;

import com.example.payproof.enums.SubmissionVersionStatus;
import com.example.payproof.model.SubmissionVersion;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SubmissionVersionRepository
        extends JpaRepository<SubmissionVersion, UUID> {

    List<SubmissionVersion> findBySubmission_IdOrderByVersionNumberDesc(
            UUID submissionId
    );

    Optional<SubmissionVersion> findBySubmission_IdAndVersionNumber(
            UUID submissionId,
            Integer versionNumber
    );

    Optional<SubmissionVersion> findByIdAndSubmission_Job_JobId(
            UUID versionId,
            String jobId
    );

    boolean existsBySubmission_IdAndStatus(
            UUID submissionId,
            SubmissionVersionStatus status
    );
}