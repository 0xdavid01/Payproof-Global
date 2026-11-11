package com.example.payproof_admin.controller;

import com.example.payproof_admin.dto.DisputeDossierView;
import com.example.payproof_admin.service.DossierService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/disputes")
@RequiredArgsConstructor
public class DossierController {

    private final DossierService dossierService;

    @GetMapping("/{escrowId}/dossier")
    public DisputeDossierView dossier(@PathVariable String escrowId) {
        return dossierService.getDossier(escrowId);
    }
}