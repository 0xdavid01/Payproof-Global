// repository/JobSubmissionReadRepository.java
package com.example.payproof_admin.repository;

import com.example.payproof_admin.model.JobSubmissionReadModel;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface JobSubmissionReadRepository extends JpaRepository<JobSubmissionReadModel, UUID> {
    Optional<JobSubmissionReadModel> findByJobId(String jobId);
}