// repository/SubmissionReviewReadRepository.java
package com.example.payproof_admin.repository;

import com.example.payproof_admin.model.SubmissionReviewReadModel;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface SubmissionReviewReadRepository extends JpaRepository<SubmissionReviewReadModel, UUID> {
    Optional<SubmissionReviewReadModel> findBySubmissionVersionId(UUID submissionVersionId);
}