package com.example.payproof_admin.security;

import com.example.payproof_admin.model.AdminSession;
import com.example.payproof_admin.model.AdminUsers;
import com.example.payproof_admin.repository.AdminUsersRepository;
import com.example.payproof_admin.service.SessionService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

@Component
public class SessionAuthFilter extends OncePerRequestFilter {

    private static final String COOKIE_NAME = "SESSION";

    private final SessionService sessionService;
    private final AdminUsersRepository adminUsersRepository;

    public SessionAuthFilter(SessionService sessionService, AdminUsersRepository adminUsersRepository) {
        this.sessionService = sessionService;
        this.adminUsersRepository = adminUsersRepository;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {

        String token = extractToken(request);

        if (token != null && SecurityContextHolder.getContext().getAuthentication() == null) {
            AdminSession session = sessionService.findActiveByToken(token);

            if (session != null) {
                AdminUsers admin = adminUsersRepository.findById(session.getAdminUserId()).orElse(null);
                if (admin != null) {
                    AdminPrincipal principal = new AdminPrincipal(admin);
                    UsernamePasswordAuthenticationToken auth =
                            new UsernamePasswordAuthenticationToken(
                                    principal, null, principal.getAuthorities());
                    auth.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                    SecurityContextHolder.getContext().setAuthentication(auth);
                }
            }
        }

        chain.doFilter(request, response);
    }

    private String extractToken(HttpServletRequest request) {
        // Prefer cookie
        if (request.getCookies() != null) {
            for (var c : request.getCookies()) {
                if (COOKIE_NAME.equals(c.getName())) {
                    return c.getValue();
                }
            }
        }
        // Fallback: Authorization header (curl/Postman)
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            return header.substring(7);
        }
        return null;
    }
}