package com.earningstracker.web.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import com.earningstracker.domain.EarningsResult;
import com.earningstracker.market.EventCategory;
import com.earningstracker.market.Importance;
import com.earningstracker.market.Region;
import com.earningstracker.market.ReportTime;

/** The JSON types of docs/CONTRACT.md, one record per contract type (field names are the contract). */
public final class Dtos {

    private Dtos() {
    }

    public record SearchResult(String symbol, String name, String exchange, Region region, String currency,
            String logoUrl) {
    }

    public record EarningsEvent(String symbol, String name, String exchange, Region region, String logoUrl,
            LocalDate date, ReportTime time, Integer fiscalQuarter, Integer fiscalYear, String currency,
            Double epsEstimate, Double epsActual, Double revenueEstimate, Double revenueActual, Double marketCapUsd) {
    }

    public record Streak(EarningsResult result, int count) {
    }

    public record EarningsStats(int quartersAnalyzed, Double beatRate, Streak streak, Double avgAbsReactionPercent) {
    }

    public record QuoteInfo(double price, double change, double changePercent, double previousClose, Instant asOf) {
    }

    public record KeyStats(Double marketCap, Double marketCapUsd, Double week52High, Double week52Low, Double peRatio,
            Double epsTtm, Long avgVolume) {
    }

    public record Performance(Double w1, Double m1, Double ytd, Double y1) {
    }

    public record StockOverview(String symbol, String name, String exchange, Region region, String currency,
            String logoUrl, String sector, String industry, String website, QuoteInfo quote, KeyStats keyStats,
            Performance performance, EarningsEvent nextEarnings, EarningsStats earningsStats, Instant asOf,
            boolean stale) {
    }

    /** {@code time} is the start of an intraday bar, null for daily and weekly bars. */
    public record PriceBar(LocalDate date, Instant time, double open, double high, double low, double close, long volume) {
    }

    /** {@code result} is BEAT, MISS, INLINE, UPCOMING or null. */
    public record EarningsMarker(LocalDate date, LocalDate reportDate, ReportTime time, String result,
            Double epsSurprisePercent) {
    }

    /** {@code baseClose}: the last close before the range, what the range's change is measured from (null if none). */
    public record Prices(String symbol, String currency, String range, String interval, List<PriceBar> bars,
            Double baseClose, List<EarningsMarker> earningsMarkers, Instant asOf, boolean stale) {
    }

    public record HistoryRow(LocalDate periodStart, LocalDate periodEnd, double close, Double changePercent,
            long volume, boolean hasEarnings, boolean partial) {
    }

    public record History(String period, List<HistoryRow> rows, LocalDate nextBefore) {
    }

    public record EarningsReaction(Double preRunUpPercent, Double gapPercent, Double reactionDayPercent,
            Double driftPercent) {
    }

    public record EstimateActual(Double estimate, Double actual, Double surprisePercent) {
    }

    public record EarningsQuarter(LocalDate date, ReportTime time, boolean timeAssumed, Integer fiscalQuarter,
            Integer fiscalYear, String currency, EstimateActual eps, EstimateActual revenue, EarningsResult result,
            EarningsReaction reaction) {
    }

    public record Earnings(EarningsEvent upcoming, List<EarningsQuarter> quarters, EarningsStats stats, Instant asOf,
            boolean stale) {
    }

    public record RecommendationPeriod(String period, int strongBuy, int buy, int hold, int sell, int strongSell) {
    }

    public record NewsItem(String headline, String source, String url, Instant publishedAt, String imageUrl,
            String summary) {
    }

    public record CalendarDay(LocalDate date, List<EarningsEvent> events) {
    }

    public record Calendar(LocalDate from, LocalDate to, List<CalendarDay> days) {
    }

    /**
     * One market-moving event: a macro release, a central-bank decision, a market-structure date or a mega-cap
     * report. {@code startsAt} is null for all-day events; {@code date} is the day in the publisher's own time zone.
     * Earnings events also carry {@code symbol}, {@code logoUrl} and {@code reportTime}.
     */
    public record MarketEvent(String id, LocalDate date, Instant startsAt, boolean allDay, String title, String label,
            EventCategory category, String country, Importance importance, String note, Double moveRatio,
            String sourceUrl, String symbol, String logoUrl, ReportTime reportTime) {
    }

    public record MarketEventDay(LocalDate date, List<MarketEvent> events) {
    }

    public record MarketEvents(LocalDate from, LocalDate to, List<MarketEventDay> days) {
    }

    public record FollowedEarnings(List<EarningsEvent> upcoming, List<SearchResult> noUpcomingDate) {
    }

    /** {@code usdPerUnit}: USD per one unit of each currency (USD itself is 1). */
    public record FxLatest(String base, Map<String, Double> usdPerUnit) {
    }
}
