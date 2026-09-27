package com.earningstracker.service;

import java.time.Duration;

import com.earningstracker.cache.TieredCache;
import com.earningstracker.cache.TieredCache.Cached;
import com.earningstracker.market.Quote;
import com.earningstracker.market.Symbols;
import com.earningstracker.provider.Capability;
import com.earningstracker.provider.ProviderRouter;
import com.earningstracker.provider.QuoteProvider;
import org.springframework.stereotype.Service;

/** Live quotes: memory only, 60 s (§6: quotes are never written to Firestore). */
@Service
public class QuoteService {

    private final TieredCache cache;
    private final TieredCache.Policy<Quote> policy;
    private final ProviderRouter router;

    public QuoteService(TieredCache cache, ProviderRouter router) {
        this.cache = cache;
        this.policy = cache.policy("quotes", Quote.class, Duration.ofSeconds(60), false);
        this.router = router;
    }

    public Cached<Quote> quote(String symbol) {
        return cache.get(policy, symbol, () -> router
                .<QuoteProvider, Quote>first(Capability.QUOTE, Symbols.region(symbol), p -> p.quote(symbol)).value());
    }
}
