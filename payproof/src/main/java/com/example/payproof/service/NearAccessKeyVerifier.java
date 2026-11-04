
package com.example.payproof.service;

import com.example.payproof.enums.BlockchainNetwork;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.Map;

@Slf4j
@Component
public class NearAccessKeyVerifier {

    private final ObjectMapper objectMapper;
    private final RestClient restClient;

    public NearAccessKeyVerifier(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
        this.restClient = RestClient.create();
    }

    public boolean isAccessKeyForAccount(
            String accountId,
            String publicKey,
            BlockchainNetwork network
    ) {

        log.info(
                "[NEAR ACCESS KEY] Checking account={}, network={}",
                accountId,
                network
        );

        if (accountId == null || accountId.isBlank()
                || publicKey == null || publicKey.isBlank()
                || network == null) {

            log.warn("[NEAR ACCESS KEY] Missing account, public key or network.");
            return false;
        }

        try {
            String rpcUrl = getRpcUrl(network);

            String rpcPublicKey = publicKey.startsWith("ed25519:")
                    ? publicKey
                    : "ed25519:" + publicKey;

            Map<String, Object> request = Map.of(
                    "jsonrpc", "2.0",
                    "id", "payproof",
                    "method", "query",
                    "params", Map.of(
                            "request_type", "view_access_key",
                            "finality", "final",
                            "account_id", accountId,
                            "public_key", rpcPublicKey
                    )
            );

            log.debug("[NEAR ACCESS KEY] Calling RPC endpoint: {}", rpcUrl);

            String response = restClient.post()
                    .uri(rpcUrl)
                    .body(request)
                    .retrieve()
                    .body(String.class);

            if (response == null || response.isBlank()) {
                log.error(
                        "[NEAR ACCESS KEY] Empty RPC response for account={}",
                        accountId
                );
                return false;
            }

            JsonNode root = objectMapper.readTree(response);

            log.debug(
                    "[NEAR ACCESS KEY] RPC response for account={}: {}",
                    accountId,
                    root.toPrettyString()
            );

            if (root.has("error")) {
                log.error(
                        "[NEAR ACCESS KEY] RPC returned an error for account={}: {}",
                        accountId,
                        root.path("error").toPrettyString()
                );
                return false;
            }

            JsonNode result = root.path("result");

            if (!result.isObject()) {
                log.warn(
                        "[NEAR ACCESS KEY] Missing or invalid result for account={}",
                        accountId
                );
                return false;
            }

            JsonNode permission = result.path("permission");

            if (permission.isMissingNode() || permission.isNull()) {
                log.warn(
                        "[NEAR ACCESS KEY] Missing permission field. Result={}",
                        result.toPrettyString()
                );
                return false;
            }

            boolean validAccessKey =
                    (permission.isTextual()
                            && "FullAccess".equals(permission.asText()))
                            || (permission.isObject()
                            && permission.has("FunctionCall"));

            log.info(
                    "[NEAR ACCESS KEY] Account={}, permission={}, valid={}",
                    accountId,
                    permission,
                    validAccessKey
            );

            return validAccessKey;

        } catch (Exception exception) {
            log.error(
                    "[NEAR ACCESS KEY] Verification failed for account={} network={}",
                    accountId,
                    network,
                    exception
            );

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
