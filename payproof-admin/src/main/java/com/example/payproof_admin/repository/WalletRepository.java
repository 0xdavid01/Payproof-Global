package com.example.payproof_admin.repository;

import com.example.payproof_admin.model.WalletModel;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface WalletRepository extends JpaRepository<WalletModel, String> {
    Optional<WalletModel> findByUserId(String userId);
    Optional<WalletModel> findByWalletAddress(String walletAddress);
}