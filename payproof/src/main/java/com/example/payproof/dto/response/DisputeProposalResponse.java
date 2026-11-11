package com.example.payproof.dto.response;

import java.time.LocalDateTime;

public record DisputeProposalResponse(
        String escrowId,
        String freelancerAmountYocto,
        String clientAmountYocto,
        String feeYocto,
        String reason,
        boolean clientAccepted,
        boolean freelancerAccepted,
        String myRole,            // "CLIENT" | "FREELANCER"
        boolean canAccept,        // proposal open, I haven't accepted, other side hasn't finished
        boolean canReject,        // proposal open, I haven't accepted yet
        boolean canRevoke         // I already accepted, other side hasn't yet
) {}