package com.example.payproof;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;

@SpringBootApplication
@EnableAsync
public class PayproofApplication {

	public static void main(String[] args) {
		SpringApplication.run(PayproofApplication.class, args);
	}

}
