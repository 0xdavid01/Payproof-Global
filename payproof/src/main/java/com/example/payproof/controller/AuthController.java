
package com.example.payproof.controller;

import com.example.payproof.dto.request.UserRegistrationRequest;
import com.example.payproof.dto.response.UserResponse;
import com.example.payproof.security.CustomUserPrincipal;
import com.example.payproof.service.LoginOtpService;
import com.example.payproof.service.UserService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final UserService userService;
        private final LoginOtpService loginOtpService;
    private final AuthenticationManager authenticationManager;
        private final UserDetailsService userDetailsService;
    private final SecurityContextRepository securityContextRepository;

    public AuthController(
            UserService userService,
            LoginOtpService loginOtpService,
            AuthenticationManager authenticationManager,
            UserDetailsService userDetailsService,
            SecurityContextRepository securityContextRepository) {
        this.userService = userService;
        this.loginOtpService = loginOtpService;
        this.authenticationManager = authenticationManager;
        this.userDetailsService = userDetailsService;
        this.securityContextRepository = securityContextRepository;
    }

    @PostMapping("/register")
    public ResponseEntity<UserResponse> register(
            @Valid @RequestBody UserRegistrationRequest request) {

        UserResponse response = userService.registerUser(request);

        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @GetMapping("/me")
    public UserResponse currentUser(
            @AuthenticationPrincipal CustomUserPrincipal principal
    ) {
        if (principal == null) {
            throw new org.springframework.security.authentication.AuthenticationCredentialsNotFoundException(
                    "Authentication is required"
            );
        }
        return userService.getUserResponse(principal.getUserId());
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(
            @RequestBody LoginRequest request,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse) {

        Authentication authentication = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(
                        request.email(),
                        request.password()
                )
        );

        loginOtpService.issueCode(authentication.getName(), httpRequest.getSession(true));

        return ResponseEntity.ok(Map.of(
                "requiresOtp", true,
                "email", authentication.getName()
        ));
    }

    @PostMapping("/verify-otp")
    public ResponseEntity<?> verifyOtp(
            @Valid @RequestBody OtpRequest request,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse) {

        loginOtpService.verifyCode(
                request.email(),
                request.code(),
                httpRequest.getSession(false)
        );

        UserDetails userDetails = userDetailsService.loadUserByUsername(request.email());
        if (!userDetails.isEnabled()) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "This account is not available."
            );
        }
        Authentication authentication = UsernamePasswordAuthenticationToken.authenticated(
                userDetails,
                null,
                userDetails.getAuthorities()
        );

        httpRequest.changeSessionId();
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        securityContextRepository.saveContext(context, httpRequest, httpResponse);

        return ResponseEntity.ok(Map.of(
                "message", "Login successful",
                "email", authentication.getName()
        ));
    }

    @PostMapping("/resend-otp")
    public ResponseEntity<?> resendOtp(
            @Valid @RequestBody ResendOtpRequest request,
            HttpServletRequest httpRequest) {

        loginOtpService.resendCode(request.email(), httpRequest.getSession(false));
        return ResponseEntity.ok(Map.of(
                "message", "If sign-in is pending, a new code has been sent."
        ));
    }

    @PostMapping("/logout")
    public ResponseEntity<?> logout(
            HttpServletRequest request,
            HttpServletResponse response) throws Exception {

        SecurityContextHolder.clearContext();
        securityContextRepository.saveContext(
                SecurityContextHolder.createEmptyContext(),
                request,
                response
        );

        request.getSession(false);
        if (request.getSession(false) != null) {
            request.getSession(false).invalidate();
        }

        return ResponseEntity.ok(Map.of(
                "message", "Logout successful"
        ));
    }

    public record LoginRequest(
            String email,
            String password
    ) {}

    public record OtpRequest(
            @NotBlank @Email String email,
            @NotBlank @Pattern(regexp = "[0-9]{6}") String code
    ) {}

    public record ResendOtpRequest(
            @NotBlank @Email String email
    ) {}
}
