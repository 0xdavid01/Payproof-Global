package com.example.payproof_admin.controller;

import com.example.payproof_admin.model.AdminUsers;
import com.example.payproof_admin.model.DisputeProposal;
import com.example.payproof_admin.repository.AdminUsersRepository;
import com.example.payproof_admin.security.AdminPrincipal;
import com.example.payproof_admin.service.DisputeService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/disputes")
@RequiredArgsConstructor
public class DisputeCommandController {

    private final DisputeService disputeService;
    private final AdminUsersRepository adminUsersRepository;

    @PostMapping("/{escrowId}/propose")
    public ResponseEntity<DisputeProposal> propose(
            @PathVariable String escrowId,
            @Valid @RequestBody ProposeBody body,
            @AuthenticationPrincipal AdminPrincipal principal) {

        AdminUsers admin = requireAdmin(principal);
        DisputeProposal proposal = disputeService.propose(
                escrowId, body.freelancerAmountYocto(), body.reason(), admin);
        return ResponseEntity.ok(proposal);
    }

    @PostMapping("/{escrowId}/cancel")
    public ResponseEntity<Map<String, String>> cancel(
            @PathVariable String escrowId,
            @Valid @RequestBody CancelBody body,
            @AuthenticationPrincipal AdminPrincipal principal) {

        AdminUsers admin = requireAdmin(principal);
        disputeService.cancel(escrowId, body.reason(), admin);
        return ResponseEntity.ok(Map.of("status", "cancelled"));
    }

    @PostMapping("/{escrowId}/retry")
    public ResponseEntity<Map<String, String>> retry(
            @PathVariable String escrowId,
            @AuthenticationPrincipal AdminPrincipal principal) {

        AdminUsers admin = requireAdmin(principal);
        disputeService.retry(escrowId, admin);
        return ResponseEntity.ok(Map.of("status", "retry_initiated"));
    }

    private AdminUsers requireAdmin(AdminPrincipal principal) {
        if (principal == null) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.UNAUTHORIZED, "Authentication required");
        }
        return adminUsersRepository.findById(principal.getId())
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.UNAUTHORIZED, "Admin not found"));
    }

    public record ProposeBody(
            @NotBlank String freelancerAmountYocto,
            @NotBlank @Size(max = 500) String reason
    ) {}

    public record CancelBody(
            @NotBlank @Size(max = 500) String reason
    ) {}
}