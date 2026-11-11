package com.example.payproof_admin.signer;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;

@Component
public class SignerClient {

    private static final Logger log = LoggerFactory.getLogger(SignerClient.class);

    private final WebClient client;
    private final String secret;

    public SignerClient(
            WebClient.Builder builder,
            @Value("${payproof.sidecar.base-url}") String baseUrl,
            @Value("${payproof.sidecar.secret}") String secret,
            @Value("${payproof.sidecar.timeout-ms:30000}") long timeoutMs) {
        this.client = builder.baseUrl(baseUrl).build();
        this.secret = secret;
        // Optional: apply timeout via HttpClient customization elsewhere.
    }

    public TxResult proposeSplit(ProposeSplitRequest req) {
        return post("/proposeSplit", req);
    }

    public TxResult cancelSplit(CancelSplitRequest req) {
        return post("/cancelSplit", req);
    }

    public TxResult retrySplit(RetrySplitRequest req) {
        return post("/retrySplit", req);
    }

    private TxResult post(String path, Object body) {
        try {
            TxResult result = client.post()
                    .uri(path)
                    .header("X-Sidecar-Secret", secret)
                    .bodyValue(body)
                    .retrieve()
                    .bodyToMono(TxResult.class)
                    .block(Duration.ofMillis(30_000));

            if (result == null || result.txHash() == null || result.txHash().isBlank()) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_GATEWAY, "Sidecar returned an empty tx hash");
            }
            return result;

        } catch (ResponseStatusException e) {
            throw e;
        } catch (Exception e) {
            log.error("Sidecar call failed: {}", path, e);
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY, "Signer sidecar unavailable: " + e.getMessage(), e);
        }
    }
}