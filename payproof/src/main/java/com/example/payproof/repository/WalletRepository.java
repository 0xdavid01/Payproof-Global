package com.example.payproof.repository;

import com.example.payproof.enums.BlockchainNetwork;
import com.example.payproof.enums.WalletStatus;
import com.example.payproof.model.UserModel;
import com.example.payproof.model.WalletModel;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface WalletRepository extends JpaRepository<WalletModel, String> {

    Optional<WalletModel> findByWalletAddressAndBlockchainAndNetwork(
            String walletAddress,
            String blockchain,
            BlockchainNetwork network
    );

    Optional<WalletModel> findByUser(UserModel user);

    Optional<WalletModel> findByUserAndBlockchainAndNetworkAndStatus(
            UserModel user,
            String blockchain,
            BlockchainNetwork network,
            WalletStatus status
    );
}