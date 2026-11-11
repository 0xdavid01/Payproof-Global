package com.example.payproof_admin.dto;

import java.time.LocalDateTime;

public record LoginResponse(
        String token,
        LocalDateTime expiresAt,
        MeResponse admin
) {}