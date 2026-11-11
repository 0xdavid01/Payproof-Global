// repository/RequirementReviewReadRepository.java
package com.example.payproof_admin.repository;

import com.example.payproof_admin.model.RequirementReviewReadModel;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface RequirementReviewReadRepository extends JpaRepository<RequirementReviewReadModel, UUID> {
    Optional<RequirementReviewReadModel> findByRequirementSnapshotId(UUID snapshotId);
}