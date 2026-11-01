package com.example.payproof.service;

import com.example.payproof.enums.BlockchainNetwork;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.Map;

@Component
public class NearAccessKeyVerifier {

    private final ObjectMapper objectMapper;
    private final RestClient restClient;

    public NearAccessKeyVerifier(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
        this.restClient = RestClient.create();
    }

    public boolean isFullAccessKey(
            String accountId,
            String publicKey,
            BlockchainNetwork network
    ) {
        try {
            String rpcUrl = getRpcUrl(network);

            Map<String, Object> request = Map.of(
                    "jsonrpc", "2.0",
                    "id", "payproof",
                    "method", "query",
                    "params", Map.of(
                            "request_type", "view_access_key",
                            "finality", "final",
                            "account_id", accountId,
                            "public_key", publicKey
                    )
            );

            String response = restClient.post()
                    .uri(rpcUrl)
                    .body(request)
                    .retrieve()
                    .body(String.class);

            if (response == null || response.isBlank()) {
                return false;
            }

            JsonNode root = objectMapper.readTree(response);

            if (root.has("error") || !root.has("result")) {
                return false;
            }

            JsonNode permission = root.path("result").path("permission");

            return permission.isTextual()
                    && "FullAccess".equals(permission.asText());

        } catch (Exception exception) {
            return false;
        }
    }

    private String getRpcUrl(BlockchainNetwork network) {
        return switch (network) {
            case MAINNET -> "https://rpc.mainnet.near.org";
            case TESTNET -> "https://rpc.testnet.near.org";
        };
    }
}