package com.example.payproof.service;

import com.example.payproof.enums.UserRole;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.client.userinfo.DefaultOAuth2UserService;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.user.DefaultOAuth2User;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.stereotype.Service;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.util.List;

@Service
public class GoogleOAuth2UserService extends DefaultOAuth2UserService {

    private final UserService userService;

    public GoogleOAuth2UserService(UserService userService) {
        this.userService = userService;
    }

    @Override
    public OAuth2User loadUser(OAuth2UserRequest request)
            throws OAuth2AuthenticationException {

        OAuth2User googleUser = super.loadUser(request);

        String googleId = googleUser.getAttribute("sub");
        String email = googleUser.getAttribute("email");
        String firstName = googleUser.getAttribute("given_name");
        String lastName = googleUser.getAttribute("family_name");
        String picture = googleUser.getAttribute("picture");
        Boolean emailVerified = googleUser.getAttribute("email_verified");

        if (googleId == null || email == null ||
                !Boolean.TRUE.equals(emailVerified)) {
            throw oauthError("Google must provide a verified email address");
        }

        ServletRequestAttributes attributes =
                (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();

        if (attributes == null) {
            throw oauthError("Unable to access the authentication session");
        }

        HttpServletRequest servletRequest = attributes.getRequest();
        HttpSession session = servletRequest.getSession(false);

        if (session == null) {
            throw oauthError("Your registration session has expired");
        }

        UserRole role = (UserRole) session.getAttribute("OAUTH2_REGISTER_ROLE");

        if (role == null) {
            throw oauthError("Please select an account type before continuing");
        }

        userService.registerGoogleUser(
                googleId,
                email,
                firstName,
                lastName,
                role,
                picture
        );

        return new DefaultOAuth2User(
                List.of(new SimpleGrantedAuthority("ROLE_USER")),
                googleUser.getAttributes(),
                "sub"
        );
    }

    private OAuth2AuthenticationException oauthError(String message) {
        return new OAuth2AuthenticationException(
                new OAuth2Error("google_authentication_error"),
                message
        );
    }
}