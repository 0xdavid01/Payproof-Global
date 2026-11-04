package com.example.payproof.service;

import com.example.payproof.enums.UserRole;
import com.example.payproof.enums.UserStatus;
import com.example.payproof.model.UserModel;
import com.example.payproof.security.CustomOidcUserPrincipal;
import jakarta.servlet.http.HttpSession;
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserRequest;
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserService;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.stereotype.Service;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

@Service
public class GoogleOAuth2UserService extends OidcUserService {

    private final UserService userService;

    public GoogleOAuth2UserService(UserService userService) {
        this.userService = userService;
    }

    @Override
    public OidcUser loadUser(OidcUserRequest request)
            throws OAuth2AuthenticationException {

        OidcUser googleUser = super.loadUser(request);

        String googleId = googleUser.getSubject();
        String email = googleUser.getClaimAsString("email");
        String firstName = googleUser.getClaimAsString("given_name");
        String lastName = googleUser.getClaimAsString("family_name");
        String picture = googleUser.getClaimAsString("picture");
        Boolean emailVerified = googleUser.getClaim("email_verified");

        if (googleId == null
                || email == null
                || !Boolean.TRUE.equals(emailVerified)) {
            throw oauthError(
                    "Google must provide a verified email address"
            );
        }

        ServletRequestAttributes attributes =
                (ServletRequestAttributes)
                        RequestContextHolder.getRequestAttributes();

        if (attributes == null) {
            throw oauthError(
                    "Unable to access the authentication session"
            );
        }

        HttpSession session =
                attributes.getRequest().getSession(false);

        if (session == null) {
            throw oauthError(
                    "Your registration session has expired. Please try again."
            );
        }

        UserRole selectedRole =
                (UserRole) session.getAttribute("OAUTH2_REGISTER_ROLE");

        if (selectedRole != UserRole.CLIENT
                && selectedRole != UserRole.FREELANCER) {
            throw oauthError("Please select a valid account type");
        }

        UserModel user = userService.registerGoogleUser(
                googleId,
                email,
                firstName,
                lastName,
                selectedRole,
                picture
        );

        if (user.getRole() == null) {
            throw oauthError("Your account has no assigned role");
        }

        if (user.getStatus() != UserStatus.ACTIVE) {
            throw oauthError("Your account is not active");
        }

        session.removeAttribute("OAUTH2_REGISTER_ROLE");

        return new CustomOidcUserPrincipal(user, googleUser);
    }

    private OAuth2AuthenticationException oauthError(String message) {
        return new OAuth2AuthenticationException(
                new OAuth2Error("google_authentication_error"),
                message
        );
    }
}