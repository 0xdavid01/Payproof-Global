package com.example.payproof.service;

import com.example.payproof.components.IDGenerator;
import com.example.payproof.dto.request.CreateEscrowRequest;
import com.example.payproof.dto.response.CreateEscrowResponse;
import com.example.payproof.enums.EscrowCreationStatus;
import com.example.payproof.enums.PaymentCurrency;
import com.example.payproof.enums.WalletStatus;
import com.example.payproof.model.JobModel;
import com.example.payproof.model.UserModel;
import com.example.payproof.model.WalletModel;
import com.example.payproof.repository.JobRepository;
import com.example.payproof.repository.WalletRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class EscrowCreationService {

    private static final BigDecimal YOCTO_PER_NEAR =
            new BigDecimal("1000000000000000000000000");

    private static final String NEAR_GAS = "100000000000000";
    private static final BigInteger PLATFORM_FEE_BPS = BigInteger.valueOf(350);
    private static final BigInteger BASIS_POINTS = BigInteger.valueOf(10_000);

    private final JobRepository jobRepository;
    private final WalletRepository walletRepository;
    private final IDGenerator idGenerator;
    private final ActivityLogService activityLogService;

    @Value("${near.escrow-contract-id}")
    private String escrowContractId;

    @Value("${near.network:testnet}")
    private String nearNetwork;

    @Value("${near.usdt-contract-id}")
    private String usdtContractId;

    @Value("${near.usdc-contract-id}")
    private String usdcContractId;

    @Transactional
    public CreateEscrowResponse prepareEscrow(
            CreateEscrowRequest request,
            UserModel authenticatedUser
    ) {
        JobModel job = jobRepository.findByIdForUpdate(request.getJobId())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Job not found"
                ));

        if (!job.getClient().getUserId().equals(authenticatedUser.getUserId())) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN, "You do not own this job"
            );
        }

        validateJob(job);

        if (job.getEscrowId() != null && !job.getEscrowId().isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT, "This job already has a confirmed escrow"
            );
        }

        if (job.getCurrency() != PaymentCurrency.NEAR) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_IMPLEMENTED,
                    "Only NEAR escrow funding is currently enabled"
            );
        }

        String clientWallet = getConnectedWallet(job.getClient());
        String freelancerWallet = getConnectedWallet(job.getFreelancer());

        if (clientWallet.equals(freelancerWallet)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Client and freelancer cannot use the same wallet"
            );
        }

        String amount = toYoctoNear(job.getBudget());
        String totalFunding = totalFundingAmount(amount);

        if (job.getEscrowCreationStatus() == EscrowCreationStatus.CONFIRMED) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT, "This job already has a confirmed escrow"
            );
        }

        if (job.getEscrowCreationStatus() == EscrowCreationStatus.RESERVED) {
            if (job.getEscrowCreationTransactionHash() != null
                    && !job.getEscrowCreationTransactionHash().isBlank()) {
                throw new ResponseStatusException(
                        HttpStatus.CONFLICT,
                        "A transaction has already been submitted. Check its status before retrying."
                );
            }

            if (!clientWallet.equals(job.getEscrowCreationClientWallet())
                    || !freelancerWallet.equals(job.getEscrowCreationFreelancerWallet())
                    || (!totalFunding.equals(job.getEscrowCreationAmount())
                    && !amount.equals(job.getEscrowCreationAmount()))) {
                throw new ResponseStatusException(
                        HttpStatus.CONFLICT,
                        "The existing reservation does not match the current wallets or funding amount."
                );
            }

            if (!totalFunding.equals(job.getEscrowCreationAmount())) {
                job.setEscrowCreationAmount(totalFunding);
                jobRepository.saveAndFlush(job);
            }

            return buildNearPreparation(
                    job,
                    job.getEscrowCreationId(),
                    clientWallet,
                    freelancerWallet,
                    amount,
                    totalFunding
            );
        }

        String escrowId = idGenerator.generateEscrowId();

        job.setEscrowCreationId(escrowId);
        job.setEscrowCreationStatus(EscrowCreationStatus.RESERVED);
        job.setEscrowCreationReservedAt(LocalDateTime.now());
        job.setEscrowCreationTransactionHash(null);
        job.setEscrowCreationClientWallet(clientWallet);
        job.setEscrowCreationFreelancerWallet(freelancerWallet);
        job.setEscrowCreationAmount(totalFunding);

        jobRepository.saveAndFlush(job);

        return buildNearPreparation(
                job, escrowId, clientWallet, freelancerWallet, amount, totalFunding
        );
    }

    private void validateJob(JobModel job) {
        if (job.getFreelancer() == null) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "No freelancer has been assigned to this job"
            );
        }

        if (job.getFreelancer().getUserId().equals(job.getClient().getUserId())) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Client and freelancer must be different"
            );
        }

        if (!job.isContractApproved()
                || job.getContractStatus() == null
                || !job.getContractStatus().name().equals("APPROVED")
                || job.getClientApprovedContractVersion() == null
                || job.getFreelancerApprovedContractVersion() == null
                || !job.getClientApprovedContractVersion().equals(job.getContractVersion())
                || !job.getFreelancerApprovedContractVersion().equals(job.getContractVersion())) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "The contract must be approved by both parties"
            );
        }

        if (job.getStatus() == null
                || !job.getStatus().name().equals("AGREEMENT_APPROVED")) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "The job agreement has not been approved"
            );
        }

        if (job.getBudget() == null || job.getBudget().signum() <= 0) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "The job budget must be greater than zero"
            );
        }
    }

    private String toYoctoNear(BigDecimal budget) {
        try {
            return budget.multiply(YOCTO_PER_NEAR)
                    .setScale(0, RoundingMode.UNNECESSARY)
                    .toPlainString();
        } catch (ArithmeticException exception) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "NEAR amount has more precision than the network supports"
            );
        }
    }

    private CreateEscrowResponse buildNearPreparation(
            JobModel job,
            String escrowId,
            String clientWallet,
            String freelancerWallet,
            String amount,
            String totalFunding
    ) {
        BigInteger grossAmount = new BigInteger(amount);
        String platformFee = grossAmount
                .multiply(PLATFORM_FEE_BPS)
                .divide(BASIS_POINTS)
                .toString();

        Map<String, Object> args = Map.of(
                "escrow_id", escrowId,
                "freelancer", freelancerWallet,
                "amount", amount,
                "title", job.getTitle(),
                "description", job.getDescription()
        );

        return CreateEscrowResponse.builder()
                .escrowId(escrowId)
                .jobId(job.getJobId())
                .network(nearNetwork)
                .contractId(escrowContractId)
                .methodName("create_and_fund_with_near")
                .clientWalletAddress(clientWallet)
                .freelancerWalletAddress(freelancerWallet)
                .asset("Near")
                .amount(amount)
                .platformFee(platformFee)
                .attachedDeposit(totalFunding)
                .gas(NEAR_GAS)
                .args(args)
                .title(job.getTitle())
                .description(job.getDescription())
                .message("The attached deposit includes the project amount and the 3.5% client platform fee.")
                .build();
    }

    private String totalFundingAmount(String projectAmount) {
        BigInteger amount = new BigInteger(projectAmount);
        BigInteger fee = amount
                .multiply(PLATFORM_FEE_BPS)
                .divide(BASIS_POINTS);
        return amount.add(fee).toString();
    }

    @Transactional
    public void recordSubmission(
            String jobId,
            String escrowId,
            String transactionHash,
            UserModel authenticatedUser
    ) {
        JobModel job = jobRepository.findByIdForUpdate(jobId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Job not found"
                ));

        if (!job.getClient().getUserId().equals(authenticatedUser.getUserId())) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN, "You do not own this job"
            );
        }

        if (!escrowId.equals(job.getEscrowCreationId())) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT, "Escrow reservation does not match this job"
            );
        }

        if (job.getEscrowCreationStatus() == EscrowCreationStatus.CONFIRMED) {
            return;
        }

        if (job.getEscrowCreationStatus() != EscrowCreationStatus.RESERVED) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT, "No active escrow reservation exists"
            );
        }

        if (transactionHash == null || transactionHash.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Transaction hash is required"
            );
        }

        if (job.getEscrowCreationTransactionHash() != null
                && !job.getEscrowCreationTransactionHash().equals(transactionHash)) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "A different transaction hash is already recorded for this reservation"
            );
        }

        job.setEscrowCreationTransactionHash(transactionHash);
        jobRepository.save(job);
    }

    @Transactional
    public void confirmVerifiedEscrow(String jobId, String escrowId) {
        JobModel job = jobRepository.findByIdForUpdate(jobId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Job not found"
                ));

        if (!escrowId.equals(job.getEscrowCreationId())) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT, "Escrow reservation does not match this job"
            );
        }

        if (job.getEscrowCreationStatus() == EscrowCreationStatus.CONFIRMED) {
            return;
        }

        if (job.getEscrowCreationStatus() != EscrowCreationStatus.RESERVED) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT, "No active escrow reservation exists"
            );
        }

        job.setEscrowId(escrowId);
        job.setEscrowCreationStatus(EscrowCreationStatus.CONFIRMED);
        jobRepository.save(job);
        activityLogService.record(
                job,
                job.getClient(),
                "ESCROW_FUNDED",
                "Funded the project escrow on NEAR."
        );
    }

    private String getConnectedWallet(UserModel user) {
        return walletRepository.findByUser(user)
                .filter(wallet -> wallet.getStatus() == WalletStatus.CONNECTED)
                .filter(wallet -> "NEAR".equalsIgnoreCase(wallet.getBlockchain()))
                .filter(wallet -> wallet.getNetwork() != null
                        && wallet.getNetwork().name().equalsIgnoreCase(nearNetwork))
                .map(WalletModel::getWalletAddress)
                .filter(address -> address != null && !address.isBlank())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "A connected NEAR wallet is required"
                ));
    }
}