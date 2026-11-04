package com.example.payproof.dto.request;

import com.example.payproof.enums.PaymentCurrency;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;

@Getter
@Setter
public class UpdateJobFinancialTermsRequest {

    @NotNull
    @Positive
    private BigDecimal budget;

    @NotNull
    private PaymentCurrency currency;
}