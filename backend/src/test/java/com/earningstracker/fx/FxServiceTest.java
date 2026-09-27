package com.earningstracker.fx;

import static com.earningstracker.provider.ProviderTestSupport.CLOCK;
import static com.earningstracker.provider.ProviderTestSupport.JSON;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import com.earningstracker.cache.InMemoryDocumentStore;
import com.earningstracker.cache.TieredCache;
import com.earningstracker.provider.FxRateProvider;
import com.earningstracker.provider.ProviderException;
import com.earningstracker.provider.ProviderException.Kind;
import org.junit.jupiter.api.Test;

class FxServiceTest {

    private static final Map<String, Double> RATES = Map.of("EUR", 1.1401, "GBP", 1.3246, "CHF", 1.2073,
            "SEK", 0.1009, "NOK", 0.1052, "DKK", 0.1524, "PLN", 0.2608, "CZK", 0.0468);

    private final AtomicInteger calls = new AtomicInteger();
    private final InMemoryDocumentStore store = new InMemoryDocumentStore();

    private FxService service(boolean failing) {
        FxRateProvider provider = new FxRateProvider() {
            @Override
            public String id() {
                return "fake";
            }

            @Override
            public double usdPerUnit(String currency) {
                calls.incrementAndGet();
                if (failing) {
                    throw new ProviderException("fake", Kind.UNAVAILABLE, "down");
                }
                return RATES.get(currency);
            }
        };
        return new FxService(new TieredCache(store, JSON, CLOCK), provider);
    }

    @Test
    void convertsWithCachedDailyRates() {
        FxService fx = service(false);

        assertThat(fx.toUsd(1_000_000.0, "EUR")).isCloseTo(1_140_100.0, within(1e-6));
        assertThat(fx.toUsd(724_157_005_824.0, "CZK")).isCloseTo(33_890_547_872.56, within(1.0));
        assertThat(fx.toUsd(100.0, "USD")).isEqualTo(100.0);
        assertThat(fx.toUsd(10_000.0, "GBp")).isCloseTo(132.46, within(1e-9)); // pence → pounds → USD
        assertThat(calls).hasValue(8); // one fetch of all currencies, then cached
        assertThat(store.peek("fx", "latest")).isPresent();
    }

    @Test
    void unknownCurrenciesAndMissingInputsGiveNull() {
        FxService fx = service(false);

        assertThat(fx.toUsd(1.0, "JPY")).isNull();
        assertThat(fx.toUsd(null, "EUR")).isNull();
        assertThat(fx.toUsd(1.0, null)).isNull();
    }

    @Test
    void unavailableRatesGiveNullInsteadOfFailing() {
        assertThat(service(true).toUsd(1.0, "EUR")).isNull();
    }
}
