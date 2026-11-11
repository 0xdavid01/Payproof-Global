package com.example.payproof_admin.security;

import com.example.payproof_admin.enums.AccountStatus;
import com.example.payproof_admin.enums.AccountType;
import com.example.payproof_admin.model.AdminUsers;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.util.Collection;
import java.util.List;

public class AdminPrincipal implements UserDetails {

    private final String id;
    private final String email;
    private final String passwordHash;
    private final AccountType accountType;
    private final AccountStatus accountStatus;

    public AdminPrincipal(AdminUsers user) {
        this.id = user.getId();
        this.email = user.getEmail();
        this.passwordHash = user.getPassword();
        this.accountType = user.getAccountType();
        this.accountStatus = user.getAccountStatus();
    }

    public String getId() { return id; }
    public AccountType getAccountType() { return accountType; }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return List.of(new SimpleGrantedAuthority("ROLE_" + accountType.name()));
    }

    @Override public String getPassword() { return passwordHash; }
    @Override public String getUsername() { return email; }
    @Override public boolean isAccountNonExpired() { return true; }
    @Override public boolean isAccountNonLocked() { return accountStatus == AccountStatus.ACTIVE; }
    @Override public boolean isCredentialsNonExpired() { return true; }
    @Override public boolean isEnabled() { return accountStatus == AccountStatus.ACTIVE; }
}