package com.earningstracker.service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.NavigableMap;
import java.util.TreeMap;
import java.util.concurrent.atomic.AtomicInteger;

import com.earningstracker.market.CompanyProfile;
import com.earningstracker.market.EarningsReport;
import com.earningstracker.market.NewsArticle;
import com.earningstracker.market.PriceBar;
import com.earningstracker.market.Quote;
import com.earningstracker.market.RecommendationTrend;
import com.earningstracker.market.Region;
import com.earningstracker.market.SymbolMatch;
import com.earningstracker.provider.EarningsCalendarProvider;
import com.earningstracker.provider.EarningsProvider;
import com.earningstracker.provider.FxRateProvider;
import com.earningstracker.provider.ListingProvider;
import com.earningstracker.provider.NewsProvider;
import com.earningstracker.provider.PeersProvider;
import com.earningstracker.provider.PriceHistoryProvider;
import com.earningstracker.provider.ProfileProvider;
import com.earningstracker.provider.ProviderException;
import com.earningstracker.provider.ProviderException.Kind;
import com.earningstracker.provider.QuoteProvider;
import com.earningstracker.provider.RecommendationProvider;
import com.earningstracker.provider.SymbolSearchProvider;

/** One in-memory provider for every capability; set {@code failing} to simulate an outage. */
public class FakeProvider implements QuoteProvider, ProfileProvider, PriceHistoryProvider, EarningsProvider,
        EarningsCalendarProvider, RecommendationProvider, NewsProvider, PeersProvider, ListingProvider,
        SymbolSearchProvider, FxRateProvider {

    public final Map<String, Quote> quotes = new HashMap<>();
    public final Map<String, CompanyProfile> profiles = new HashMap<>();
    public final Map<String, List<PriceBar>> bars = new HashMap<>();
    public final Map<String, List<EarningsReport>> earnings = new HashMap<>();
    public final Map<String, List<String>> peers = new HashMap<>();
    public final Map<String, SymbolMatch> listings = new HashMap<>();
    public final Map<Region, List<SymbolMatch>> searchResults = new HashMap<>();
    public final List<EarningsReport> calendar = new ArrayList<>();
    public final List<LocalDate> calendarRequests = new ArrayList<>();
    public final List<LocalDate> barRequests = new ArrayList<>();
    public final AtomicInteger calls = new AtomicInteger();
    public volatile boolean failing;

    @Override
    public String id() {
        return "fake";
    }

    private <T> T answer(T value, String symbol) {
        calls.incrementAndGet();
        if (failing) {
            throw new ProviderException("fake", Kind.UNAVAILABLE, "down");
        }
        if (value == null) {
            throw new ProviderException("fake", Kind.NOT_FOUND, "no data for " + symbol);
        }
        return value;
    }

    @Override
    public Quote quote(String symbol) {
        return answer(quotes.get(symbol), symbol);
    }

    @Override
    public CompanyProfile profile(String symbol) {
        return answer(profiles.get(symbol), symbol);
    }

    @Override
    public List<PriceBar> dailyBars(String symbol, LocalDate from) {
        barRequests.add(from);
        return answer(bars.get(symbol), symbol).stream().filter(b -> !b.date().isBefore(from)).toList();
    }

    @Override
    public List<EarningsReport> earnings(String symbol) {
        return answer(earnings.get(symbol), symbol);
    }

    @Override
    public List<EarningsReport> calendar(LocalDate from, LocalDate to) {
        calendarRequests.add(from);
        return answer(calendar, "calendar").stream()
                .filter(r -> !r.date().isBefore(from) && !r.date().isAfter(to))
                .toList();
    }

    @Override
    public List<RecommendationTrend> recommendations(String symbol) {
        return answer(List.of(), symbol);
    }

    @Override
    public List<NewsArticle> news(String symbol, int limit) {
        return answer(List.of(), symbol);
    }

    @Override
    public List<String> peers(String symbol) {
        return answer(peers.getOrDefault(symbol, List.of()), symbol);
    }

    @Override
    public List<SymbolMatch> listings(Collection<String> symbols) {
        return answer(symbols.stream().filter(listings::containsKey).map(listings::get).toList(), "listings");
    }

    @Override
    public List<SymbolMatch> search(String query, Region region, int limit) {
        return answer(searchResults.getOrDefault(region, List.of()), query);
    }

    @Override
    public double usdPerUnit(String currency) {
        return answer(Map.of("EUR", 1.14, "GBP", 1.32).get(currency), currency);
    }

    @Override
    public NavigableMap<LocalDate, Double> dailyUsdPerUnit(String currency, LocalDate from) {
        return new TreeMap<>(Map.of(from, usdPerUnit(currency)));
    }
}
