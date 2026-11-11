package com.example.payproof_admin;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@EnableScheduling
@SpringBootApplication
public class PayproofAdminApplication {

	public static void main(String[] args) {
		SpringApplication.run(PayproofAdminApplication.class, args);
	}

}
