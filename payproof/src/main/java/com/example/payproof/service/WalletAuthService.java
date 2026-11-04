package com.example.payproof.service;

import com.example.payproof.dto.request.WalletChallengeRequest;
import com.example.payproof.dto.request.WalletVerificationRequest;
import com.example.payproof.dto.response.WalletAuthResponse;
import com.example.payproof.dto.response.WalletChallengeResponse;
import com.example.payproof.enums.BlockchainNetwork;
import com.example.payproof.enums.WalletStatus;
import com.example.payproof.model.UserModel;
import com.example.payproof.model.WalletChallengeModel;
import com.example.payproof.model.WalletModel;
import com.example.payproof.repository.WalletChallengeRepository;
import com.example.payproof.repository.WalletRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class WalletAuthService {

    private static final String SUPPORTED_BLOCKCHAIN = "NEAR";
    private static final String RECIPIENT = "payproof";

    private final WalletRepository walletRepository;
    private final WalletChallengeRepository challengeRepository;
    private final NearSignatureVerifier signatureVerifier;
    private final NearAccessKeyVerifier accessKeyVerifier;

    private final SecureRandom secureRandom = new SecureRandom();

    @Transactional
    public WalletChallengeResponse createChallenge(
            WalletChallengeRequest request,
            UserModel user) {

        log.info(
                "[WALLET] Creating challenge for user={}, wallet={}",
                user.getUserId(),
                request.walletAddress()
        );

        validateNetwork(request.blockchain(), request.network());

        String nonce = generateNonce();

        String message = "Link your wallet to PayProof. Challenge: "
                + UUID.randomUUID();

        WalletChallengeModel challenge = new WalletChallengeModel();

        challenge.setChallengeId(UUID.randomUUID().toString());
        challenge.setNonce(nonce);
        challenge.setWalletAddress(request.walletAddress());
        challenge.setBlockchain(SUPPORTED_BLOCKCHAIN);
        challenge.setNetwork(request.network());
        challenge.setChallengeMessage(message);
        challenge.setRecipient(RECIPIENT);
        challenge.setUserId(user.getUserId());
        challenge.setExpiresAt(LocalDateTime.now().plusMinutes(5));
        challenge.setUsed(false);

        WalletChallengeModel savedChallenge =
                challengeRepository.saveAndFlush(challenge);

        log.info(
                "[WALLET] Challenge saved successfully. Challenge ID={}, expiresAt={}",
                savedChallenge.getChallengeId(),
                savedChallenge.getExpiresAt()
        );

        return new WalletChallengeResponse(
                message,
                nonce,
                RECIPIENT,
                challenge.getExpiresAt()
        );
    }

    @Transactional
    public WalletAuthResponse verifyWallet(
            WalletVerificationRequest request,
            UserModel user) {

        log.info("========== WALLET VERIFICATION STARTED ==========");
        log.info("[WALLET] User ID: {}", user.getUserId());
        log.info("[WALLET] Account ID: {}", request.accountId());
        log.info("[WALLET] Network: {}", request.network());

        WalletChallengeModel challenge = challengeRepository
                .findByNonce(request.nonce())
                .orElseThrow(() -> {
                    log.error("[WALLET] Challenge not found.");

                    return new ResponseStatusException(
                            HttpStatus.NOT_FOUND,
                            "Wallet challenge not found"
                    );
                });

        log.info(
                "[WALLET] Challenge found. ID={}, used={}",
                challenge.getChallengeId(),
                challenge.isUsed()
        );

        if (challenge.isUsed()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Wallet challenge has already been used"
            );
        }

        if (challenge.getExpiresAt().isBefore(LocalDateTime.now())) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Wallet challenge has expired"
            );
        }

        if (!challenge.getUserId().equals(user.getUserId())) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Challenge does not belong to this user"
            );
        }

        if (!challenge.getWalletAddress().equals(request.accountId())) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Wallet address mismatch"
            );
        }

        if (!challenge.getBlockchain().equalsIgnoreCase(request.blockchain())
                || challenge.getNetwork() != request.network()) {

            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Blockchain network mismatch"
            );
        }

        log.info("[WALLET] Challenge validation passed.");
        log.info("[WALLET] Verifying NEP-413 signature...");

        boolean validSignature = signatureVerifier.verify(
                challenge.getChallengeMessage(),
                challenge.getNonce(),
                challenge.getRecipient(),
                request.publicKey(),
                request.signature()
        );

        if (!validSignature) {
            log.warn(
                    "[WALLET] Signature verification failed for account={}",
                    request.accountId()
            );

            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Invalid wallet signature"
            );
        }

        log.info("[WALLET] NEP-413 signature verified.");

        log.info("[WALLET] Verifying NEAR access key...");

        boolean validAccessKey = accessKeyVerifier.isAccessKeyForAccount(
                request.accountId(),
                request.publicKey(),
                request.network()
        );

        if (!validAccessKey) {
            log.warn(
                    "[WALLET] Access-key verification failed. Account={}, network={}",
                    request.accountId(),
                    request.network()
            );

            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Signing key does not belong to the supplied NEAR account"
            );
        }

        log.info("[WALLET] NEAR access key verified.");

        WalletModel wallet = walletRepository
                .findByWalletAddressAndBlockchainAndNetwork(
                        request.accountId(),
                        SUPPORTED_BLOCKCHAIN,
                        request.network()
                )
                .orElseGet(() -> {
                    log.info("[WALLET] Creating new WalletModel.");
                    return new WalletModel();
                });

        if (wallet.getUser() != null
                && !wallet.getUser().getUserId().equals(user.getUserId())) {

            log.warn(
                    "[WALLET] Wallet {} is already linked to another user.",
                    request.accountId()
            );

            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "This wallet is already linked to another PayProof account"
            );
        }

        if (wallet.getWalletId() == null) {
            wallet.setWalletId(UUID.randomUUID().toString());
        }

        wallet.setWalletAddress(request.accountId());
        wallet.setBlockchain(SUPPORTED_BLOCKCHAIN);
        wallet.setNetwork(request.network());
        wallet.setStatus(WalletStatus.CONNECTED);
        wallet.setUser(user);
        wallet.setConnectedAt(LocalDateTime.now());
        wallet.setRevokedAt(null);

        log.info("[WALLET] Saving wallet...");
        log.info("[WALLET] Wallet ID: {}", wallet.getWalletId());
        log.info("[WALLET] Wallet Address: {}", wallet.getWalletAddress());
        log.info("[WALLET] Blockchain: {}", wallet.getBlockchain());
        log.info("[WALLET] Network: {}", wallet.getNetwork());
        log.info("[WALLET] Status: {}", wallet.getStatus());
        log.info("[WALLET] User ID: {}", user.getUserId());

        WalletModel savedWallet = walletRepository.saveAndFlush(wallet);

        log.info(
                "[WALLET] Wallet successfully flushed. ID={}",
                savedWallet.getWalletId()
        );

        challenge.setUsed(true);
        challengeRepository.saveAndFlush(challenge);

        log.info("[WALLET] Challenge marked as used.");
        log.info("========== WALLET VERIFICATION COMPLETED ==========");

        return new WalletAuthResponse(
                user.getUserId(),
                savedWallet.getWalletAddress(),
                savedWallet.getBlockchain(),
                savedWallet.getNetwork().name(),
                user.getRole(),
                "NEAR wallet linked successfully"
        );
    }

    @Transactional
    public void revokeWallet(UserModel user) {

        log.info("[WALLET] Revoking wallet for user={}", user.getUserId());

        WalletModel wallet = walletRepository.findByUser(user)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "No wallet is linked to this account"
                ));

        if (wallet.getStatus() == WalletStatus.REVOKED) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Wallet is already disconnected"
            );
        }

        wallet.setStatus(WalletStatus.REVOKED);
        wallet.setRevokedAt(LocalDateTime.now());

        walletRepository.saveAndFlush(wallet);

        log.info(
                "[WALLET] Wallet revoked successfully. ID={}",
                wallet.getWalletId()
        );
    }

    private void validateNetwork(
            String blockchain,
            BlockchainNetwork network) {

        if (!SUPPORTED_BLOCKCHAIN.equalsIgnoreCase(blockchain)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Only NEAR wallets are supported"
            );
        }

        if (network == null) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Network is required"
            );
        }
    }

    private String generateNonce() {
        byte[] nonce = new byte[32];
        secureRandom.nextBytes(nonce);

        return Base64.getEncoder().encodeToString(nonce);
    }
}