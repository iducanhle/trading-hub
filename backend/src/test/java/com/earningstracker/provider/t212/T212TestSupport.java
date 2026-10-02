package com.earningstracker.provider.t212;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

import com.earningstracker.t212.T212Properties;

/** Settings, a movable clock and a recording sleeper for Trading 212 tests. No real keys anywhere. */
public final class T212TestSupport {

    /** Obviously fake test values. */
    public static final String API_KEY = "test-key-0000-1111-2222-WXYZ";
    public static final String API_SECRET = "test-secret-do-not-use-9876";
    public static final String MASTER_KEY = java.util.Base64.getEncoder().encodeToString(new byte[32]);

    private T212TestSupport() {
    }

    public static T212Properties properties(String baseUrl) {
        return properties(baseUrl, MASTER_KEY);
    }

    public static T212Properties properties(String baseUrl, String masterKey) {
        return new T212Properties(masterKey, "203.0.113.7", baseUrl, baseUrl, Duration.ofHours(6),
                Duration.ofSeconds(2), Duration.ofSeconds(5), Duration.ofSeconds(60), Duration.ofSeconds(70));
    }

    public static T212Credentials credentials() {
        return new T212Credentials(API_KEY, API_SECRET, T212Environment.DEMO);
    }

    /** A clock tests can move; the sleeper below moves it instead of sleeping. */
    public static final class MutableClock extends Clock {

        private volatile Instant now;

        public MutableClock(Instant now) {
            this.now = now;
        }

        public void advance(Duration duration) {
            now = now.plus(duration);
        }

        @Override
        public Instant instant() {
            return now;
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }
    }

    public static final class RecordingSleeper implements T212Client.Sleeper {

        private final MutableClock clock;
        private final List<Duration> sleeps = new CopyOnWriteArrayList<>();

        public RecordingSleeper(MutableClock clock) {
            this.clock = clock;
        }

        @Override
        public void sleep(Duration duration) {
            sleeps.add(duration);
            clock.advance(duration);
        }

        public List<Duration> sleeps() {
            return sleeps;
        }
    }
}
