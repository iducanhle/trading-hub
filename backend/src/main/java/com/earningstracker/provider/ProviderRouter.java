package com.earningstracker.provider;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import com.earningstracker.market.Region;
import com.earningstracker.provider.ProviderException.Kind;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Routes each capability call through the region's provider chain from {@code app.providers.chains}. Domain code
 * talks only to this router, so swapping or reordering providers is a configuration change.
 */
@Component
public class ProviderRouter {

    private static final Logger log = LoggerFactory.getLogger(ProviderRouter.class);

    private final Map<Capability, Map<Region, List<MarketDataProvider>>> chains = new EnumMap<>(Capability.class);

    public ProviderRouter(List<MarketDataProvider> providers, ProviderSettings settings) {
        Map<String, MarketDataProvider> byId = providers.stream()
                .collect(Collectors.toMap(MarketDataProvider::id, p -> p));
        settings.chains().forEach((capability, byRegion) -> byRegion.forEach((region, ids) -> {
            List<MarketDataProvider> chain = new ArrayList<>();
            for (String id : ids) {
                MarketDataProvider provider = byId.get(id);
                if (provider == null || !capability.type().isInstance(provider)) {
                    throw new IllegalStateException("app.providers.chains: provider '" + id + "' cannot serve "
                            + capability + " (known providers: " + byId.keySet() + ")");
                }
                chain.add(provider);
            }
            chains.computeIfAbsent(capability, c -> new EnumMap<>(Region.class)).put(region, List.copyOf(chain));
        }));
        providers.stream().filter(p -> !p.isEnabled()).forEach(p -> log.warn(
                "Provider '{}' is disabled (not configured); its chains fall back to the next provider", p.id()));
    }

    /** Enabled providers for the capability in fallback order. */
    @SuppressWarnings("unchecked")
    public <P extends MarketDataProvider> List<P> chain(Capability capability, Region region) {
        return (List<P>) chains.getOrDefault(capability, Map.of()).getOrDefault(region, List.of()).stream()
                .filter(MarketDataProvider::isEnabled)
                .toList();
    }

    /** Configured provider ids in fallback order, including disabled ones (source priority for merges). */
    public List<String> chainIds(Capability capability, Region region) {
        return chains.getOrDefault(capability, Map.of()).getOrDefault(region, List.of()).stream()
                .map(MarketDataProvider::id)
                .toList();
    }

    /** The first provider that answers wins; failures move on to the next provider. */
    public <P extends MarketDataProvider, T> Sourced<T> first(Capability capability, Region region,
            Function<P, T> call) {
        List<ProviderException> failures = new ArrayList<>();
        for (P provider : this.<P>chain(capability, region)) {
            try {
                return new Sourced<>(provider.id(), call.apply(provider));
            } catch (RuntimeException e) {
                failures.add(record(capability, region, provider, e));
            }
        }
        throw combine(capability, region, failures);
    }

    /** Asks every provider in the chain (e.g. to merge earnings); fails only if none of them answers. */
    public <P extends MarketDataProvider, T> List<Sourced<T>> all(Capability capability, Region region,
            Function<P, T> call) {
        List<Sourced<T>> results = new ArrayList<>();
        List<ProviderException> failures = new ArrayList<>();
        for (P provider : this.<P>chain(capability, region)) {
            try {
                results.add(new Sourced<>(provider.id(), call.apply(provider)));
            } catch (RuntimeException e) {
                failures.add(record(capability, region, provider, e));
            }
        }
        if (results.isEmpty()) {
            throw combine(capability, region, failures);
        }
        return results;
    }

    private static ProviderException record(Capability capability, Region region, MarketDataProvider provider,
            RuntimeException e) {
        if (e instanceof ProviderException pe) {
            log.info("{} {} via {} failed ({}): {}", capability, region, provider.id(), pe.kind(), pe.getMessage());
            return pe;
        }
        log.warn("{} {} via {} failed unexpectedly", capability, region, provider.id(), e);
        return new ProviderException(provider.id(), Kind.BAD_RESPONSE, e.getClass().getSimpleName());
    }

    /**
     * NOT_FOUND only when a provider said so and nothing failed transiently (a timeout does not prove the symbol
     * is unknown); RATE_LIMITED when every failure was a rate limit; UNSUPPORTED when every provider declined;
     * otherwise UNAVAILABLE.
     */
    static ProviderException combine(Capability capability, Region region, List<ProviderException> failures) {
        String what = capability + " " + region;
        if (failures.isEmpty()) {
            return new ProviderException("providers", Kind.UNAVAILABLE, "no enabled provider for " + what);
        }
        boolean transientFailure = failures.stream().anyMatch(f -> f.kind() == Kind.UNAVAILABLE
                || f.kind() == Kind.RATE_LIMITED || f.kind() == Kind.BAD_RESPONSE);
        Kind kind;
        if (failures.stream().anyMatch(f -> f.kind() == Kind.NOT_FOUND) && !transientFailure) {
            kind = Kind.NOT_FOUND;
        } else if (failures.stream().allMatch(f -> f.kind() == Kind.RATE_LIMITED)) {
            kind = Kind.RATE_LIMITED;
        } else if (!transientFailure) {
            kind = Kind.UNSUPPORTED;
        } else {
            kind = Kind.UNAVAILABLE;
        }
        String detail = failures.stream().map(f -> f.provider() + "=" + f.kind()).collect(Collectors.joining(", "));
        return new ProviderException("providers", kind, what + " failed: " + detail);
    }
}
