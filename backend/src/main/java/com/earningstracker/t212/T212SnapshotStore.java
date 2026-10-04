package com.earningstracker.t212;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.NavigableMap;
import java.util.TreeMap;
import java.util.concurrent.ConcurrentSkipListMap;

import com.earningstracker.cache.DocumentStore;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.stereotype.Component;

/**
 * The account value every 5 minutes ({@code t212-snapshot} job), one backend-only document per day:
 * {@code t212/{uid}/snapshots/{YYYY-MM-DD}} = {@code {points: [{at, value}]}} (Europe/Prague days, epoch millis).
 * Trading 212 has no balance history, so this starts on the first snapshot. A user's whole history costs one read
 * per day stored; it is then kept in memory until unused for 6 hours.
 */
@Component
public class T212SnapshotStore {

    static final String SNAPSHOTS = "snapshots";
    static final ZoneId ZONE = ZoneId.of("Europe/Prague");

    /** The account value (account currency) at one moment. */
    public record Point(Instant at, double value) {
    }

    private final DocumentStore store;
    private final Cache<String, NavigableMap<LocalDate, List<Point>>> cache = Caffeine.newBuilder()
            .expireAfterAccess(Duration.ofHours(6))
            .build();

    public T212SnapshotStore(DocumentStore store) {
        this.store = store;
    }

    /** Every stored point of the user, oldest first. */
    public List<Point> points(String uid) {
        List<Point> points = new ArrayList<>();
        load(uid).values().forEach(points::addAll);
        return points;
    }

    /** Adds a point to its day's document (rewrites that one document). */
    public void add(String uid, Point point) {
        NavigableMap<LocalDate, List<Point>> days = load(uid);
        LocalDate day = point.at().atZone(ZONE).toLocalDate();
        List<Point> points = new ArrayList<>(days.getOrDefault(day, List.of()));
        points.add(point);
        store.set(path(uid), day.toString(), Map.of("points", points.stream()
                .map(p -> Map.<String, Object>of("at", p.at().toEpochMilli(), "value", p.value())).toList()));
        days.put(day, List.copyOf(points));
    }

    public void forget(String uid) {
        cache.invalidate(uid);
    }

    private NavigableMap<LocalDate, List<Point>> load(String uid) {
        return cache.get(uid, this::read);
    }

    private NavigableMap<LocalDate, List<Point>> read(String uid) {
        NavigableMap<LocalDate, List<Point>> days = new ConcurrentSkipListMap<>();
        new TreeMap<>(store.list(path(uid))).forEach((id, doc) -> {
            List<Point> points = new ArrayList<>();
            if (doc.get("points") instanceof List<?> list) {
                for (Object item : list) {
                    if (item instanceof Map<?, ?> m && m.get("at") instanceof Number at
                            && m.get("value") instanceof Number value) {
                        points.add(new Point(Instant.ofEpochMilli(at.longValue()), value.doubleValue()));
                    }
                }
            }
            days.put(LocalDate.parse(id), List.copyOf(points));
        });
        return days;
    }

    private static String path(String uid) {
        return T212StateStore.COLLECTION + "/" + uid + "/" + SNAPSHOTS;
    }
}
