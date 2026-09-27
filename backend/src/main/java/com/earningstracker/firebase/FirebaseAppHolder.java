package com.earningstracker.firebase;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;
import java.util.function.Function;

import com.google.auth.oauth2.AccessToken;
import com.google.auth.oauth2.GoogleCredentials;
import com.google.auth.oauth2.ServiceAccountCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * Initializes the Firebase Admin SDK from the service-account key. Without a key the app still starts when
 * {@code app.firebase.required=false} (local development), with authentication and Firestore disabled.
 */
@Component
public class FirebaseAppHolder implements DisposableBean {

    private static final Logger log = LoggerFactory.getLogger(FirebaseAppHolder.class);

    /** Project used with the local emulators when none is configured ("demo-" projects never reach Google). */
    static final String EMULATOR_PROJECT = "demo-earnings-tracker";

    private final FirebaseApp app;

    @Autowired
    public FirebaseAppHolder(FirebaseProperties properties) {
        this(properties, System::getenv);
    }

    /** @param env environment lookup; the Admin SDK itself reads {@code FIREBASE_AUTH_EMULATOR_HOST} from there */
    FirebaseAppHolder(FirebaseProperties properties, Function<String, String> env) {
        String authEmulator = env.apply("FIREBASE_AUTH_EMULATOR_HOST");
        this.app = StringUtils.hasText(authEmulator)
                ? initializeEmulator(properties, authEmulator, env.apply("FIRESTORE_EMULATOR_HOST"))
                : initialize(properties);
    }

    /**
     * Local end-to-end testing against the Firebase emulators: tokens are not signature-checked there, so this
     * mode is refused when Firebase is required (prod).
     */
    private static FirebaseApp initializeEmulator(FirebaseProperties properties, String authEmulator,
            String firestoreEmulator) {
        if (properties.required()) {
            throw new IllegalStateException("FIREBASE_AUTH_EMULATOR_HOST is set: refusing to accept unsigned emulator "
                    + "tokens with app.firebase.required=true (prod). Unset it.");
        }
        String projectId = StringUtils.hasText(properties.projectId()) ? properties.projectId() : EMULATOR_PROJECT;
        FirebaseApp firebaseApp = FirebaseApp.initializeApp(FirebaseOptions.builder()
                .setProjectId(projectId)
                .setCredentials(GoogleCredentials.create(new AccessToken("owner", null)))
                .build());
        log.warn("Firebase EMULATOR mode: auth {}, firestore {}, project '{}'. Tokens are not signature-checked; "
                + "local testing only.", authEmulator, firestoreEmulator == null ? "(not set)" : firestoreEmulator,
                projectId);
        return firebaseApp;
    }

    /** The initialized app, or empty when no credentials are configured. */
    public Optional<FirebaseApp> app() {
        return Optional.ofNullable(app);
    }

    @Override
    public void destroy() {
        if (app != null) {
            app.delete();
        }
    }

    private static FirebaseApp initialize(FirebaseProperties properties) {
        if (!StringUtils.hasText(properties.credentialsFile())) {
            return unavailable(properties, "GOOGLE_APPLICATION_CREDENTIALS is not set");
        }
        Path keyFile = Path.of(properties.credentialsFile()).toAbsolutePath();
        if (!Files.isReadable(keyFile)) {
            return unavailable(properties, "the key file " + keyFile + " does not exist or is not readable");
        }

        ServiceAccountCredentials credentials;
        try (InputStream in = Files.newInputStream(keyFile)) {
            credentials = ServiceAccountCredentials.fromStream(in);
        } catch (IOException e) {
            throw new IllegalStateException("Could not read the Firebase service-account key " + keyFile, e);
        }

        String projectId = credentials.getProjectId();
        if (StringUtils.hasText(properties.projectId())) {
            if (projectId != null && !projectId.equals(properties.projectId())) {
                log.warn("FIREBASE_PROJECT_ID '{}' differs from the key's project '{}'; ID tokens are checked "
                        + "against '{}'", properties.projectId(), projectId, properties.projectId());
            }
            projectId = properties.projectId();
        }

        FirebaseOptions.Builder options = FirebaseOptions.builder().setCredentials(credentials);
        if (projectId != null) {
            options.setProjectId(projectId);
        }
        FirebaseApp firebaseApp = FirebaseApp.initializeApp(options.build());
        log.info("Firebase initialized for project '{}'", projectId);
        return firebaseApp;
    }

    private static FirebaseApp unavailable(FirebaseProperties properties, String reason) {
        if (properties.required()) {
            throw new IllegalStateException("Firebase is required but " + reason
                    + ". Mount the service-account JSON key and point GOOGLE_APPLICATION_CREDENTIALS at it.");
        }
        log.warn("Firebase is not configured: {}. Authentication and Firestore are disabled, so every API "
                + "call except /api/health returns 401.", reason);
        return null;
    }
}
