package com.example.payproof_admin.model;

import com.example.payproof_admin.enums.BlockchainNetwork;
import com.example.payproof_admin.enums.WalletStatus;
import jakarta.persistence.*;
import lombok.Getter;
import org.hibernate.annotations.Immutable;

import java.time.LocalDateTime;

@Entity
@Immutable
@Table(name = "wallets")
@Getter
public class WalletModel {

    @Id
    @Column(name = "wallet_id", nullable = false, unique = true)
    private String walletId;

    @Column(name = "wallet_address", nullable = false)
    private String walletAddress;

    @Column(name = "blockchain", nullable = false)
    private String blockchain;

    @Enumerated(EnumType.STRING)
    @Column(name = "network", nullable = false)
    private BlockchainNetwork network;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private WalletStatus status;

    @Column(name = "user_id", nullable = false, unique = true)
    private String userId;

    @Column(name = "connected_at", nullable = false)
    private LocalDateTime connectedAt;

    @Column(name = "revoked_at")
    private LocalDateTime revokedAt;
}