package com.example.payproof_admin.signer;

public record ProposeSplitRequest(
        String escrowId,
        String freelancerAmountYocto,
        String reason
) {}