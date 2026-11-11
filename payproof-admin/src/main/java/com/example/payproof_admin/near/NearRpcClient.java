package com.example.payproof_admin.near;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;

@Component
public class NearRpcClient {

    private static final Logger log = LoggerFactory.getLogger(NearRpcClient.class);

    private final ObjectMapper objectMapper;
    private final RestClient restClient;

    @Value("${payproof.near.rpc-url}")
    private String rpcUrl;

    @Value("${payproof.near.contract-id}")
    private String contractId;

    public NearRpcClient(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
        this.restClient = RestClient.create();
    }

    public JsonNode getEscrow(String escrowId) {
        return callView("get_escrow", Map.of("escrow_id", escrowId));
    }

    public JsonNode getDisputeProposal(String escrowId) {
        return callView("get_dispute_proposal", Map.of("escrow_id", escrowId));
    }

    public JsonNode getSplitSettlement(String escrowId) {
        return callView("get_split_settlement", Map.of("escrow_id", escrowId));
    }

    public JsonNode getPlatformConfiguration() {
        return callView("get_platform_configuration", Map.of());
    }

    public JsonNode getAccruedFees() {
        return callView("get_accrued_fees", Map.of());
    }

    public JsonNode txStatus(String txHash, String senderAccountId) {
        return rpcCall("tx", Map.of(
                "tx_hash", txHash,
                "sender_account_id", senderAccountId,
                "wait_until", "EXECUTED_OPTIMISTIC"
        ));
    }

    private JsonNode callView(String method, Map<String, Object> args) {
        try {
            String json = objectMapper.writeValueAsString(args);
            String encoded = Base64.getEncoder()
                    .encodeToString(json.getBytes(StandardCharsets.UTF_8));

            JsonNode result = rpcCall("query", Map.of(
                    "request_type", "call_function",
                    "finality", "final",
                    "account_id", contractId,
                    "method_name", method,
                    "args_base64", encoded
            ));

            JsonNode bytes = result.path("result");
            if (!bytes.isArray()) {
                throw new ResponseStatusException(
                        HttpStatus.SERVICE_UNAVAILABLE,
                        "Contract returned an invalid response for " + method);
            }

            byte[] data = new byte[bytes.size()];
            for (int i = 0; i < bytes.size(); i++) {
                data[i] = (byte) bytes.get(i).asInt();
            }

            if (data.length == 0) {
                return null;
            }

            return objectMapper.readTree(new String(data, StandardCharsets.UTF_8));

        } catch (ResponseStatusException e) {
            throw e;
        } catch (Exception e) {
            log.error("Failed to call view {}", method, e);
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "Failed to call contract view " + method, e);
        }
    }

    private JsonNode rpcCall(String method, Map<String, Object> params) {
        Map<String, Object> payload = Map.of(
                "jsonrpc", "2.0",
                "id", "payproof-admin",
                "method", method,
                "params", params
        );

        String body;
        try {
            body = restClient.post()
                    .uri(rpcUrl)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(payload)
                    .retrieve()
                    .body(String.class);
        } catch (Exception e) {
            log.error("NEAR RPC HTTP failure: method={}, url={}", method, rpcUrl, e);
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE, "NEAR RPC unavailable", e);
        }

        if (body == null || body.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE, "Empty NEAR RPC response");
        }

        JsonNode response;
        try {
            response = objectMapper.readTree(body);
        } catch (Exception e) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE, "Unreadable NEAR RPC response", e);
        }

        if (response.has("error")) {
            log.warn("NEAR RPC error: method={}, error={}", method, response.path("error"));
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE, "NEAR RPC returned an error");
        }

        JsonNode result = response.path("result");
        if (result.isMissingNode() || result.isNull()) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE, "NEAR RPC returned no result");
        }
        return result;
    }

    public String getContractId() { return contractId; }
}