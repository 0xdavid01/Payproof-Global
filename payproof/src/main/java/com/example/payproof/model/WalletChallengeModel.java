package com.example.payproof.model;

import com.example.payproof.enums.BlockchainNetwork;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

@Entity
@Table(name = "wallet_challenges")
@Getter
@Setter
public class WalletChallengeModel {

    @Id
    @Column(nullable = false, unique = true)
    private String challengeId;

    @Column(nullable = false, unique = true)
    private String nonce;

    @Column(nullable = false)
    private String walletAddress;

    @Column(nullable = false)
    private String blockchain;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private BlockchainNetwork network;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String challengeMessage;

    @Column(nullable = false)
    private String recipient;

    @Column(nullable = false)
    private LocalDateTime expiresAt;

    @Column(nullable = false)
    private boolean used;

    @Column(nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
    }
}