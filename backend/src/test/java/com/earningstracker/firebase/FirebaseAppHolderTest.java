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
    void failsFastWhenRequiredAndKeyFileIsMissing() {
        assertThatIllegalStateException()
                .isThrownBy(() -> new FirebaseAppHolder(new FirebaseProperties(null, "missing/firebase-sa.json", true)))
                .withMessageContaining("does not exist")
                .withMessageContaining("GOOGLE_APPLICATION_CREDENTIALS");
    }
}
