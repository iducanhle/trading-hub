package com.earningstracker.notification;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import com.earningstracker.cache.DocumentStore;
import org.springframework.stereotype.Component;

/** {@code users/{uid}} as the frontend writes it (contract: "Firestore — user-owned documents"). */
@Component
public class UserDirectory {

    /** Contract defaults: notifications on, 1 day before, auth email. */
    public record Settings(boolean notificationsEnabled, int notifyDaysBefore, String notificationEmail) {

        public static final Settings DEFAULTS = new Settings(true, 1, null);
    }

    public record User(String uid, String email, Settings settings) {
    }

    private final DocumentStore store;

    public UserDirectory(DocumentStore store) {
        this.store = store;
    }

    public List<User> users() {
        return store.list("users").entrySet().stream().map(e -> user(e.getKey(), e.getValue())).toList();
    }

    public Optional<User> user(String uid) {
        return store.get("users", uid).map(doc -> user(uid, doc));
    }

    private static User user(String uid, Map<String, Object> doc) {
        Settings settings = Settings.DEFAULTS;
        if (doc.get("settings") instanceof Map<?, ?> s) {
            boolean enabled = !(s.get("notificationsEnabled") instanceof Boolean b) || b;
            int days = s.get("notifyDaysBefore") instanceof Number n ? Math.clamp(n.intValue(), 1, 7) : 1;
            String email = s.get("notificationEmail") instanceof String e && e.contains("@") ? e.strip() : null;
            settings = new Settings(enabled, days, email);
        }
        return new User(uid, doc.get("email") instanceof String e ? e : null, settings);
    }
}
