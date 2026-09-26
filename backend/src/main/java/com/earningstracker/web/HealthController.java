package com.earningstracker.web;

import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class HealthController {

    public record HealthResponse(String status) {
    }

    /** Public liveness check. */
    @GetMapping("/health")
    @SecurityRequirements
    public HealthResponse health() {
        return new HealthResponse("UP");
    }
}
