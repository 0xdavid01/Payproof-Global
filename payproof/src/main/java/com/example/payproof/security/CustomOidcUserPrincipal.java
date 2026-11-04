package com.example.payproof.security;

import com.example.payproof.model.UserModel;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.core.oidc.OidcUserInfo;
import org.springframework.security.oauth2.core.oidc.OidcIdToken;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;

import java.util.Collection;
import java.util.Map;

public class CustomOidcUserPrincipal
        extends CustomUserPrincipal
        implements OidcUser {

    private final OidcUser oidcUser;

    public CustomOidcUserPrincipal(
            UserModel user,
            OidcUser oidcUser
    ) {
        super(
                user.getUserId(),
                user.getEmail(),
                user.getPasswordHash(),
                user.getRole(),
                user.getStatus()
        );

        this.oidcUser = oidcUser;
    }

    @Override
    public Map<String, Object> getClaims() {
        return oidcUser.getClaims();
    }

    @Override
    public OidcUserInfo getUserInfo() {
        return oidcUser.getUserInfo();
    }

    @Override
    public OidcIdToken getIdToken() {
        return oidcUser.getIdToken();
    }

    @Override
    public Map<String, Object> getAttributes() {
        return oidcUser.getAttributes();
    }

    @Override
    public String getName() {
        return getUserId();
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return super.getAuthorities();
    }
}