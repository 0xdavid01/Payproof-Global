package com.example.payproof.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.HexFormat;
import java.util.UUID;

@Service
public class R2StorageService {

    private static final long MAX_FILE_SIZE = 20L * 1024 * 1024;
    private static final String REGION = "auto";
    private static final String SERVICE = "s3";
    private static final String ALGORITHM = "AWS4-HMAC-SHA256";

    private static final DateTimeFormatter AMZ_DATE =
            DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'")
                    .withZone(ZoneOffset.UTC);

    private static final DateTimeFormatter DATE =
            DateTimeFormatter.ofPattern("yyyyMMdd")
                    .withZone(ZoneOffset.UTC);

    private final HttpClient httpClient;

    @Value("${cloudflare.r2.account-id}")
    private String accountId;

    @Value("${cloudflare.r2.access-key}")
    private String accessKey;

    @Value("${cloudflare.r2.secret-key}")
    private String secretKey;

    @Value("${cloudflare.r2.bucket}")
    private String bucket;

    public R2StorageService() {
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(20))
                .build();
    }

    private String endpoint() {
        return "https://" + accountId + ".r2.cloudflarestorage.com";
    }

    public String uploadPdf(MultipartFile file, String directory) {
        validatePdf(file);

        try {
            String fileName = UUID.randomUUID() + ".pdf";
            String storageId = directory + "/" + fileName;

            byte[] content = file.getBytes();

            HttpRequest request = signedRequest(
                    "PUT",
                    objectPath(storageId),
                    content,
                    "application/pdf",
                    null
            );

            HttpResponse<String> response = httpClient.send(
                    request,
                    HttpResponse.BodyHandlers.ofString()
            );

            ensureSuccess(response.statusCode(), response.body());

            return storageId;

        } catch (IOException exception) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "Could not read the uploaded PDF",
                    exception
            );
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "Upload was interrupted",
                    exception
            );
        } catch (ResponseStatusException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "Could not upload the PDF to Cloudflare R2",
                    exception
            );
        }
    }

    public String getFileUrl(String storageId) {
        return endpoint() + objectPath(storageId);
    }

    public String generateDownloadUrl(String storageId) {
        if (storageId == null || storageId.isBlank()) {
            throw new IllegalArgumentException("Storage ID is required");
        }

        try {
            Instant now = Instant.now();
            String date = DATE.format(now);
            String timestamp = AMZ_DATE.format(now);

            String canonicalUri = objectPath(storageId);
            String credentialScope =
                    date + "/" + REGION + "/" + SERVICE + "/aws4_request";

            String query = "X-Amz-Algorithm=" + ALGORITHM
                    + "&X-Amz-Credential="
                    + encode(accessKey + "/" + credentialScope)
                    + "&X-Amz-Date=" + timestamp
                    + "&X-Amz-Expires=900"
                    + "&X-Amz-SignedHeaders=host";

            String canonicalHeaders =
                    "host:" + accountId + ".r2.cloudflarestorage.com\n";

            String canonicalRequest =
                    "GET\n"
                            + canonicalUri + "\n"
                            + query + "\n"
                            + canonicalHeaders
                            + "\n"
                            + "host\n"
                            + "UNSIGNED-PAYLOAD";

            String stringToSign =
                    ALGORITHM + "\n"
                            + timestamp + "\n"
                            + credentialScope + "\n"
                            + sha256(canonicalRequest);

            byte[] signingKey = signingKey(secretKey, date);

            String signature = HexFormat.of().formatHex(
                    hmac(signingKey, stringToSign)
            );

            return endpoint()
                    + canonicalUri
                    + "?" + query
                    + "&X-Amz-Signature=" + signature;

        } catch (Exception exception) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "Could not generate download URL",
                    exception
            );
        }
    }

    public byte[] downloadFile(String storageId) {
        if (storageId == null || storageId.isBlank()) {
            throw new IllegalArgumentException("Storage ID is required");
        }

        try {
            HttpRequest request = signedRequest(
                    "GET",
                    objectPath(storageId),
                    new byte[0],
                    null,
                    null
            );

            HttpResponse<byte[]> response = httpClient.send(
                    request,
                    HttpResponse.BodyHandlers.ofByteArray()
            );

            ensureSuccess(
                    response.statusCode(),
                    new String(response.body(), StandardCharsets.UTF_8)
            );

            return response.body();

        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "Download was interrupted",
                    exception
            );
        } catch (ResponseStatusException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "Could not download the PDF",
                    exception
            );
        }
    }

    public void deleteFile(String storageId) {
        if (storageId == null || storageId.isBlank()) {
            return;
        }

        try {
            HttpRequest request = signedRequest(
                    "DELETE",
                    objectPath(storageId),
                    new byte[0],
                    null,
                    null
            );

            HttpResponse<String> response = httpClient.send(
                    request,
                    HttpResponse.BodyHandlers.ofString()
            );

            ensureSuccess(response.statusCode(), response.body());

        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "Delete was interrupted",
                    exception
            );
        } catch (ResponseStatusException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "Could not delete the PDF",
                    exception
            );
        }
    }

    private HttpRequest signedRequest(
            String method,
            String path,
            byte[] payload,
            String contentType,
            String ignored
    ) throws Exception {

        Instant now = Instant.now();
        String date = DATE.format(now);
        String timestamp = AMZ_DATE.format(now);

        String host = accountId + ".r2.cloudflarestorage.com";
        String payloadHash = sha256(payload);

        String canonicalHeaders;
        String signedHeaders;

        if (contentType != null) {
            canonicalHeaders =
                    "content-type:" + contentType + "\n"
                            + "host:" + host + "\n"
                            + "x-amz-content-sha256:" + payloadHash + "\n"
                            + "x-amz-date:" + timestamp + "\n";

            signedHeaders =
                    "content-type;host;x-amz-content-sha256;x-amz-date";
        } else {
            canonicalHeaders =
                    "host:" + host + "\n"
                            + "x-amz-content-sha256:" + payloadHash + "\n"
                            + "x-amz-date:" + timestamp + "\n";

            signedHeaders =
                    "host;x-amz-content-sha256;x-amz-date";
        }

        String canonicalRequest =
                method + "\n"
                        + path + "\n"
                        + "\n"
                        + canonicalHeaders
                        + "\n"
                        + signedHeaders + "\n"
                        + payloadHash;

        String scope =
                date + "/" + REGION + "/" + SERVICE + "/aws4_request";

        String stringToSign =
                ALGORITHM + "\n"
                        + timestamp + "\n"
                        + scope + "\n"
                        + sha256(canonicalRequest);

        String signature = HexFormat.of().formatHex(
                hmac(signingKey(secretKey, date), stringToSign)
        );

        String authorization =
                ALGORITHM
                        + " Credential=" + accessKey + "/" + scope
                        + ", SignedHeaders=" + signedHeaders
                        + ", Signature=" + signature;

        HttpRequest.Builder builder = HttpRequest.newBuilder()
                .uri(URI.create(endpoint() + path))
                .timeout(Duration.ofSeconds(60))
                .header("x-amz-date", timestamp)
                .header("x-amz-content-sha256", payloadHash)
                .header("Authorization", authorization);

        if (contentType != null) {
            builder.header("Content-Type", contentType);
        }

        switch (method) {
            case "PUT" -> builder.PUT(
                    HttpRequest.BodyPublishers.ofByteArray(payload)
            );
            case "GET" -> builder.GET();
            case "DELETE" -> builder.DELETE();
            default -> throw new IllegalArgumentException(
                    "Unsupported HTTP method"
            );
        }

        return builder.build();
    }

    private String objectPath(String storageId) {
        StringBuilder path = new StringBuilder("/")
                .append(encodePath(bucket));

        for (String part : storageId.split("/")) {
            path.append("/").append(encodePath(part));
        }

        return path.toString();
    }

    private String encodePath(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8)
                .replace("+", "%20")
                .replace("%7E", "~");
    }

    private String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8)
                .replace("+", "%20")
                .replace("%7E", "~");
    }

    private String sha256(byte[] value) throws Exception {
        return HexFormat.of().formatHex(
                MessageDigest.getInstance("SHA-256").digest(value)
        );
    }

    private String sha256(String value) throws Exception {
        return sha256(value.getBytes(StandardCharsets.UTF_8));
    }

    private byte[] hmac(byte[] key, String value) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(key, "HmacSHA256"));
        return mac.doFinal(value.getBytes(StandardCharsets.UTF_8));
    }

    private byte[] signingKey(String secret, String date)
            throws Exception {

        byte[] dateKey = hmac(
                ("AWS4" + secret).getBytes(StandardCharsets.UTF_8),
                date
        );

        byte[] regionKey = hmac(dateKey, REGION);
        byte[] serviceKey = hmac(regionKey, SERVICE);

        return hmac(serviceKey, "aws4_request");
    }

    private void ensureSuccess(int statusCode, String body) {
        if (statusCode < 200 || statusCode >= 300) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "Cloudflare R2 returned HTTP " + statusCode + ": " + body
            );
        }
    }

    private void validatePdf(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Please upload a PDF file"
            );
        }

        if (file.getSize() > MAX_FILE_SIZE) {
            throw new ResponseStatusException(
                    HttpStatus.PAYLOAD_TOO_LARGE,
                    "PDF cannot exceed 20MB"
            );
        }

        String contentType = file.getContentType();

        if (contentType != null
                && !contentType.isBlank()
                && !"application/pdf".equalsIgnoreCase(contentType)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Only PDF files are allowed"
            );
        }

        try (var inputStream = file.getInputStream()) {
            byte[] header = inputStream.readNBytes(5);

            if (header.length != 5
                    || header[0] != '%'
                    || header[1] != 'P'
                    || header[2] != 'D'
                    || header[3] != 'F'
                    || header[4] != '-') {

                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "The uploaded file is not a valid PDF"
                );
            }

        } catch (IOException exception) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Could not validate the uploaded PDF",
                    exception
            );
        }
    }

    public String uploadSubmissionFile(
            MultipartFile file,
            String directory
    ) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Please upload a submission file"
            );
        }

        if (file.getSize() > MAX_FILE_SIZE) {
            throw new ResponseStatusException(
                    HttpStatus.PAYLOAD_TOO_LARGE,
                    "Submission files cannot exceed 20MB"
            );
        }

        String originalFilename = file.getOriginalFilename();

        if (originalFilename == null || originalFilename.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "The uploaded file must have a filename"
            );
        }

        String extension = originalFilename.contains(".")
                ? originalFilename.substring(
                originalFilename.lastIndexOf(".")
        ).toLowerCase()
                : "";

        if (!extension.matches("\\.(zip|pdf|doc|docx|png|jpg|jpeg|webp|txt|xlsx|csv)$")) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Unsupported submission file type"
            );
        }

        String contentType = file.getContentType();

        if (contentType == null || contentType.isBlank()) {
            contentType = "application/octet-stream";
        }

        try {
            String storageId = directory + "/"
                    + UUID.randomUUID()
                    + extension;

            HttpRequest request = signedRequest(
                    "PUT",
                    objectPath(storageId),
                    file.getBytes(),
                    contentType,
                    null
            );

            HttpResponse<String> response = httpClient.send(
                    request,
                    HttpResponse.BodyHandlers.ofString()
            );

            ensureSuccess(response.statusCode(), response.body());

            return storageId;

        } catch (IOException exception) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "Could not read the submission file",
                    exception
            );
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();

            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "Submission upload was interrupted",
                    exception
            );
        } catch (ResponseStatusException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "Could not upload the submission file",
                    exception
            );
        }
    }
}