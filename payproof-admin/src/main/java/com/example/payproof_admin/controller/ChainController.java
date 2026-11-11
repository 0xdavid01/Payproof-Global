package com.example.payproof_admin.controller;

import com.example.payproof_admin.near.NearRpcClient;
import tools.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/chain")
@RequiredArgsConstructor
public class ChainController {

    private final NearRpcClient nearRpcClient;

    @GetMapping("/config")
    public JsonNode config() {
        return nearRpcClient.getPlatformConfiguration();
    }

    @GetMapping("/fees")
    public JsonNode fees() {
        return nearRpcClient.getAccruedFees();
    }

    @GetMapping("/tx/{hash}")
    public JsonNode tx(@PathVariable String hash, @RequestParam String sender) {
        return nearRpcClient.txStatus(hash, sender);
    }
}