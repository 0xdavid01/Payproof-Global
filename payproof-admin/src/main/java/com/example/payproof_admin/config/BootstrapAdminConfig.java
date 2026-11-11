package com.example.payproof_admin.config;

import com.example.payproof_admin.enums.AccountStatus;
import com.example.payproof_admin.enums.AccountType;
import com.example.payproof_admin.model.AdminUsers;
import com.example.payproof_admin.repository.AdminUsersRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.UUID;

@Configuration
public class BootstrapAdminConfig {

    @Value("${payproof.bootstrap.admin-id:}")         private String adminId;
    @Value("${payproof.bootstrap.admin-email:}")      private String adminEmail;
    @Value("${payproof.bootstrap.admin-password:}")   private String adminPassword;
    @Value("${payproof.bootstrap.admin-first-name:Admin}") private String firstName;
    @Value("${payproof.bootstrap.admin-last-name:User}")   private String lastName;

    @Bean
    public CommandLineRunner bootstrapAdmin(AdminUsersRepository repo, PasswordEncoder encoder) {
        return args -> {
            if (adminEmail == null || adminEmail.isBlank()
                    || adminPassword == null || adminPassword.isBlank()) {
                return;
            }
            if (repo.existsByEmail(adminEmail)) {
                return;
            }
            AdminUsers admin = new AdminUsers();
            admin.setId(adminId != null && !adminId.isBlank()
                    ? adminId : UUID.randomUUID().toString());
            admin.setEmail(adminEmail);
            admin.setPassword(encoder.encode(adminPassword));
            admin.setFirstName(firstName);
            admin.setLastName(lastName);
            admin.setAccountType(AccountType.SUPERADMIN);   // adjust to your enum
            admin.setAccountStatus(AccountStatus.ACTIVE);
            repo.save(admin);
        };
    }
}