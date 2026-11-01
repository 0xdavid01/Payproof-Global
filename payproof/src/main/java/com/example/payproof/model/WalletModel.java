package com.example.payproof.model;

import com.example.payproof.enums.BlockchainNetwork;
import com.example.payproof.enums.WalletStatus;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

@Entity
@Table(
        name = "wallets",
        uniqueConstraints = {
                @UniqueConstraint(name = "uk_wallet_user", columnNames = "user_id"),
                @UniqueConstraint(name = "uk_wallet_address", columnNames = "wallet_address")
        }
)
@Getter
@Setter
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

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false, unique = true)
    private UserModel user;

    @Column(nullable = false)
    private LocalDateTime connectedAt;

    private LocalDateTime revokedAt;

    @PrePersist
    protected void onCreate() {
        if (connectedAt == null) {
            connectedAt = LocalDateTime.now();
        }

        if (status == null) {
            status = WalletStatus.CONNECTED;
        }
    }
}