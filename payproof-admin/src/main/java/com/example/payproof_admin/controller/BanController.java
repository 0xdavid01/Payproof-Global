package com.example.payproof_admin.controller;

import com.example.payproof_admin.model.AdminUsers;
import com.example.payproof_admin.model.BanAudit;
import com.example.payproof_admin.model.UserModel;
import com.example.payproof_admin.repository.AdminUsersRepository;
import com.example.payproof_admin.security.AdminPrincipal;
import com.example.payproof_admin.service.BanService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@RestController
@RequestMapping("/api/bans")
@RequiredArgsConstructor
public class BanController {

    private final BanService banService;
    private final AdminUsersRepository adminUsersRepository;

    @PostMapping
    public UserModel ban(@Valid @RequestBody BanBody body,
                         @AuthenticationPrincipal AdminPrincipal principal) {
        AdminUsers admin = requireAdmin(principal);
        return banService.ban(body.accountId(), body.reason(), admin);
    }

    @DeleteMapping("/{accountId}")
    public UserModel unban(@PathVariable String accountId,
                           @Valid @RequestBody UnbanBody body,
                           @AuthenticationPrincipal AdminPrincipal principal) {
        AdminUsers admin = requireAdmin(principal);
        return banService.unban(accountId, body.reason(), admin);
    }

    @GetMapping
    public List<UserModel> list() {
        return banService.listSuspended();
    }

    @GetMapping("/{userId}")
    public UserModel get(@PathVariable String userId) {
        return banService.get(userId);
    }

    @GetMapping("/{userId}/history")
    public List<BanAudit> history(@PathVariable String userId) {
        return banService.history(userId);
    }

    private AdminUsers requireAdmin(AdminPrincipal principal) {
        if (principal == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authentication required");
        }
        return adminUsersRepository.findById(principal.getId())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.UNAUTHORIZED, "Admin not found"));
    }

    public record BanBody(
            @NotBlank @Size(max = 128) String accountId,
            @NotBlank @Size(max = 1000) String reason
    ) {}

    public record UnbanBody(
            @NotBlank @Size(max = 1000) String reason
    ) {}
}