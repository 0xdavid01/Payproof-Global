package com.example.payproof_admin.dto;

import com.example.payproof_admin.enums.AccountStatus;
import com.example.payproof_admin.enums.AccountType;

public record MeResponse(
        String id,
        String email,
        String firstName,
        String lastName,
        AccountType accountType,
        AccountStatus accountStatus
) {}