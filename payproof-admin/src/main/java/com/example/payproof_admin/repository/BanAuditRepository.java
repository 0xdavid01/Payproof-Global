package com.example.payproof_admin.repository;

import com.example.payproof_admin.model.BanAudit;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface BanAuditRepository extends JpaRepository<BanAudit, String> {
    List<BanAudit> findByAccountIdOrderByPerformedAtDesc(String accountId);
    long countByAuditIdStartingWith(String prefix);
}