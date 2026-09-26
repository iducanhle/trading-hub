package com.earningstracker.config;

import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.enums.SecuritySchemeType;
import io.swagger.v3.oas.annotations.info.Info;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.security.SecurityScheme;
import org.springframework.context.annotation.Configuration;

/** Swagger UI at /swagger-ui.html; paste a Firebase ID token under "Authorize" to call the API from it. */
@Configuration(proxyBeanMethods = false)
@OpenAPIDefinition(info = @Info(title = "Earnings Tracker API", version = "v1"),
        security = @SecurityRequirement(name = "firebase"))
@SecurityScheme(name = "firebase", type = SecuritySchemeType.HTTP, scheme = "bearer", bearerFormat = "JWT",
        description = "Firebase ID token")
class OpenApiConfig {
}
