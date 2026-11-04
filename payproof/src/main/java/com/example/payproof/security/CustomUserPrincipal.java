
package com.example.payproof.security;

import com.example.payproof.enums.UserRole;
import com.example.payproof.enums.UserStatus;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.io.Serial;
import java.io.Serializable;
import java.util.Collection;
import java.util.List;

public class CustomUserPrincipal implements UserDetails, Serializable {

    @Serial
    private static final long serialVersionUID = 1L;

    private final String userId;
    private final String email;
    private final String password;
    private final UserRole role;
    private final UserStatus status;

    public CustomUserPrincipal(
            String userId,
            String email,
            String password,
            UserRole role,
            UserStatus status
    ) {
        this.userId = userId;
        this.email = email;
        this.password = password;
        this.role = role;
        this.status = status;
    }

    public String getUserId() {
        return userId;
    }

    public UserRole getRole() {
        return role;
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return List.of(
                new SimpleGrantedAuthority("ROLE_" + role.name())
        );
    }

    @Override
    public String getPassword() {
        return password;
    }

    @Override
    public String getUsername() {
        return email;
    }

    @Override
    public boolean isAccountNonExpired() {
        return true;
    }

    @Override
    public boolean isAccountNonLocked() {
        return true;
    }

    @Override
    public boolean isCredentialsNonExpired() {
        return true;
    }

    @Override
    public boolean isEnabled() {
        return status == UserStatus.ACTIVE;
    }
}
