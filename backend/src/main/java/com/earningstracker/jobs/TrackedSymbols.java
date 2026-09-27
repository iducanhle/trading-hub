package com.earningstracker.jobs;

import java.util.LinkedHashSet;
import java.util.Set;

import com.earningstracker.cache.DocumentStore;
import com.earningstracker.service.FollowService;
import com.earningstracker.service.ViewTracker;
import org.springframework.stereotype.Component;

/** Symbols the jobs keep fresh beyond the calendars: followed by any user, or viewed recently. */
@Component
public class TrackedSymbols {

    private final DocumentStore store;
    private final FollowService follows;
    private final ViewTracker views;
    private final JobProperties properties;

    public TrackedSymbols(DocumentStore store, FollowService follows, ViewTracker views, JobProperties properties) {
        this.store = store;
        this.follows = follows;
        this.views = views;
        this.properties = properties;
    }

    public Set<String> followed() {
        Set<String> symbols = new LinkedHashSet<>();
        for (String uid : store.list("users").keySet()) {
            follows.follows(uid).forEach(follow -> symbols.add(follow.symbol()));
        }
        return symbols;
    }

    public Set<String> recentlyViewed() {
        return new LinkedHashSet<>(views.recentlyViewed(properties.viewedWindow()));
    }

    public Set<String> all() {
        Set<String> symbols = followed();
        symbols.addAll(recentlyViewed());
        return symbols;
    }
}
