package com.example.payproof.controller;

import com.example.payproof.dto.request.WalletChallengeRequest;
import com.example.payproof.dto.request.WalletVerificationRequest;
import com.example.payproof.dto.response.WalletAuthResponse;
import com.example.payproof.dto.response.WalletChallengeResponse;
import com.example.payproof.enums.WalletStatus;
import com.example.payproof.model.UserModel;
import com.example.payproof.model.WalletModel;
import com.example.payproof.repository.WalletRepository;
import com.example.payproof.service.WalletAuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.Map;

@RestController
@RequestMapping("/api/auth/wallet")
public class WalletAuthController {

    private final WalletAuthService walletAuthService;
    private final WalletRepository walletRepository;

    public WalletAuthController(
            WalletAuthService walletAuthService,
            WalletRepository walletRepository
    ) {
        this.walletAuthService = walletAuthService;
        this.walletRepository = walletRepository;
    }

    @PostMapping("/challenge")
    public ResponseEntity<WalletChallengeResponse> challenge(
            @Valid @RequestBody WalletChallengeRequest request
    ) {
        return ResponseEntity.ok(
                walletAuthService.createChallenge(request)
        );
    }

    @PostMapping("/verify")
    public ResponseEntity<WalletAuthResponse> verify(
            @Valid @RequestBody WalletVerificationRequest request,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse
    ) {
        return ResponseEntity.ok(
                walletAuthService.verifyWallet(
                        request,
                        httpRequest,
                        httpResponse
                )
        );
    }

    @PostMapping("/revoke")
    public ResponseEntity<Map<String, String>> revoke(
            @AuthenticationPrincipal UserModel user
    ) {
        WalletModel wallet = walletRepository.findByUser(user)
                .orElseThrow(() -> new IllegalStateException(
                        "No wallet is linked to this account"
                ));

        wallet.setStatus(WalletStatus.REVOKED);
        wallet.setRevokedAt(LocalDateTime.now());

        walletRepository.save(wallet);

        return ResponseEntity.ok(
                Map.of("message", "Wallet successfully revoked")
        );
    }
}