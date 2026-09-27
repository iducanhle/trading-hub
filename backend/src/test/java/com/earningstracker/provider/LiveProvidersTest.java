package com.earningstracker.provider;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;

import com.earningstracker.config.DotenvPropertySourceLoader;
import com.earningstracker.market.EarningsReport;
import com.earningstracker.market.Region;
import com.earningstracker.market.SymbolMatch;
import com.earningstracker.provider.finnhub.FinnhubProperties;
import com.earningstracker.provider.finnhub.FinnhubProvider;
import com.earningstracker.provider.fmp.FmpProperties;
import com.earningstracker.provider.fmp.FmpProvider;
import com.earningstracker.provider.twelvedata.TwelveDataProperties;
import com.earningstracker.provider.twelvedata.TwelveDataProvider;
import com.earningstracker.provider.yahoo.YahooProperties;
import com.earningstracker.provider.yahoo.YahooProvider;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.core.env.PropertySource;
import org.springframework.core.io.FileSystemResource;

/**
 * Calls the real APIs once per capability (about 25 requests, real rate spacing). Opt-in, for checking that the
 * unofficial endpoints still work:
 * <pre>LIVE_PROVIDERS=true ./mvnw test -Dtest=LiveProvidersTest</pre>
 * Keys come from {@code backend/.env}; providers without a key are skipped.
 */
@EnabledIfEnvironmentVariable(named = "LIVE_PROVIDERS", matches = "true")
class LiveProvidersTest {

    private static final Clock CLOCK = Clock.systemUTC();
    private static final LocalDate TODAY = LocalDate.now(CLOCK);
    private static PropertySource<?> env;
    private static YahooProvider yahoo;

    @BeforeAll
    static void setUp() throws Exception {
        Path dotenv = Path.of(".env");
        env = Files.exists(dotenv)
                ? new DotenvPropertySourceLoader().load("dotenv", new FileSystemResource(dotenv)).getFirst()
                : new org.springframework.core.env.MapPropertySource("empty", java.util.Map.of());
        yahoo = new YahooProvider(new YahooProperties("https://query1.finance.yahoo.com",
                "https://query2.finance.yahoo.com", "https://fc.yahoo.com/", "https://guce.yahoo.com/consent",
                "https://consent.yahoo.com/v2/collectConsent", "https://guce.yahoo.com/copyConsent",
                "https://feeds.finance.yahoo.com/rss/2.0/headline",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 "
                        + "Safari/537.36", Duration.ofSeconds(1)),
                ProviderTestSupport.httpFactory(CLOCK), ProviderTestSupport.JSON, CLOCK);
    }

    private static String key(String name) {
        Object value = env.getProperty(name);
        return value == null ? "" : value.toString();
    }

    @Test
    void yahoo() {
        assertThat(yahoo.search("sap", Region.EU, 5)).extracting(SymbolMatch::symbol).contains("SAP.DE");
        assertThat(yahoo.quote("AZN.L").currency()).isEqualTo("GBP");
        assertThat(yahoo.quote("AZN.L").price()).isBetween(10.0, 1_000.0); // pounds, not pence
        assertThat(yahoo.profile("SAP.DE").marketCap()).isGreaterThan(1e10);
        assertThat(yahoo.dailyBars("AAPL", TODAY.minusDays(10))).isNotEmpty();
        List<EarningsReport> earnings = yahoo.earnings("SAP.DE");
        assertThat(earnings).anyMatch(r -> r.date() != null && r.date().isBefore(TODAY) && r.epsActual() != null);
        assertThat(yahoo.recommendations("AAPL")).isNotEmpty();
        assertThat(yahoo.news("SAP.DE", 5)).isNotEmpty();
        assertThat(yahoo.peers("SAP.DE")).isNotEmpty();
        assertThat(yahoo.usdPerUnit("EUR")).isBetween(0.5, 2.0);
        assertThat(yahoo.existingSymbols(List.of("SAP.DE", "NOPE123.DE"))).isEqualTo(Set.of("SAP.DE"));
    }

    @Test
    void finnhub() {
        FinnhubProvider finnhub = new FinnhubProvider(new FinnhubProperties(key("FINNHUB_API_KEY"),
                "https://finnhub.io/api/v1", Duration.ofMillis(1100)), ProviderTestSupport.httpFactory(CLOCK), CLOCK);
        if (!finnhub.isEnabled()) {
            return;
        }
        assertThat(finnhub.search("apple", Region.US, 5)).extracting(SymbolMatch::symbol).contains("AAPL");
        assertThat(finnhub.quote("AAPL").price()).isPositive();
        assertThat(finnhub.profile("AAPL").marketCap()).isGreaterThan(1e11);
        assertThat(finnhub.earnings("AAPL")).isNotEmpty();
        assertThat(finnhub.calendar(TODAY.minusDays(7), TODAY)).isNotEmpty();
        assertThat(finnhub.recommendations("AAPL")).isNotEmpty();
        assertThat(finnhub.news("AAPL", 3)).isNotEmpty();
        assertThat(finnhub.peers("AAPL")).isNotEmpty();
    }

    @Test
    void twelveData() {
        TwelveDataProvider twelveData = new TwelveDataProvider(new TwelveDataProperties(key("TWELVEDATA_API_KEY"),
                "https://api.twelvedata.com", Duration.ofMillis(7500), 800), ProviderTestSupport.httpFactory(CLOCK),
                CLOCK);
        if (twelveData.isEnabled()) {
            assertThat(twelveData.dailyBars("AAPL", TODAY.minusDays(10))).isNotEmpty();
        }
    }

    @Test
    void fmp() {
        FmpProvider fmp = new FmpProvider(new FmpProperties(key("FMP_API_KEY"),
                "https://financialmodelingprep.com/stable", Duration.ofSeconds(1), 250),
                ProviderTestSupport.httpFactory(CLOCK), CLOCK);
        if (fmp.isEnabled()) {
            assertThat(fmp.earnings("AAPL")).anyMatch(r -> r.revenueActual() != null);
        }
    }
}
