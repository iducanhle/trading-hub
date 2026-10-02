package com.earningstracker.provider.t212;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.TreeSet;

import com.earningstracker.config.DotenvPropertySourceLoader;
import com.earningstracker.provider.ProviderTestSupport;
import com.earningstracker.t212.T212Fill;
import com.earningstracker.t212.T212Normalizer;
import com.earningstracker.t212.T212Properties;
import com.earningstracker.t212.T212SymbolMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.PropertySource;
import org.springframework.core.io.FileSystemResource;
import tools.jackson.databind.JsonNode;

/**
 * Probes a real Trading 212 account (use a DEMO key) to settle the UNVERIFIED points in docs/DATA-SOURCES.md.
 * Opt-in and read-only:
 * <pre>LIVE_T212=true ./mvnw test -Dtest=LiveT212Test</pre>
 * The key comes from {@code T212_PROBE_API_KEY} / {@code T212_PROBE_API_SECRET} (environment or {@code backend/.env})
 * and {@code T212_PROBE_ENV} ({@code DEMO} by default). It writes the raw answers and {@code findings.md} to
 * {@code target/t212-probe/} (git-ignored). The key is never written or printed.
 */
@EnabledIfEnvironmentVariable(named = "LIVE_T212", matches = "true")
class LiveT212Test {

    private static final Path OUT = Path.of("target", "t212-probe");

    @Test
    void probe() throws IOException {
        PropertySource<?> env = Files.exists(Path.of(".env"))
                ? new DotenvPropertySourceLoader().load("dotenv", new FileSystemResource(".env")).getFirst()
                : new MapPropertySource("empty", Map.of());
        String key = value(env, "T212_PROBE_API_KEY");
        String secret = value(env, "T212_PROBE_API_SECRET");
        T212Environment environment = "LIVE".equalsIgnoreCase(value(env, "T212_PROBE_ENV")) ? T212Environment.LIVE
                : T212Environment.DEMO;
        assertThat(key).as("T212_PROBE_API_KEY").isNotBlank();
        T212Credentials credentials = new T212Credentials(key, secret, environment);
        T212Properties properties = new T212Properties("", "", "https://live.trading212.com",
                "https://demo.trading212.com", Duration.ofHours(6), Duration.ofSeconds(10), Duration.ofSeconds(30),
                Duration.ofSeconds(60), Duration.ofSeconds(70));
        T212Client client = new T212Client(properties, ProviderTestSupport.JSON, Clock.systemUTC());
        Files.createDirectories(OUT);

        JsonNode summary = client.accountSummary(credentials);
        write("account-summary.json", summary);
        String currency = summary.path("currency").stringValue();
        List<JsonNode> positions = client.positions(credentials);
        write("positions.json", positions);
        List<JsonNode> orders = all(client, credentials, T212Client.History.ORDERS);
        write("orders.json", orders);
        List<JsonNode> dividends = all(client, credentials, T212Client.History.DIVIDENDS);
        write("dividends.json", dividends);
        List<JsonNode> transactions = all(client, credentials, T212Client.History.TRANSACTIONS);
        write("transactions.json", transactions);

        StringBuilder md = new StringBuilder("# Trading 212 probe (" + environment + ", " + currency + ")\n\n");
        md.append("Orders: ").append(orders.size()).append(" items, dividends: ").append(dividends.size())
                .append(", transactions: ").append(transactions.size()).append(", positions: ")
                .append(positions.size()).append("\n\n");

        // Signs, fill types, realized results, taxes, currencies
        Map<String, Integer> counts = new TreeMap<>();
        Map<String, Integer> orderIds = new HashMap<>();
        TreeSet<String> taxCurrencies = new TreeSet<>();
        TreeSet<String> instrumentCurrencies = new TreeSet<>();
        Map<String, List<Double>> holdings = new HashMap<>();
        List<String> sells = new ArrayList<>();
        List<JsonNode> chronological = new ArrayList<>(orders);
        java.util.Collections.reverse(chronological);
        for (JsonNode item : chronological) {
            JsonNode order = item.path("order");
            JsonNode fill = item.path("fill");
            orderIds.merge(order.path("id").toString(), 1, Integer::sum);
            instrumentCurrencies.add(order.path("instrument").path("currency").toString());
            if (!fill.isObject()) {
                counts.merge("no fill (status " + order.path("status").toString() + ")", 1, Integer::sum);
                continue;
            }
            String side = order.path("side").toString();
            double quantity = fill.path("quantity").asDouble();
            JsonNode wallet = fill.path("walletImpact");
            counts.merge("fill.type=" + fill.path("type").toString() + " side=" + side + " qty"
                    + (quantity < 0 ? "<0" : ">=0") + " netValue" + (wallet.path("netValue").asDouble() < 0 ? "<0"
                            : ">=0") + " realisedProfitLoss=" + describe(wallet.path("realisedProfitLoss")),
                    1, Integer::sum);
            wallet.path("taxes").values().forEach(tax -> taxCurrencies.add(tax.path("name").toString() + " in "
                    + tax.path("currency").toString() + " (wallet " + wallet.path("currency").toString() + ")"));
            T212Fill normalized = T212Normalizer.fill(item, currency).orElse(null);
            if (normalized == null || !T212Fill.TRADE.equals(normalized.kind())) {
                continue;
            }
            List<Double> position = holdings.computeIfAbsent(normalized.ticker(), t -> new ArrayList<>(List.of(0.0,
                    0.0)));
            double held = position.get(0);
            double cost = position.get(1);
            if (normalized.side() == T212Fill.Side.BUY) {
                position.set(0, held + normalized.quantity());
                position.set(1, cost + normalized.value() - normalized.fees() - normalized.taxes());
            } else {
                double average = held > 0 ? cost / held : 0;
                double computed = normalized.value() + normalized.fees() + normalized.taxes()
                        - average * normalized.quantity();
                sells.add("| " + normalized.ticker() + " | " + normalized.executedAt() + " | "
                        + normalized.realizedPnl() + " | " + round(computed) + " | "
                        + round(normalized.fees() + normalized.taxes()) + " |");
                position.set(0, held - normalized.quantity());
                position.set(1, cost - average * Math.min(normalized.quantity(), held));
            }
        }
        md.append("## Fills\n\n| Shape | Count |\n|---|---|\n");
        counts.forEach((shape, n) -> md.append("| ").append(shape).append(" | ").append(n).append(" |\n"));
        long repeated = orderIds.values().stream().filter(n -> n > 1).count();
        md.append("\nOrder ids with more than one history item: ").append(repeated).append("\n\n");
        md.append("Taxes seen: ").append(taxCurrencies).append("\n\n");
        md.append("Instrument currencies seen: ").append(instrumentCurrencies).append("\n\n");
        md.append("## Sells: Trading 212's realized result vs. the engine's rule\n\n")
                .append("Computed = proceeds before fees − average cost before fees; it should equal T212's figure "
                        + "(splits are not applied here, so sells after a split can differ).\n\n")
                .append("| Ticker | At | T212 realised | Computed | Fees + taxes |\n|---|---|---|---|---|\n");
        sells.forEach(line -> md.append(line).append('\n'));
        md.append("\nAccount summary realizedProfitLoss: ").append(summary.path("investments")
                .path("realizedProfitLoss")).append("\n\n");

        // Symbol mapping
        md.append("## Ticker mapping\n\n| Ticker | Currency | Symbol |\n|---|---|---|\n");
        Map<String, String> tickers = new LinkedHashMap<>();
        for (JsonNode item : orders) {
            JsonNode instrument = item.path("order").path("instrument");
            tickers.putIfAbsent(item.path("order").path("ticker").stringValue(), instrument.path("currency")
                    .stringValue());
        }
        for (JsonNode position : positions) {
            tickers.putIfAbsent(position.path("instrument").path("ticker").stringValue(),
                    position.path("instrument").path("currency").stringValue());
        }
        tickers.forEach((ticker, ccy) -> md.append("| ").append(ticker).append(" | ").append(ccy).append(" | ")
                .append(T212SymbolMapper.map(ticker, ccy)).append(" |\n"));

        md.append("\n## Transactions\n\n");
        Map<String, String> transactionShapes = new TreeMap<>();
        transactions.forEach(t -> transactionShapes.merge(t.path("type").toString(),
                "amount" + (t.path("amount").asDouble() < 0 ? "<0" : ">=0") + " " + t.path("currency"),
                (a, b) -> a.equals(b) ? a : a + ", " + b));
        transactionShapes.forEach((type, shape) -> md.append("- ").append(type).append(": ").append(shape)
                .append('\n'));
        Files.writeString(OUT.resolve("findings.md"), md.toString(), StandardCharsets.UTF_8);
        System.out.println(md);
    }

    private static List<JsonNode> all(T212Client client, T212Credentials credentials, T212Client.History history) {
        List<JsonNode> items = new ArrayList<>();
        String path = history.firstPage(T212Client.MAX_PAGE_SIZE);
        while (path != null) {
            T212Client.Page page = client.historyPage(credentials, path);
            items.addAll(page.items());
            path = page.nextPagePath();
        }
        return items;
    }

    private static void write(String file, Object value) throws IOException {
        Files.writeString(OUT.resolve(file), ProviderTestSupport.JSON.writerWithDefaultPrettyPrinter()
                .writeValueAsString(value), StandardCharsets.UTF_8);
    }

    private static String describe(JsonNode node) {
        if (node.isMissingNode()) {
            return "missing";
        }
        if (node.isNull()) {
            return "null";
        }
        double value = node.asDouble();
        return value == 0 ? "0" : value < 0 ? "<0" : ">0";
    }

    private static String value(PropertySource<?> env, String name) {
        String fromEnv = System.getenv(name);
        if (fromEnv != null && !fromEnv.isBlank()) {
            return fromEnv.strip();
        }
        Object fromFile = env.getProperty(name);
        return fromFile == null ? null : fromFile.toString().strip();
    }

    private static double round(double value) {
        return Math.round(value * 100) / 100.0;
    }
}
