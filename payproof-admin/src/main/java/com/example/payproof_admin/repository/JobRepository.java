package com.example.payproof_admin.repository;

import com.example.payproof_admin.model.JobModel;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface JobRepository extends JpaRepository<JobModel, String> {
    Optional<JobModel> findByEscrowId(String escrowId);
}