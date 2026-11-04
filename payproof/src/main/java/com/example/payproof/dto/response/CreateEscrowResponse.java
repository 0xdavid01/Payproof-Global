package com.example.payproof.dto.response;

import lombok.Builder;
import lombok.Getter;

import java.util.Map;

@Getter
@Builder
public class CreateEscrowResponse {

    private String escrowId;
    private String jobId;
    private String network;
    private String contractId;
    private String tokenContractId;
    private String methodName;

    private String clientWalletAddress;
    private String freelancerWalletAddress;

    private String asset;
    private String amount;
    private String attachedDeposit;
    private String gas;

    private Map<String, Object> args;

    private String title;
    private String description;
    private String message;
}