
package com.example.payproof.service;

import com.example.payproof.model.JobModel;
import com.example.payproof.model.UserModel;
import com.example.payproof.enums.UserRole;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class NearTransactionVerifier {

    private static final String ESCROW_METHOD = "create_and_fund_with_near";
    private static final String ESCROW_QUERY_METHOD = "get_escrow";
    private static final String RELEASE_METHOD = "approve_work";
    private static final String DISPUTE_METHOD = "raise_dispute";
    private static final String REFUND_REQUEST_METHOD = "request_refund";
    private static final BigInteger PLATFORM_FEE_BPS = BigInteger.valueOf(350);
    private static final BigInteger BASIS_POINTS = BigInteger.valueOf(10_000);

    private final ObjectMapper objectMapper;

    @Value("${near.rpc-url}")
    private String rpcUrl;

    @Value("${near.escrow-contract-id}")
    private String escrowContractId;

    public void verify(JobModel job, String transactionHash) {

        String escrowId = job != null ? job.getEscrowCreationId() : null;

        try {
            if (job == null) {
                throw invalid("Job information is missing.");
            }

            String signer = job.getEscrowCreationClientWallet();

            if (signer == null || signer.isBlank()
                    || escrowId == null || escrowId.isBlank()) {
                throw invalid("The escrow reservation is missing required details.");
            }

            if (transactionHash == null || transactionHash.isBlank()) {
                throw invalid("The transaction hash is missing.");
            }

            if (rpcUrl == null || rpcUrl.isBlank()) {
                throw unavailable("NEAR RPC URL is not configured.");
            }

            if (escrowContractId == null || escrowContractId.isBlank()) {
                throw unavailable("NEAR escrow contract ID is not configured.");
            }

            log.info(
                    "Starting NEAR verification. escrowId={}, transactionHash={}, signer={}, contract={}",
                    escrowId,
                    transactionHash,
                    signer,
                    escrowContractId
            );

            JsonNode txResult = rpcCall(
                    "EXPERIMENTAL_tx_status",
                    Map.of(
                            "tx_hash", transactionHash,
                            "sender_account_id", signer,
                            "wait_until", "FINAL"
                    )
            );

            JsonNode transaction = txResult.path("transaction");

            if (transaction.isMissingNode() || transaction.isNull()) {
                throw unavailable(
                        "NEAR has not returned the transaction yet."
                );
            }

            String receiverId = transaction.path("receiver_id").asText();
            String signerId = transaction.path("signer_id").asText();

            if (!escrowContractId.equals(receiverId)) {
                throw invalid("The transaction was sent to the wrong contract.");
            }

            if (!signer.equals(signerId)) {
                throw invalid(
                        "The transaction signer does not match the reserved client wallet."
                );
            }

            JsonNode status = txResult.path("status");

            if (status.has("Failure")) {
                log.warn(
                        "NEAR transaction execution failed. escrowId={}, transactionHash={}, failure={}",
                        escrowId,
                        transactionHash,
                        status.path("Failure")
                );

                throw invalid("The NEAR transaction execution failed.");
            }

            if (!status.has("SuccessValue")
                    && !status.has("SuccessReceiptId")) {
                throw unavailable(
                        "The NEAR transaction has not reached a verifiable successful outcome."
                );
            }

            verifyFunctionCall(transaction, job, escrowId);
            verifyContractEscrow(escrowId, job);

            log.info(
                    "NEAR escrow successfully verified. escrowId={}, transactionHash={}",
                    escrowId,
                    transactionHash
            );

        } catch (ResponseStatusException exception) {

            log.warn(
                    "NEAR verification rejected or pending. escrowId={}, transactionHash={}, status={}, reason={}",
                    escrowId,
                    transactionHash,
                    exception.getStatusCode(),
                    exception.getReason(),
                    exception
            );

            throw exception;

        } catch (Exception exception) {

            log.error(
                    "Unexpected NEAR verification failure. escrowId={}, transactionHash={}, rpcUrl={}",
                    escrowId,
                    transactionHash,
                    rpcUrl,
                    exception
            );

            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "An unexpected error occurred while verifying the NEAR transaction.",
                    exception
            );
        }
    }

    public void verifyRelease(JobModel job, String transactionHash) {
        String escrowId = job != null ? job.getEscrowId() : null;

        if (job == null || escrowId == null || escrowId.isBlank()) {
            throw invalid("The job does not have a confirmed escrow.");
        }
        verifyReleaseTransaction(job, transactionHash, escrowId);
    }

        public void verifyDisputeRequest(
                JobModel job,
                UserModel requester,
                String transactionHash,
                String reason,
                boolean refundRequest
        ) {
            String escrowId = job != null ? job.getEscrowId() : null;
            if (job == null || escrowId == null || escrowId.isBlank()) {
                throw invalid("The job does not have a confirmed escrow.");
            }
            if (transactionHash == null || transactionHash.isBlank()) {
                throw invalid("The dispute transaction hash is required.");
            }

            String expectedSigner = requester.getRole() == UserRole.CLIENT
                    ? job.getEscrowCreationClientWallet()
                    : job.getEscrowCreationFreelancerWallet();
            if (expectedSigner == null || expectedSigner.isBlank()) {
                throw invalid("The requester's wallet is missing from the escrow reservation.");
            }

            JsonNode txResult = rpcCall(
                    "EXPERIMENTAL_tx_status",
                    Map.of(
                            "tx_hash", transactionHash,
                            "sender_account_id", expectedSigner,
                            "wait_until", "FINAL"
                    )
            );
            JsonNode transaction = txResult.path("transaction");
            if (transaction.isMissingNode() || transaction.isNull()) {
                throw unavailable("NEAR has not returned the dispute transaction yet.");
            }
            if (!escrowContractId.equals(transaction.path("receiver_id").asText())) {
                throw invalid("The dispute transaction was sent to the wrong contract.");
            }
            if (!expectedSigner.equals(transaction.path("signer_id").asText())) {
                throw invalid("The dispute transaction signer does not match the linked project wallet.");
            }

            JsonNode status = txResult.path("status");
            if (status.has("Failure")) {
                throw invalid("The NEAR dispute transaction failed.");
            }
            if (!status.has("SuccessValue") && !status.has("SuccessReceiptId")) {
                throw unavailable("The dispute transaction has not reached a successful outcome.");
            }

            verifyDisputeFunctionCall(
                    transaction,
                    escrowId,
                    reason,
                    refundRequest
            );
            verifyDisputedEscrow(escrowId, job, reason);
        }

        private void verifyDisputeFunctionCall(
                JsonNode transaction,
                String escrowId,
                String reason,
                boolean refundRequest
        ) {
            String expectedMethod = refundRequest
                    ? REFUND_REQUEST_METHOD
                    : DISPUTE_METHOD;
            JsonNode actions = transaction.path("actions");
            if (!actions.isArray()) {
                throw invalid("The dispute transaction contains no readable actions.");
            }

            for (JsonNode action : actions) {
                JsonNode functionCall = action.path("FunctionCall");
                if (functionCall.isMissingNode()
                        || functionCall.isNull()
                        || !expectedMethod.equals(functionCall.path("method_name").asText())) {
                    continue;
                }

                JsonNode args;
                try {
                    args = objectMapper.readTree(
                            Base64.getDecoder().decode(functionCall.path("args").asText())
                    );
                } catch (Exception exception) {
                    throw invalid("The dispute transaction arguments are invalid.");
                }

                if (!escrowId.equals(args.path("escrow_id").asText())
                        || !reason.equals(args.path("reason").asText())) {
                    throw invalid("The dispute transaction does not match this request.");
                }
                if (!"1".equals(functionCall.path("deposit").asText())) {
                    throw invalid("The dispute transaction must attach exactly one yoctoNEAR.");
                }
                return;
            }

            throw invalid("The transaction did not call the expected dispute method.");
        }

        private void verifyDisputedEscrow(
                String escrowId,
                JobModel job,
                String reason
        ) {
            String args = objectMapper.writeValueAsString(Map.of("escrow_id", escrowId));
            String encodedArgs = Base64.getEncoder().encodeToString(
                    args.getBytes(StandardCharsets.UTF_8)
            );
            JsonNode result = rpcCall(
                    "query",
                    Map.of(
                            "request_type", "call_function",
                            "finality", "final",
                            "account_id", escrowContractId,
                            "method_name", ESCROW_QUERY_METHOD,
                            "args_base64", encodedArgs
                    )
            );

            JsonNode bytes = result.path("result");
            if (!bytes.isArray()) {
                throw unavailable("The escrow contract returned an invalid response.");
            }
            byte[] data = new byte[bytes.size()];
            for (int i = 0; i < bytes.size(); i++) {
                data[i] = (byte) bytes.get(i).asInt();
            }

            JsonNode escrow;
            try {
                escrow = objectMapper.readTree(new String(data, StandardCharsets.UTF_8));
            } catch (Exception exception) {
                throw unavailable("The escrow contract response could not be parsed.");
            }

            if (!escrowId.equals(escrow.path("escrow_id").asText())
                    || !"Disputed".equalsIgnoreCase(escrow.path("status").asText())
                    || !reason.equals(escrow.path("dispute_reason").asText())) {
                throw unavailable("The on-chain dispute has not been confirmed.");
            }
            if (!job.getEscrowCreationClientWallet().equals(escrow.path("client").asText())
                    || !job.getEscrowCreationFreelancerWallet().equals(
                            escrow.path("freelancer").asText())) {
                throw invalid("The on-chain dispute participants do not match this project.");
            }
        }

    private void verifyReleaseTransaction(
            JobModel job,
            String transactionHash,
            String escrowId
    ) {
        if (transactionHash == null || transactionHash.isBlank()) {
            throw invalid("The release transaction hash is required.");
        }
        if (job.getEscrowCreationClientWallet() == null
                || job.getEscrowCreationClientWallet().isBlank()) {
            throw invalid("The escrow reservation does not contain a client wallet.");
        }

        JsonNode txResult = rpcCall(
                "EXPERIMENTAL_tx_status",
                Map.of(
                        "tx_hash", transactionHash,
                        "sender_account_id", job.getEscrowCreationClientWallet(),
                        "wait_until", "FINAL"
                )
        );
        JsonNode transaction = txResult.path("transaction");
        if (transaction.isMissingNode() || transaction.isNull()) {
            throw unavailable("NEAR has not returned the release transaction yet.");
        }
        if (!escrowContractId.equals(transaction.path("receiver_id").asText())) {
            throw invalid("The release transaction was sent to the wrong contract.");
        }
        if (!job.getEscrowCreationClientWallet().equals(
                transaction.path("signer_id").asText()
        )) {
            throw invalid("The release transaction signer is not the client wallet.");
        }

        JsonNode status = txResult.path("status");
        if (status.has("Failure")) {
            throw invalid("The NEAR release transaction failed.");
        }
        if (!status.has("SuccessValue") && !status.has("SuccessReceiptId")) {
            throw unavailable("The release transaction has not reached a successful outcome.");
        }

        verifyReleaseFunctionCall(transaction, escrowId);
        if (!isEscrowReleased(escrowId)) {
            throw unavailable("The escrow payout has not been confirmed on NEAR yet.");
        }
    }

    private void verifyReleaseFunctionCall(JsonNode transaction, String escrowId) {
        JsonNode actions = transaction.path("actions");
        if (!actions.isArray()) {
            throw invalid("The release transaction contains no readable actions.");
        }

        for (JsonNode action : actions) {
            JsonNode functionCall = action.path("FunctionCall");
            if (functionCall.isMissingNode() || functionCall.isNull()
                    || !RELEASE_METHOD.equals(functionCall.path("method_name").asText())) {
                continue;
            }

            String encodedArgs = functionCall.path("args").asText();
            JsonNode args;
            try {
                args = objectMapper.readTree(Base64.getDecoder().decode(encodedArgs));
            } catch (Exception exception) {
                throw invalid("The release transaction arguments are invalid.");
            }

            if (!escrowId.equals(args.path("escrow_id").asText())) {
                throw invalid("The release transaction contains a different escrow ID.");
            }
            if (!"1".equals(functionCall.path("deposit").asText())) {
                throw invalid("The release transaction must attach exactly one yoctoNEAR.");
            }
            return;
        }

        throw invalid("The transaction did not call approve_work.");
    }

    public boolean isEscrowReleased(String escrowId) {
        if (escrowId == null || escrowId.isBlank()) {
            throw invalid("The escrow ID is required.");
        }

        String args = objectMapper.writeValueAsString(Map.of("escrow_id", escrowId));
        String encodedArgs = Base64.getEncoder().encodeToString(
                args.getBytes(StandardCharsets.UTF_8)
        );
        JsonNode result = rpcCall(
                "query",
                Map.of(
                        "request_type", "call_function",
                        "finality", "final",
                        "account_id", escrowContractId,
                        "method_name", ESCROW_QUERY_METHOD,
                        "args_base64", encodedArgs
                )
        );

        JsonNode bytes = result.path("result");
        if (!bytes.isArray()) {
            throw unavailable("The escrow contract returned an invalid response.");
        }

        byte[] data = new byte[bytes.size()];
        for (int i = 0; i < bytes.size(); i++) {
            data[i] = (byte) bytes.get(i).asInt();
        }

        JsonNode escrow;
        try {
            escrow = objectMapper.readTree(new String(data, StandardCharsets.UTF_8));
        } catch (Exception exception) {
            throw unavailable("The escrow contract response could not be parsed.");
        }

        if (!escrowId.equals(escrow.path("escrow_id").asText())) {
            throw invalid("The on-chain escrow ID does not match.");
        }

        return "Released".equalsIgnoreCase(escrow.path("status").asText());
    }

    public JsonNode getEscrowState(String escrowId) {
        if (escrowId == null || escrowId.isBlank()) {
            throw invalid("The escrow ID is required.");
        }

        String args = objectMapper.writeValueAsString(Map.of("escrow_id", escrowId));
        String encodedArgs = Base64.getEncoder().encodeToString(
                args.getBytes(StandardCharsets.UTF_8)
        );
        JsonNode result = rpcCall(
                "query",
                Map.of(
                        "request_type", "call_function",
                        "finality", "final",
                        "account_id", escrowContractId,
                        "method_name", ESCROW_QUERY_METHOD,
                        "args_base64", encodedArgs
                )
        );

        JsonNode bytes = result.path("result");
        if (!bytes.isArray()) {
            throw unavailable("The escrow contract returned an invalid response.");
        }

        byte[] data = new byte[bytes.size()];
        for (int i = 0; i < bytes.size(); i++) {
            data[i] = (byte) bytes.get(i).asInt();
        }

        try {
            JsonNode escrow = objectMapper.readTree(new String(data, StandardCharsets.UTF_8));
            return escrow == null || escrow.isNull() ? null : escrow;
        } catch (Exception exception) {
            throw unavailable("The escrow contract response could not be parsed.");
        }
    }

    private void verifyFunctionCall(
            JsonNode transaction,
            JobModel job,
            String escrowId
    ) {

        JsonNode actions = transaction.path("actions");

        if (!actions.isArray()) {
            throw invalid("The NEAR transaction contains no readable actions.");
        }

        boolean matchingCall = false;

        for (JsonNode action : actions) {

            JsonNode functionCall = action.path("FunctionCall");

            if (functionCall.isMissingNode() || functionCall.isNull()) {
                continue;
            }

            if (!ESCROW_METHOD.equals(
                    functionCall.path("method_name").asText()
            )) {
                continue;
            }

            String argsBase64 = functionCall.path("args").asText();

            if (argsBase64.isBlank()) {
                throw invalid("The escrow function call contains empty arguments.");
            }

            byte[] decoded;

            try {
                decoded = Base64.getDecoder().decode(argsBase64);
            } catch (IllegalArgumentException exception) {
                throw invalid("The escrow function arguments are invalid.");
            }

            JsonNode args = objectMapper.readTree(
                    new String(decoded, StandardCharsets.UTF_8)
            );

            String deposit = functionCall.path("deposit").asText();

            if (!escrowId.equals(args.path("escrow_id").asText())) {
                throw invalid("The transaction contains a different escrow ID.");
            }

            String expectedFreelancer =
                    job.getEscrowCreationFreelancerWallet();

            if (expectedFreelancer == null
                    || !expectedFreelancer.equals(
                    args.path("freelancer").asText()
            )) {
                throw invalid(
                        "The transaction contains a different freelancer wallet."
                );
            }

            String expectedAmount = toYoctoNear(job.getBudget());

            if (expectedAmount == null
                    || !expectedAmount.equals(args.path("amount").asText())) {
                throw invalid(
                        "The transaction amount does not match the reservation."
                );
            }

            String expectedFunding = totalFundingAmount(expectedAmount);

            if (!expectedFunding.equals(deposit)
                    || !expectedFunding.equals(job.getEscrowCreationAmount())) {
                throw invalid(
                        "The attached NEAR deposit does not include the expected platform fee."
                );
            }

            matchingCall = true;
        }

        if (!matchingCall) {
            throw invalid(
                    "The transaction did not call the expected escrow method."
            );
        }
    }

    private void verifyContractEscrow(
            String escrowId,
            JobModel job
    ) {

        String args = objectMapper.writeValueAsString(
                Map.of("escrow_id", escrowId)
        );

        String encodedArgs = Base64.getEncoder().encodeToString(
                args.getBytes(StandardCharsets.UTF_8)
        );

        JsonNode result = rpcCall(
                "query",
                Map.of(
                        "request_type", "call_function",
                        "finality", "final",
                        "account_id", escrowContractId,
                        "method_name", ESCROW_QUERY_METHOD,
                        "args_base64", encodedArgs
                )
        );

        JsonNode bytes = result.path("result");

        if (!bytes.isArray()) {
            throw unavailable(
                    "The escrow contract returned an invalid response."
            );
        }

        byte[] data = new byte[bytes.size()];

        for (int i = 0; i < bytes.size(); i++) {
            data[i] = (byte) bytes.get(i).asInt();
        }

        JsonNode escrow;

        try {
            escrow = objectMapper.readTree(
                    new String(data, StandardCharsets.UTF_8)
            );
        } catch (Exception exception) {
            throw unavailable(
                    "The escrow contract response could not be parsed."
            );
        }

        if (escrow == null || escrow.isNull() || escrow.isMissingNode()) {
            throw invalid("The escrow does not exist on the contract.");
        }

        if (!escrowId.equals(escrow.path("escrow_id").asText())) {
            throw invalid("The on-chain escrow ID does not match.");
        }

        if (!job.getEscrowCreationClientWallet().equals(
                escrow.path("client").asText()
        )) {
            throw invalid("The on-chain client does not match the reservation.");
        }

        if (!job.getEscrowCreationFreelancerWallet().equals(
                escrow.path("freelancer").asText()
        )) {
            throw invalid(
                    "The on-chain freelancer does not match the reservation."
            );
        }

        if (!"Funded".equalsIgnoreCase(
                escrow.path("status").asText()
        )) {
            throw unavailable(
                    "The on-chain escrow has not reached Funded status."
            );
        }

        String expectedAmount = toYoctoNear(job.getBudget());
        String expectedFunding = totalFundingAmount(expectedAmount);

        if (!expectedAmount.equals(
                escrow.path("amount").asText()
        )) {
            throw invalid(
                    "The on-chain amount does not match the reservation."
            );
        }

        if (!expectedFunding.equals(escrow.path("funded_amount").asText())
                || !expectedFunding.equals(job.getEscrowCreationAmount())) {
            throw invalid(
                    "The on-chain funded amount does not match the project amount and platform fee."
            );
        }

        if (!"Near".equalsIgnoreCase(
                escrow.path("asset").asText()
        )) {
            throw invalid(
                    "The on-chain escrow uses a different asset."
            );
        }

    }

    private String totalFundingAmount(String projectAmount) {
        BigInteger grossAmount = new BigInteger(projectAmount);
        BigInteger fee = grossAmount
                .multiply(PLATFORM_FEE_BPS)
                .divide(BASIS_POINTS);
        return grossAmount.add(fee).toString();
    }

    private String toYoctoNear(java.math.BigDecimal amount) {
        return amount.multiply(new java.math.BigDecimal("1000000000000000000000000"))
                .toBigIntegerExact()
                .toString();
    }

    private JsonNode rpcCall(
            String method,
            Map<String, Object> params
    ) {

        Map<String, Object> payload = Map.of(
                "jsonrpc", "2.0",
                "id", "payproof",
                "method", method,
                "params", params
        );

        String responseBody;

        try {
            responseBody = RestClient.create(rpcUrl)
                    .post()
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(payload)
                    .retrieve()
                    .body(String.class);

        } catch (Exception exception) {

            log.error(
                    "NEAR RPC HTTP request failed. method={}, rpcUrl={}",
                    method,
                    rpcUrl,
                    exception
            );

            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "NEAR RPC is temporarily unavailable.",
                    exception
            );
        }

        if (responseBody == null || responseBody.isBlank()) {
            throw unavailable("NEAR RPC returned an empty response.");
        }

        JsonNode response;

        try {
            response = objectMapper.readTree(responseBody);
        } catch (Exception exception) {

            log.error(
                    "Could not parse NEAR RPC JSON response. method={}",
                    method,
                    exception
            );

            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "NEAR RPC returned an unreadable response.",
                    exception
            );
        }

        if (response == null || response.isNull()) {
            throw unavailable("NEAR RPC returned an empty JSON response.");
        }

        if (response.has("error")) {

            JsonNode error = response.path("error");

            log.warn(
                    "NEAR RPC returned an error. method={}, error={}",
                    method,
                    error
            );

            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "NEAR RPC could not complete the verification request."
            );
        }

        JsonNode result = response.path("result");

        if (result.isMissingNode() || result.isNull()) {
            throw unavailable("NEAR RPC returned no result.");
        }

        return result;
    }

    private ResponseStatusException invalid(String message) {
        return new ResponseStatusException(
                HttpStatus.CONFLICT,
                message
        );
    }

    private ResponseStatusException unavailable(String message) {
        return new ResponseStatusException(
                HttpStatus.SERVICE_UNAVAILABLE,
                message
        );
    }
}
