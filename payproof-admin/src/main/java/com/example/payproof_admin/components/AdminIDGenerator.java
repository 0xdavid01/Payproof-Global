package com.example.payproof_admin.components;

import com.example.payproof_admin.repository.BanAuditRepository;
import com.example.payproof_admin.repository.DisputeProposalEventRepository;
import com.example.payproof_admin.repository.DisputeProposalRepository;
import com.example.payproof_admin.repository.TransactionRecordRepository;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.UUID;

@Component
public class AdminIDGenerator {

    private static final DateTimeFormatter DATE =
            DateTimeFormatter.ofPattern("yyyyMMdd");

    private final DisputeProposalRepository proposalRepository;
    private final DisputeProposalEventRepository eventRepository;
    private final TransactionRecordRepository transactionRepository;
    private final BanAuditRepository banAuditRepository;

    public AdminIDGenerator(
            DisputeProposalRepository proposalRepository,
            DisputeProposalEventRepository eventRepository,
            TransactionRecordRepository transactionRepository,
            BanAuditRepository banAuditRepository
    ) {
        this.proposalRepository = proposalRepository;
        this.eventRepository = eventRepository;
        this.transactionRepository = transactionRepository;
        this.banAuditRepository = banAuditRepository;
    }

    public String generateSessionId() {
        return "SES-" + UUID.randomUUID()
                .toString()
                .replace("-", "")
                .toUpperCase();
    }

    public String generateDisputeId() {
        return sequential("DSP", proposalRepository::countByDisputeIdStartingWith);
    }

    public String generateEventId() {
        return sequential("EVT", eventRepository::countByEventIdStartingWith);
    }

    public String generateTransactionId() {
        return sequential("TXN", transactionRepository::countByTransactionIdStartingWith);
    }

    public String generateBanAuditId() {
        return sequential("BAN", banAuditRepository::countByAuditIdStartingWith);
    }

    private String sequential(String prefix, java.util.function.Function<String, Long> countFn) {
        String fullPrefix = prefix + "-" + LocalDate.now().format(DATE);
        Long count = countFn.apply(fullPrefix);
        return fullPrefix + String.format("%03d", (count == null ? 0 : count) + 1);
    }
}