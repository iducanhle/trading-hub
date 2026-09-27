package com.earningstracker.universe;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import com.earningstracker.market.Region;
import com.earningstracker.market.Symbols;
import com.earningstracker.provider.SymbolValidator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

/**
 * European symbols whose earnings dates the calendar tracks, besides followed and recently viewed ones
 * ({@code eu-universe.csv}: major index constituents). Validated against Yahoo after startup; symbols Yahoo does
 * not know are logged and left out of {@link #validMembers()}.
 */
@Component
public class EuUniverse {

    public record Member(String symbol, String name) {
    }

    private static final Logger log = LoggerFactory.getLogger(EuUniverse.class);

    private final List<Member> members;
    private final Map<String, Member> bySymbol = new LinkedHashMap<>();
    private final SymbolValidator validator;
    private final boolean validateOnStartup;
    private volatile Set<String> invalid = Set.of();

    public EuUniverse(SymbolValidator validator, UniverseProperties properties) {
        this.validator = validator;
        this.validateOnStartup = properties.validateOnStartup();
        this.members = parse(read(properties.resource()));
        members.forEach(member -> bySymbol.put(member.symbol(), member));
        log.info("EU universe: {} symbols loaded from {}", members.size(), properties.resource());
    }

    public List<Member> members() {
        return members;
    }

    /** Members not rejected by the last validation (all of them until it has run). */
    public List<Member> validMembers() {
        Set<String> rejected = invalid;
        return members.stream().filter(member -> !rejected.contains(member.symbol())).toList();
    }

    public Optional<Member> find(String symbol) {
        return Optional.ofNullable(bySymbol.get(symbol));
    }

    public Set<String> invalidSymbols() {
        return invalid;
    }

    @EventListener(ApplicationReadyEvent.class)
    void validateInBackground() {
        if (validateOnStartup) {
            Thread.ofVirtual().name("eu-universe-validation").start(this::validate);
        }
    }

    /** Checks every symbol against Yahoo; returns the ones it does not know. */
    public Set<String> validate() {
        try {
            Set<String> known = validator.existingSymbols(bySymbol.keySet());
            Set<String> unknown = new LinkedHashSet<>(bySymbol.keySet());
            unknown.removeAll(known);
            invalid = Set.copyOf(unknown);
            if (unknown.isEmpty()) {
                log.info("EU universe: all {} symbols are known to Yahoo", members.size());
            } else {
                log.warn("EU universe: {} of {} symbols are unknown to Yahoo and will be skipped: {}", unknown.size(),
                        members.size(), unknown);
            }
            return unknown;
        } catch (RuntimeException e) {
            log.warn("EU universe validation failed, keeping all symbols: {}", e.getMessage());
            return Set.of();
        }
    }

    /** CSV lines {@code symbol,name}; blank lines, {@code #} comments and the header are skipped. */
    static List<Member> parse(List<String> lines) {
        List<Member> result = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        for (String raw : lines) {
            String line = raw.strip();
            if (line.isEmpty() || line.startsWith("#") || line.equalsIgnoreCase("symbol,name")) {
                continue;
            }
            int comma = line.indexOf(',');
            String symbol = comma < 0 ? line : line.substring(0, comma).strip();
            Optional<String> canonical = Symbols.normalize(symbol).filter(s -> Symbols.region(s) == Region.EU);
            if (canonical.isEmpty() || !seen.add(canonical.get())) {
                log.warn("EU universe: skipping invalid or duplicate line '{}'", line);
                continue;
            }
            result.add(new Member(canonical.get(), comma < 0 ? canonical.get() : name(line.substring(comma + 1))));
        }
        return List.copyOf(result);
    }

    private static String name(String field) {
        String value = field.strip();
        if (value.length() >= 2 && value.startsWith("\"") && value.endsWith("\"")) {
            value = value.substring(1, value.length() - 1).replace("\"\"", "\"");
        }
        return value;
    }

    private static List<String> read(String resource) {
        try {
            return new ClassPathResource(resource).getContentAsString(StandardCharsets.UTF_8).lines().toList();
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot read the EU universe from " + resource, e);
        }
    }
}
