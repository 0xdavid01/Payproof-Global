
package com.example.payproof.service;

import com.example.payproof.model.UserModel;
import com.example.payproof.repository.UserRepository;
import com.example.payproof.security.CustomUserPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

@Service
public class CustomUserDetailsService implements UserDetailsService {

    private final UserRepository userRepository;

    public CustomUserDetailsService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @Override
    public UserDetails loadUserByUsername(String email)
            throws UsernameNotFoundException {

        UserModel user = userRepository.findByEmail(email)
                .orElseThrow(() -> new UsernameNotFoundException(
                        "No account found with email: " + email
                ));

        if (user.getRole() == null) {
            throw new UsernameNotFoundException(
                    "User account has no assigned role"
            );
        }

        return new CustomUserPrincipal(
                user.getUserId(),
                user.getEmail(),
                user.getPasswordHash(),
                user.getRole(),
                user.getStatus()
        );
    }
}
