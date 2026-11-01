package com.example.payproof.service;

import org.bitcoinj.base.Base58;
import org.springframework.stereotype.Component;

import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.PublicKey;
import java.security.Signature;
import java.security.KeyFactory;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;

@Component
public class NearSignatureVerifier {

    private static final String ED25519_PREFIX = "ed25519:";
    private static final long NEP413_TAG = 2147484061L;

    public boolean verify(
            String message,
            String nonce,
            String recipient,
            String publicKey,
            String signature
    ) {
        try {
            byte[] nonceBytes = Base64.getDecoder().decode(nonce);

            if (nonceBytes.length != 32) {
                return false;
            }

            if (publicKey == null || !publicKey.startsWith(ED25519_PREFIX)) {
                return false;
            }

            byte[] publicKeyBytes = Base58.decode(
                    publicKey.substring(ED25519_PREFIX.length())
            );

            byte[] signatureBytes = Base58.decode(signature);

            if (publicKeyBytes.length != 32 || signatureBytes.length != 64) {
                return false;
            }

            byte[] payload = serializeNep413Payload(
                    message,
                    nonceBytes,
                    recipient
            );

            byte[] hash = MessageDigest.getInstance("SHA-256").digest(payload);

            byte[] encodedPublicKey = new byte[12 + publicKeyBytes.length];

            byte[] ed25519Prefix = new byte[]{
                    0x30, 0x2a,
                    0x30, 0x05,
                    0x06, 0x03,
                    0x2b, 0x65, 0x70,
                    0x03, 0x21, 0x00
            };

            System.arraycopy(
                    ed25519Prefix, 0,
                    encodedPublicKey, 0,
                    ed25519Prefix.length
            );

            System.arraycopy(
                    publicKeyBytes, 0,
                    encodedPublicKey, ed25519Prefix.length,
                    publicKeyBytes.length
            );

            PublicKey key = KeyFactory.getInstance("Ed25519")
                    .generatePublic(new X509EncodedKeySpec(encodedPublicKey));

            Signature verifier = Signature.getInstance("Ed25519");
            verifier.initVerify(key);
            verifier.update(hash);

            return verifier.verify(signatureBytes);

        } catch (Exception exception) {
            return false;
        }
    }

    private byte[] serializeNep413Payload(
            String message,
            byte[] nonce,
            String recipient
    ) throws Exception {

        ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
        DataOutputStream data = new DataOutputStream(outputStream);

        writeUInt32LE(data, NEP413_TAG);

        writeBorshString(data, message);

        data.write(nonce);

        writeBorshString(data, recipient);

        data.writeByte(0);

        data.flush();

        return outputStream.toByteArray();
    }

    private void writeBorshString(
            DataOutputStream data,
            String value
    ) throws Exception {

        byte[] bytes = value.getBytes(StandardCharsets.UTF_8);

        writeUInt32LE(data, bytes.length);
        data.write(bytes);
    }

    private void writeUInt32LE(
            DataOutputStream data,
            long value
    ) throws Exception {

        data.write(
                ByteBuffer.allocate(4)
                        .order(ByteOrder.LITTLE_ENDIAN)
                        .putInt((int) value)
                        .array()
        );
    }
}