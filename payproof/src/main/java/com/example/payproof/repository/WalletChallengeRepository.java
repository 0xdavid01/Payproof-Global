package com.example.payproof.repository;

import com.example.payproof.model.WalletChallengeModel;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface WalletChallengeRepository
        extends JpaRepository<WalletChallengeModel, String> {

    Optional<WalletChallengeModel> findByNonce(String nonce);
}