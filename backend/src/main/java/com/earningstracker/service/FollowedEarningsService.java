package com.earningstracker.service;

import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

import com.earningstracker.cache.TieredCache.Cached;
import com.earningstracker.market.EarningsReport;
import com.earningstracker.market.Logos;
import com.earningstracker.market.Symbols;
import com.earningstracker.service.FollowService.Follow;
import com.earningstracker.web.dto.Dtos;
import org.springframework.stereotype.Service;

/**
 * Upcoming earnings of a user's followed stocks, from stored data only (no provider calls on this path; the daily
 * job keeps followed symbols fresh). Symbols with no stored earnings yet are loaded in the background and listed
 * under {@code noUpcomingDate} until then.
 */
@Service
public class FollowedEarningsService {

    private final FollowService follows;
    private final EarningsService earnings;
    private final ProfileService profiles;
    private final Clock clock;

    public FollowedEarningsService(FollowService follows, EarningsService earnings, ProfileService profiles,
            Clock clock) {
        this.follows = follows;
        this.earnings = earnings;
        this.profiles = profiles;
        this.clock = clock;
    }

    public Dtos.FollowedEarnings followed(String uid) {
        List<Dtos.EarningsEvent> upcoming = new ArrayList<>();
        List<Dtos.SearchResult> noUpcoming = new ArrayList<>();
        for (Follow follow : follows.follows(uid)) {
            String symbol = follow.symbol();
            LocalDate today = LocalDate.now(clock.withZone(Symbols.sessionExchange(symbol).zone()));
            Optional<StockProfile> profile = profiles.stored(symbol);
            String exchange = follow.exchange() != null ? follow.exchange()
                    : profile.map(p -> p.exchange().displayName()).orElse(null);
            String logo = follow.logoUrl() != null ? follow.logoUrl() : profile.map(StockProfile::logoUrl).orElse(null);
            Optional<Cached<List<EarningsReport>>> stored = earnings.stored(symbol);
            Optional<EarningsReport> next = stored
                    .flatMap(s -> s.value().stream()
                            .filter(r -> r.date() != null && !r.date().isBefore(today) && r.epsActual() == null)
                            .min(Comparator.comparing(EarningsReport::date)));
            if (stored.isEmpty()) {
                earnings.warmUp(symbol);
            }
            if (next.isPresent()) {
                upcoming.add(DtoMapper.event(symbol, follow.name(), exchange, logo,
                        profile.map(StockProfile::marketCapUsd).orElse(null), next.get()));
            } else {
                String currency = profile.map(StockProfile::currency)
                        .orElseGet(() -> Symbols.euExchange(symbol).map(e -> e.currency()).orElse("USD"));
                noUpcoming.add(new Dtos.SearchResult(symbol, follow.name(), exchange, follow.region(), currency,
                        Logos.orParqet(symbol, logo)));
            }
        }
        upcoming.sort(Comparator.comparing(Dtos.EarningsEvent::date).thenComparing(Dtos.EarningsEvent::marketCapUsd,
                Comparator.nullsLast(Comparator.reverseOrder())));
        return new Dtos.FollowedEarnings(upcoming, noUpcoming);
    }
}
