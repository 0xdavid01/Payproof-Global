package com.example.payproof.repository;

import com.example.payproof.model.JobSubmission;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface JobSubmissionRepository
        extends JpaRepository<JobSubmission, UUID> {

    Optional<JobSubmission> findByJob_JobId(String jobId);

    boolean existsByJob_JobId(String jobId);
}