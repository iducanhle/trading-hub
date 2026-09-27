package com.earningstracker.firebase;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalStateException;

import org.junit.jupiter.api.Test;

class FirebaseAppHolderTest {

    @Test
    void startsWithoutFirebaseWhenNotRequired() {
        FirebaseAppHolder holder = new FirebaseAppHolder(new FirebaseProperties(null, "", false));

        assertThat(holder.app()).isEmpty();
    }

    @Test
    void emulatorModeNeedsNoKeyButIsRefusedInProd() {
        java.util.function.Function<String, String> env = name -> switch (name) {
            case "FIREBASE_AUTH_EMULATOR_HOST" -> "localhost:9099";
            default -> null;
        };
        FirebaseAppHolder holder = new FirebaseAppHolder(new FirebaseProperties("", "", false), env);
        try {
            assertThat(holder.app()).hasValueSatisfying(
                    app -> assertThat(app.getOptions().getProjectId()).isEqualTo(FirebaseAppHolder.EMULATOR_PROJECT));
        } finally {
            holder.destroy();
        }

        assertThatIllegalStateException()
                .isThrownBy(() -> new FirebaseAppHolder(new FirebaseProperties("", "", true), env))
                .withMessageContaining("FIREBASE_AUTH_EMULATOR_HOST");
    }

    @Test
    void failsFastWhenRequiredAndKeyFileIsMissing() {
        assertThatIllegalStateException()
                .isThrownBy(() -> new FirebaseAppHolder(new FirebaseProperties(null, "missing/firebase-sa.json", true)))
                .withMessageContaining("does not exist")
                .withMessageContaining("GOOGLE_APPLICATION_CREDENTIALS");
    }
}
