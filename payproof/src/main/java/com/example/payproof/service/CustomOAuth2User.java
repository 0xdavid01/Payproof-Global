package com.example.payproof.security;

import com.example.payproof.model.UserModel;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.core.user.OAuth2User;

import java.util.Collection;
import java.util.Map;

public class CustomOAuth2User implements OAuth2User {

    private final UserModel user;
    private final OAuth2User delegate;

    public CustomOAuth2User(UserModel user, OAuth2User delegate) {
        this.user = user;
        this.delegate = delegate;
    }

    public UserModel getUser() {
        return user;
    }

    @Override
    public Map<String, Object> getAttributes() {
        return delegate.getAttributes();
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return delegate.getAuthorities();
    }

    @Override
    public String getName() {
        return user.getUserId();
    }
}