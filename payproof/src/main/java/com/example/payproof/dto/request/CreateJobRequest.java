
package com.example.payproof.dto.request;

import com.example.payproof.enums.PaymentCurrency;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Getter
@Setter
public class CreateJobRequest {

    @NotBlank
    private String title;

    @NotBlank
    private String description;

    private String prdUrl;

    @NotNull
    @Positive
    private BigDecimal budget;

    @NotNull
    private PaymentCurrency currency;

    private LocalDateTime deadline;

    @NotBlank
    @Email
    private String participantEmail;
}
