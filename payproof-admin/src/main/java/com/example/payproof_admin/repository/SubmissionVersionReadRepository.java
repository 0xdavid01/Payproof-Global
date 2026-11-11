// repository/SubmissionVersionReadRepository.java
package com.example.payproof_admin.repository;

import com.example.payproof_admin.model.SubmissionVersionReadModel;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface SubmissionVersionReadRepository extends JpaRepository<SubmissionVersionReadModel, UUID> {
    List<SubmissionVersionReadModel> findBySubmissionIdOrderByVersionNumberDesc(UUID submissionId);
}