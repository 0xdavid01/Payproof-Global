package com.example.payproof.service;

import com.example.payproof.dto.request.WalletChallengeRequest;
import com.example.payproof.dto.request.WalletVerificationRequest;
import com.example.payproof.dto.response.WalletAuthResponse;
import com.example.payproof.dto.response.WalletChallengeResponse;
import com.example.payproof.enums.WalletStatus;
import com.example.payproof.model.WalletChallengeModel;
import com.example.payproof.model.WalletModel;
import com.example.payproof.repository.WalletChallengeRepository;
import com.example.payproof.repository.WalletRepository;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.transaction.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.List;
import java.util.UUID;

@Service
public class WalletAuthService {

    private static final String RECIPIENT = "payproof";
    private static final String SUPPORTED_BLOCKCHAIN = "NEAR";

    private final WalletRepository walletRepository;
    private final WalletChallengeRepository challengeRepository;
    private final NearSignatureVerifier signatureVerifier;
    private final NearAccessKeyVerifier accessKeyVerifier;
    private final SecureRandom secureRandom = new SecureRandom();

    public WalletAuthService(
            WalletRepository walletRepository,
            WalletChallengeRepository challengeRepository,
            NearSignatureVerifier signatureVerifier,
            NearAccessKeyVerifier accessKeyVerifier
    ) {
        this.walletRepository = walletRepository;
        this.challengeRepository = challengeRepository;
        this.signatureVerifier = signatureVerifier;
        this.accessKeyVerifier = accessKeyVerifier;
    }

    public WalletChallengeResponse createChallenge(
            WalletChallengeRequest request
    ) {
        if (!SUPPORTED_BLOCKCHAIN.equalsIgnoreCase(request.blockchain())) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Unsupported blockchain"
            );
        }

        byte[] nonceBytes = new byte[32];
        secureRandom.nextBytes(nonceBytes);

        String nonce = Base64.getEncoder().encodeToString(nonceBytes);
        String message = "Sign in to PayProof. Challenge: " + UUID.randomUUID();

        WalletChallengeModel challenge = new WalletChallengeModel();
        challenge.setChallengeId(UUID.randomUUID().toString());
        challenge.setNonce(nonce);
        challenge.setWalletAddress(request.walletAddress());
        challenge.setBlockchain(request.blockchain().toUpperCase());
        challenge.setNetwork(request.network());
        challenge.setChallengeMessage(message);
        challenge.setRecipient(RECIPIENT);
        challenge.setExpiresAt(LocalDateTime.now().plusMinutes(5));
        challenge.setUsed(false);

        challengeRepository.save(challenge);

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
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse
    ) {
        WalletChallengeModel challenge = challengeRepository
                .findByNonce(request.nonce())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.UNAUTHORIZED,
                        "Invalid wallet challenge"
                ));

        if (challenge.isUsed()
                || challenge.getExpiresAt().isBefore(LocalDateTime.now())) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Challenge expired or already used"
            );
        }

        if (!challenge.getWalletAddress().equals(request.accountId())
                || !challenge.getBlockchain().equalsIgnoreCase(request.blockchain())
                || challenge.getNetwork() != request.network()) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Wallet details do not match the challenge"
            );
        }

        if (!signatureVerifier.verify(
                challenge.getChallengeMessage(),
                challenge.getNonce(),
                challenge.getRecipient(),
                request.publicKey(),
                request.signature()
        )) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Invalid wallet signature"
            );
        }

        if (!accessKeyVerifier.isFullAccessKey(
                request.accountId(),
                request.publicKey(),
                request.network()
        )) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "The signing key is not a full-access key for this account"
            );
        }

        WalletModel wallet = walletRepository
                .findByWalletAddressAndBlockchainAndNetworkAndStatus(
                        request.accountId(),
                        request.blockchain(),
                        request.network(),
                        WalletStatus.CONNECTED
                )
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "This wallet is not linked to a PayProof account"
                ));

        challenge.setUsed(true);
        challengeRepository.save(challenge);

        var user = wallet.getUser();

        var authentication = new UsernamePasswordAuthenticationToken(
                user,
                null,
                List.of(new SimpleGrantedAuthority(
                        "ROLE_" + user.getRole().name()
                ))
        );

        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);

        httpRequest.getSession(true);

        new HttpSessionSecurityContextRepository()
                .saveContext(context, httpRequest, httpResponse);

        return new WalletAuthResponse(
                user.getUserId(),
                wallet.getWalletAddress(),
                wallet.getBlockchain(),
                wallet.getNetwork().name(),
                user.getRole(),
                "Wallet authentication successful"
        );
    }
}