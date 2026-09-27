package com.earningstracker.provider;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalStateException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import com.earningstracker.market.Quote;
import com.earningstracker.market.Region;
import com.earningstracker.provider.ProviderException.Kind;
import org.junit.jupiter.api.Test;

class ProviderRouterTest {

    private final List<String> calls = new ArrayList<>();

    private QuoteProvider provider(String id, boolean enabled, Kind failure) {
        return new QuoteProvider() {
            @Override
            public String id() {
                return id;
            }

            @Override
            public boolean isEnabled() {
                return enabled;
            }

            @Override
            public Quote quote(String symbol) {
                calls.add(id);
                if (failure != null) {
                    throw new ProviderException(id, failure, "failed");
                }
                return Quote.of(symbol, 10, 9, "USD", Instant.EPOCH);
            }
        };
    }

    private ProviderRouter router(QuoteProvider... providers) {
        List<String> ids = java.util.Arrays.stream(providers).map(MarketDataProvider::id).toList();
        return new ProviderRouter(List.of(providers),
                new ProviderSettings(Map.of(Capability.QUOTE, Map.of(Region.US, ids)), null));
    }

    @Test
    void fallsBackInChainOrderAndSkipsDisabledProviders() {
        ProviderRouter router = router(provider("a", false, null), provider("b", true, Kind.UNAVAILABLE),
                provider("c", true, null));

        Sourced<Quote> result = router.first(Capability.QUOTE, Region.US, (QuoteProvider p) -> p.quote("AAPL"));

        assertThat(result.provider()).isEqualTo("c");
        assertThat(calls).containsExactly("b", "c");
    }

    @Test
    void reportsNotFoundOnlyWhenNothingFailedTransiently() {
        assertThatThrownBy(() -> router(provider("a", true, Kind.UNSUPPORTED), provider("b", true, Kind.NOT_FOUND))
                .first(Capability.QUOTE, Region.US, (QuoteProvider p) -> p.quote("ZZZZ")))
                .isInstanceOfSatisfying(ProviderException.class, e -> assertThat(e.kind()).isEqualTo(Kind.NOT_FOUND));

        assertThatThrownBy(() -> router(provider("a", true, Kind.UNAVAILABLE), provider("b", true, Kind.NOT_FOUND))
                .first(Capability.QUOTE, Region.US, (QuoteProvider p) -> p.quote("ZZZZ")))
                .isInstanceOfSatisfying(ProviderException.class, e -> assertThat(e.kind()).isEqualTo(Kind.UNAVAILABLE));

        assertThatThrownBy(() -> router(provider("a", true, Kind.RATE_LIMITED))
                .first(Capability.QUOTE, Region.US, (QuoteProvider p) -> p.quote("AAPL")))
                .isInstanceOfSatisfying(ProviderException.class, e -> assertThat(e.kind()).isEqualTo(Kind.RATE_LIMITED));
    }

    @Test
    void failsWhenNoProviderIsEnabled() {
        assertThatThrownBy(() -> router(provider("a", false, null))
                .first(Capability.QUOTE, Region.US, (QuoteProvider p) -> p.quote("AAPL")))
                .isInstanceOfSatisfying(ProviderException.class, e -> assertThat(e.kind()).isEqualTo(Kind.UNAVAILABLE));
    }

    @Test
    void allCollectsEveryAnswerAndToleratesPartialFailure() {
        ProviderRouter router = router(provider("a", true, null), provider("b", true, Kind.UNAVAILABLE),
                provider("c", true, null));

        List<Sourced<Quote>> results = router.all(Capability.QUOTE, Region.US, (QuoteProvider p) -> p.quote("AAPL"));

        assertThat(results).extracting(Sourced::provider).containsExactly("a", "c");
    }

    @Test
    void rejectsChainsNamingUnknownProviders() {
        assertThatIllegalStateException().isThrownBy(() -> new ProviderRouter(List.of(provider("a", true, null)),
                new ProviderSettings(Map.of(Capability.QUOTE, Map.of(Region.US, List.of("nope"))), null)))
                .withMessageContaining("nope");
    }
}
