package com.example.payproof_admin.service;

import com.example.payproof_admin.model.AdminUsers;
import com.example.payproof_admin.repository.AdminUsersRepository;
import com.example.payproof_admin.security.AdminPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

@Service
public class AdminUserDetailsService implements UserDetailsService {

    private final AdminUsersRepository repository;

    public AdminUserDetailsService(AdminUsersRepository repository) {
        this.repository = repository;
    }

    @Override
    public UserDetails loadUserByUsername(String email) throws UsernameNotFoundException {
        AdminUsers user = repository.findByEmail(email)
                .orElseThrow(() -> new UsernameNotFoundException("No admin with email: " + email));
        return new AdminPrincipal(user);
    }
}