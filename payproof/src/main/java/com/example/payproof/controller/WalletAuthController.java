package com.example.payproof.controller;

import com.example.payproof.dto.request.WalletChallengeRequest;
import com.example.payproof.dto.request.WalletVerificationRequest;
import com.example.payproof.dto.response.WalletAuthResponse;
import com.example.payproof.dto.response.WalletChallengeResponse;
import com.example.payproof.model.UserModel;
import com.example.payproof.repository.UserRepository;
import com.example.payproof.repository.WalletRepository;
import com.example.payproof.security.CustomUserPrincipal;
import com.example.payproof.service.WalletAuthService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth/wallet")
@RequiredArgsConstructor
public class WalletAuthController {

    private final WalletAuthService walletAuthService;
    private final UserRepository userRepository;
    private final WalletRepository walletRepository;

    @PostMapping("/challenge")
    public ResponseEntity<WalletChallengeResponse> createChallenge(
            @AuthenticationPrincipal CustomUserPrincipal principal,
            @Valid @RequestBody WalletChallengeRequest request) {

        UserModel user = getUser(principal);

        return ResponseEntity.ok(
                walletAuthService.createChallenge(request, user)
        );
    }

    @PostMapping("/verify")
    public ResponseEntity<WalletAuthResponse> verifyWallet(
            @AuthenticationPrincipal CustomUserPrincipal principal,
            @Valid @RequestBody WalletVerificationRequest request) {

        UserModel user = getUser(principal);

        return ResponseEntity.ok(
                walletAuthService.verifyWallet(request, user)
        );
    }

    @PostMapping("/revoke")
    public ResponseEntity<Map<String, String>> revokeWallet(
            @AuthenticationPrincipal CustomUserPrincipal principal) {

        UserModel user = getUser(principal);

        walletAuthService.revokeWallet(user);

        return ResponseEntity.ok(
                Map.of("message", "Wallet disconnected successfully")
        );
    }

    @GetMapping
    public ResponseEntity<?> getConnectedWallet(
            @AuthenticationPrincipal CustomUserPrincipal principal) {

        UserModel user = getUser(principal);

        return walletRepository.findByUser(user)
                .filter(wallet -> wallet.getStatus().name().equals("CONNECTED"))
                .<ResponseEntity<?>>map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    private UserModel getUser(CustomUserPrincipal principal) {
        if (principal == null) {
            throw new IllegalStateException("Authentication required");
        }

        return userRepository.findById(principal.getUserId())
                .orElseThrow(() -> new IllegalStateException("User account not found"));
    }
}