package com.earningstracker.firebase;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * @param projectId       {@code FIREBASE_PROJECT_ID}; optional, the service-account key names the project too
 * @param credentialsFile {@code GOOGLE_APPLICATION_CREDENTIALS}: path to the service-account JSON key
 * @param required        fail startup when the key is missing (prod) instead of running without Firebase
 */
@ConfigurationProperties("app.firebase")
public record FirebaseProperties(String projectId, String credentialsFile, boolean required) {
}
