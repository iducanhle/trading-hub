package com.earningstracker.market;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Arrays;
import java.util.Optional;

/**
 * Supported exchanges: US listings have no symbol suffix, European ones use Yahoo's suffix ({@code SAP.DE}).
 * Session hours are the regular continuous-trading hours, used to classify report times.
 */
public enum Exchange {
    NYSE("NYSE", Region.US, null, "USD", "America/New_York", "09:30", "16:00"),
    NASDAQ("NASDAQ", Region.US, null, "USD", "America/New_York", "09:30", "16:00"),
    NYSE_AMERICAN("NYSE American", Region.US, null, "USD", "America/New_York", "09:30", "16:00"),
    XETRA("XETRA", Region.EU, "DE", "EUR", "Europe/Berlin", "09:00", "17:30"),
    EURONEXT_PARIS("Euronext Paris", Region.EU, "PA", "EUR", "Europe/Paris", "09:00", "17:30"),
    EURONEXT_AMSTERDAM("Euronext Amsterdam", Region.EU, "AS", "EUR", "Europe/Amsterdam", "09:00", "17:30"),
    EURONEXT_BRUSSELS("Euronext Brussels", Region.EU, "BR", "EUR", "Europe/Brussels", "09:00", "17:30"),
    BORSA_ITALIANA("Borsa Italiana", Region.EU, "MI", "EUR", "Europe/Rome", "09:00", "17:30"),
    BME_MADRID("BME Madrid", Region.EU, "MC", "EUR", "Europe/Madrid", "09:00", "17:30"),
    LSE("London Stock Exchange", Region.EU, "L", "GBP", "Europe/London", "08:00", "16:30"),
    SIX("SIX Swiss Exchange", Region.EU, "SW", "CHF", "Europe/Zurich", "09:00", "17:30"),
    NASDAQ_STOCKHOLM("Nasdaq Stockholm", Region.EU, "ST", "SEK", "Europe/Stockholm", "09:00", "17:30"),
    NASDAQ_COPENHAGEN("Nasdaq Copenhagen", Region.EU, "CO", "DKK", "Europe/Copenhagen", "09:00", "17:00"),
    NASDAQ_HELSINKI("Nasdaq Helsinki", Region.EU, "HE", "EUR", "Europe/Helsinki", "10:00", "18:30"),
    OSLO_BORS("Oslo Børs", Region.EU, "OL", "NOK", "Europe/Oslo", "09:00", "16:20"),
    WIENER_BORSE("Wiener Börse", Region.EU, "VI", "EUR", "Europe/Vienna", "09:00", "17:30"),
    PRAGUE("Prague Stock Exchange", Region.EU, "PR", "CZK", "Europe/Prague", "09:00", "16:25"),
    WARSAW("Warsaw Stock Exchange", Region.EU, "WA", "PLN", "Europe/Warsaw", "09:00", "17:00");

    private final String displayName;
    private final Region region;
    private final String suffix;
    private final String currency;
    private final ZoneId zone;
    private final LocalTime open;
    private final LocalTime close;

    Exchange(String displayName, Region region, String suffix, String currency, String zone, String open,
            String close) {
        this.displayName = displayName;
        this.region = region;
        this.suffix = suffix;
        this.currency = currency;
        this.zone = ZoneId.of(zone);
        this.open = LocalTime.parse(open);
        this.close = LocalTime.parse(close);
    }

    public String displayName() {
        return displayName;
    }

    public Region region() {
        return region;
    }

    /** Yahoo suffix without the dot ({@code "DE"}), or null for US exchanges. */
    public String suffix() {
        return suffix;
    }

    /** Usual trading currency (ISO 4217); LSE quotes in pence are normalized to GBP. */
    public String currency() {
        return currency;
    }

    public ZoneId zone() {
        return zone;
    }

    public LocalTime close() {
        return close;
    }

    public static Optional<Exchange> bySuffix(String suffix) {
        return Arrays.stream(values()).filter(e -> e.suffix != null && e.suffix.equals(suffix)).findFirst();
    }

    /** Session hours shared by all US exchanges; used when a US symbol's exact exchange is unknown. */
    public static Exchange usSession() {
        return NYSE;
    }

    /** The trading date of an instant in the exchange's local time. */
    public LocalDate localDate(Instant instant) {
        return instant.atZone(zone).toLocalDate();
    }

    /**
     * Classifies a report instant against this exchange's regular session. A time of exactly midnight UTC is
     * how providers store date-only values, so it counts as unknown.
     */
    public ReportTime classify(Instant reportInstant) {
        if (reportInstant.getEpochSecond() % 86_400 == 0) {
            return ReportTime.UNKNOWN;
        }
        ZonedDateTime local = reportInstant.atZone(zone);
        LocalTime time = local.toLocalTime();
        if (time.isBefore(open)) {
            return ReportTime.BMO;
        }
        return time.isBefore(close) ? ReportTime.DMH : ReportTime.AMC;
    }
}
