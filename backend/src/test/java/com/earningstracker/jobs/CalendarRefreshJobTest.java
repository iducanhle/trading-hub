package com.earningstracker.jobs;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import com.earningstracker.market.CompanyProfile;
import com.earningstracker.market.EarningsReport;
import com.earningstracker.market.Exchange;
import com.earningstracker.market.ReportTime;
import com.earningstracker.market.SymbolMatch;
import com.earningstracker.service.ServiceFixture;
import com.earningstracker.universe.EuUniverse;
import com.earningstracker.universe.UniverseProperties;
import com.earningstracker.web.dto.Dtos;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class CalendarRefreshJobTest {

    // The fixture clock is Sunday 2026-09-27 10:00 UTC: the window is 2026-09-13..2026-11-11.
    private final ServiceFixture f = new ServiceFixture();
    private final EuUniverse universe = new EuUniverse(null, new UniverseProperties("universe-test.csv", false));
    private final TrackedSymbols tracked = new TrackedSymbols(f.store, f.follows, f.views,
            new JobProperties(false, 1, Duration.ofDays(30), 14, 45, Duration.ofDays(30)));
    /** Budget of one profile call per run. */
    private final CalendarRefreshJob job = new CalendarRefreshJob(f.router, f.profiles, f.earnings, f.calendar, f.fx,
            universe, tracked, new JobProperties(false, 1, Duration.ofDays(30), 14, 45, Duration.ofDays(30)), f.clock);

    private static EarningsReport report(String symbol, String date, ReportTime time, Double epsEstimate) {
        return new EarningsReport(symbol, LocalDate.parse(date), time, null, 3, 2026, "USD", epsEstimate, null,
                null, null, null);
    }

    private static CompanyProfile profile(String symbol, String name, Exchange exchange, String currency,
            double marketCap) {
        return new CompanyProfile(symbol, name, exchange, currency, currency, null, null, null,
                "https://logo.example/" + symbol + ".png", null, marketCap, null, null, null, null, null);
    }

    @BeforeEach
    void data() {
        f.provider.calendar.addAll(List.of(
                report("AAPL", "2026-10-29", ReportTime.AMC, 1.78),
                report("MSFT", "2026-09-29", ReportTime.AMC, 3.65),
                report("JPM", "2026-09-15", ReportTime.BMO, 4.85)));
        f.provider.profiles.put("MSFT", profile("MSFT", "Microsoft Corporation", Exchange.NASDAQ, "USD", 3.9e12));
        f.provider.profiles.put("AAPL", profile("AAPL", "Apple Inc.", Exchange.NASDAQ, "USD", 3.6e12));
        f.provider.listings.put("AAPL", new SymbolMatch("AAPL", "Apple Inc.", Exchange.NASDAQ, "USD"));
        f.provider.listings.put("JPM", new SymbolMatch("JPM", "JPMorgan Chase & Co.", Exchange.NYSE, "USD"));
        // SAP.DE is followed, so the job refreshes it now; ASML.AS only has what an earlier run stored.
        f.store.set("users", "u1", Map.of("email", "me@example.com"));
        f.store.set("users/u1/follows", "SAP.DE", Map.of("symbol", "SAP.DE", "name", "SAP SE"));
        f.provider.earnings.put("SAP.DE", List.of(new EarningsReport("SAP.DE", LocalDate.parse("2026-10-21"),
                ReportTime.AMC, null, 3, 2026, "EUR", 1.83, null, 10.09e9, null, true)));
        f.provider.profiles.put("SAP.DE", profile("SAP.DE", "SAP SE", Exchange.XETRA, "EUR", 214.6e9));
    }

    @Test
    void writesTheCalendarDaysAndRecordsEveryEvent() {
        Map<String, Object> stats = job.run();

        assertThat(f.provider.calendarRequests).as("7-day chunks over the window").hasSize(9)
                .startsWith(LocalDate.parse("2026-09-13"), LocalDate.parse("2026-09-20"));
        assertThat(stats).containsEntry("usReports", 3).containsEntry("usSymbols", 3).containsEntry("earningsRecorded", 3)
                .containsEntry("euRefreshed", 1).containsEntry("daysWritten", 4);

        // MSFT (nearest date) used the one profile call: name, logo and market cap in USD.
        Dtos.EarningsEvent msft = f.calendar.storedDay(LocalDate.parse("2026-09-29")).getFirst();
        assertThat(msft).extracting(Dtos.EarningsEvent::name, Dtos.EarningsEvent::exchange,
                Dtos.EarningsEvent::logoUrl, Dtos.EarningsEvent::marketCapUsd, Dtos.EarningsEvent::epsEstimate)
                .containsExactly("Microsoft Corporation", "NASDAQ", "https://logo.example/MSFT.png", 3.9e12, 3.65);
        // AAPL is past the budget: listing name, no market cap until a later run.
        Dtos.EarningsEvent aapl = f.calendar.storedDay(LocalDate.parse("2026-10-29")).getFirst();
        assertThat(aapl).extracting(Dtos.EarningsEvent::name, Dtos.EarningsEvent::marketCapUsd)
                .containsExactly("Apple Inc.", null);
        assertThat(f.calendar.storedDay(LocalDate.parse("2026-09-15"))).extracting(Dtos.EarningsEvent::symbol)
                .containsExactly("JPM");
        // EU: the followed symbol's upcoming report, with its stored profile.
        Dtos.EarningsEvent sap = f.calendar.storedDay(LocalDate.parse("2026-10-21")).getFirst();
        assertThat(sap).extracting(Dtos.EarningsEvent::symbol, Dtos.EarningsEvent::exchange,
                Dtos.EarningsEvent::revenueEstimate).containsExactly("SAP.DE", "XETRA", 10.09e9);

        assertThat(f.earnings.stored("AAPL").orElseThrow().value()).extracting(EarningsReport::date)
                .containsExactly(LocalDate.parse("2026-10-29"));
    }

    @Test
    void aSecondRunWritesOnlyWhatChangedAndSpendsTheBudgetOnTheNextSymbol() {
        job.run();
        f.provider.profiles.put("JPM", profile("JPM", "JPMorgan Chase & Co.", Exchange.NYSE, "USD", 8.1e11));
        long writes = f.store.usage().writes();

        Map<String, Object> stats = job.run();

        // MSFT reuses its stored profile, so the one call goes to JPM, the next nearest date.
        assertThat(stats).containsEntry("earningsRecorded", 0).containsEntry("profileCalls", 1)
                .containsEntry("daysWritten", 1);
        assertThat(f.calendar.storedDay(LocalDate.parse("2026-09-15")).getFirst().marketCapUsd()).isEqualTo(8.1e11);
        // JPM's profile and calendar day, the followed profile refresh, at most the FX rates.
        assertThat(f.store.usage().writes() - writes).isLessThanOrEqualTo(4);
    }

    @Test
    void anOutageKeepsTheStoredDays() {
        job.run();
        f.provider.failing = true;

        Map<String, Object> stats = job.run();

        assertThat(stats).containsEntry("usFailedChunks", 9).containsEntry("usReports", 0)
                .containsEntry("daysWritten", 0);
        assertThat(f.calendar.storedDay(LocalDate.parse("2026-10-29"))).extracting(Dtos.EarningsEvent::symbol)
                .containsExactly("AAPL");
        assertThat(f.calendar.storedDay(LocalDate.parse("2026-10-21"))).extracting(Dtos.EarningsEvent::symbol)
                .containsExactly("SAP.DE");
    }
}
