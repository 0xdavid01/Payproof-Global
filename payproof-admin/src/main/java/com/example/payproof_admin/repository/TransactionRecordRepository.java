package com.example.payproof_admin.repository;

import com.example.payproof_admin.model.TransactionRecord;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface TransactionRecordRepository extends JpaRepository<TransactionRecord, String> {
    Optional<TransactionRecord> findByTxHash(String txHash);
    long countByTransactionIdStartingWith(String prefix);
}