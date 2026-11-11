package com.example.payproof_admin.service;

import com.example.payproof_admin.components.AdminIDGenerator;
import com.example.payproof_admin.enums.UserStatus;
import com.example.payproof_admin.model.AdminUsers;
import com.example.payproof_admin.model.BanAudit;
import com.example.payproof_admin.model.UserModel;
import com.example.payproof_admin.repository.BanAuditRepository;
import com.example.payproof_admin.repository.UserRepository;
import com.example.payproof_admin.repository.UserStatusWriter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class BanService {

    private final UserRepository userRepository;
    private final UserStatusWriter statusWriter;
    private final BanAuditRepository auditRepository;
    private final AdminIDGenerator idGenerator;

    @Transactional
    public UserModel ban(String accountId, String reason, AdminUsers admin) {
        UserModel user = userRepository.findById(accountId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "No user with accountId " + accountId));

        if (user.getStatus() == UserStatus.SUSPENDED) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT, "User is already suspended");
        }

        int updated = statusWriter.setStatus(accountId, UserStatus.SUSPENDED);
        if (updated != 1) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR, "Failed to update user status");
        }

        auditRepository.save(audit(accountId, "BAN", reason, admin));

        return userRepository.findById(accountId).orElseThrow();
    }

    @Transactional
    public UserModel unban(String accountId, String reason, AdminUsers admin) {
        UserModel user = userRepository.findById(accountId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "No user with accountId " + accountId));

        if (user.getStatus() == UserStatus.ACTIVE) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT, "User is already active");
        }

        int updated = statusWriter.setStatus(accountId, UserStatus.ACTIVE);
        if (updated != 1) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR, "Failed to update user status");
        }

        auditRepository.save(audit(accountId, "UNBAN", reason, admin));

        return userRepository.findById(accountId).orElseThrow();
    }

    @Transactional(readOnly = true)
    public List<UserModel> listSuspended() {
        return userRepository.findByStatus(UserStatus.SUSPENDED);
    }

    @Transactional(readOnly = true)
    public UserModel get(String userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "No user with userId " + userId));
    }

    @Transactional(readOnly = true)
    public List<BanAudit> history(String accountId) {
        return auditRepository.findByAccountIdOrderByPerformedAtDesc(accountId);
    }

    private BanAudit audit(String accountId, String action, String reason, AdminUsers admin) {
        BanAudit a = new BanAudit();
        a.setAuditId(idGenerator.generateBanAuditId());
        a.setAccountId(accountId);
        a.setAction(action);
        a.setReason(reason);
        a.setPerformedByAdminId(admin.getId());
        return a;
    }
}