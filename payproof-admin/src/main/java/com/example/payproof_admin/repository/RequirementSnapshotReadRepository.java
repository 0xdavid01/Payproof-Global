// repository/RequirementSnapshotReadRepository.java
package com.example.payproof_admin.repository;

import com.example.payproof_admin.model.RequirementSnapshotReadModel;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface RequirementSnapshotReadRepository extends JpaRepository<RequirementSnapshotReadModel, UUID> {
    List<RequirementSnapshotReadModel> findBySubmissionVersionIdOrderByRequirementPositionAsc(UUID versionId);
}