package com.example.payproof.components;

import com.example.payproof.enums.PaymentCurrency;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.math.RoundingMode;

@Component
public class TokenAmountConverter {

    private static final int NEAR_DECIMALS = 24;
    private static final int TOKEN_DECIMALS = 6;

    public BigInteger toBaseUnits(
            BigDecimal amount,
            PaymentCurrency currency
    ) {
        if (amount == null || amount.signum() <= 0) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Amount must be greater than zero"
            );
        }

        int decimals = switch (currency) {
            case NEAR -> NEAR_DECIMALS;
            case USDT, USDC -> TOKEN_DECIMALS;
        };

        try {
            return amount
                    .movePointRight(decimals)
                    .setScale(0, RoundingMode.UNNECESSARY)
                    .toBigIntegerExact();
        } catch (ArithmeticException exception) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    currency + " supports a maximum of " + decimals
                            + " decimal places"
            );
        }
    }
}