package com.example.payproof_admin.controller;

import com.example.payproof_admin.dto.DisputedEscrowView;
import com.example.payproof_admin.near.NearRpcClient;
import com.example.payproof_admin.service.DisputeQueryService;
import tools.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/disputes")
@RequiredArgsConstructor
public class DisputeQueryController {

    private final DisputeQueryService disputeQueryService;
    private final NearRpcClient nearRpcClient;

    @GetMapping
    public List<DisputedEscrowView> list() {
        return disputeQueryService.listDisputedEscrows();
    }

    @GetMapping("/{escrowId}")
    public DisputedEscrowView get(@PathVariable String escrowId) {
        return disputeQueryService.getDispute(escrowId);
    }

    @GetMapping("/{escrowId}/escrow")
    public JsonNode liveEscrow(@PathVariable String escrowId) {
        return nearRpcClient.getEscrow(escrowId);
    }

    @GetMapping("/{escrowId}/proposal")
    public JsonNode liveProposal(@PathVariable String escrowId) {
        return nearRpcClient.getDisputeProposal(escrowId);
    }

    @GetMapping("/{escrowId}/split")
    public JsonNode liveSplit(@PathVariable String escrowId) {
        return nearRpcClient.getSplitSettlement(escrowId);
    }
}