package com.earningstracker.t212;

import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.Optional;
import java.util.Set;

import com.earningstracker.provider.http.Json;
import tools.jackson.databind.JsonNode;

/**
 * Turns Trading 212 history items into the stored records. Where the API's conventions are unverified
 * (docs/DATA-SOURCES.md), it reads them defensively. Checked on a real account: sells come with negative
 * quantities and positive {@code netValue}; quantities and values are made positive and {@code side} carries the
 * direction.
 */
public final class T212Normalizer {

    /** Tax names that are taxes; every other charge counts as a fee. */
    static final Set<String> TAX_NAMES = Set.of("STAMP_DUTY", "STAMP_DUTY_RESERVE_TAX", "FRENCH_TRANSACTION_TAX");

    private T212Normalizer() {
    }

    static boolean isPence(String currency) {
        return "GBX".equalsIgnoreCase(currency) || "GBp".equals(currency);
    }

    /** The instrument an item refers to (without a mapped symbol), if it names one. */
    public static Optional<T212InstrumentInfo> instrument(JsonNode item) {
        JsonNode instrument = item.path("instrument").isObject() ? item.path("instrument")
                : item.path("order").path("instrument");
        String ticker = firstText(instrument.path("ticker"), item.path("ticker"), item.path("order").path("ticker"));
        if (ticker == null) {
            return Optional.empty();
        }
        return Optional.of(new T212InstrumentInfo(ticker, Json.text(instrument.path("name")),
                Json.text(instrument.path("isin")),
                firstText(instrument.path("currency"), item.path("order").path("currency"),
                        item.path("tickerCurrency")), null));
    }

    /** A filled order; empty for orders that were never filled (cancelled, rejected, …). */
    public static Optional<T212Fill> fill(JsonNode item, String accountCurrency) {
        JsonNode order = item.path("order");
        JsonNode fill = item.path("fill");
        if (!fill.isObject()) {
            return Optional.empty();
        }
        String orderId = Json.text(order.path("id"));
        String fillId = Json.text(fill.path("id"));
        String ticker = firstText(order.path("ticker"), order.path("instrument").path("ticker"));
        Instant executedAt = firstInstant(fill.path("filledAt"), order.path("createdAt"));
        Double signedQuantity = Json.number(fill.path("quantity"));
        if (signedQuantity == null) {
            signedQuantity = Json.number(order.path("filledQuantity"));
        }
        if ((orderId == null && fillId == null) || ticker == null || executedAt == null || signedQuantity == null
                || signedQuantity == 0) {
            return Optional.empty();
        }
        String id = orderId == null ? "f" + fillId : fillId == null ? orderId : orderId + "-" + fillId;
        String fillType = Optional.ofNullable(Json.text(fill.path("type"))).orElse(T212Fill.TRADE);
        String kind = switch (fillType) {
            case "TRADE" -> T212Fill.TRADE;
            case "STOCK_SPLIT" -> T212Fill.STOCK_SPLIT;
            default -> T212Fill.CORPORATE_ACTION;
        };
        String sideText = Json.text(order.path("side"));
        T212Fill.Side side;
        if (!T212Fill.TRADE.equals(kind) || sideText == null) {
            // Corporate actions add or remove shares; the sign of the quantity is the only reliable direction.
            side = signedQuantity < 0 ? T212Fill.Side.SELL : T212Fill.Side.BUY;
        } else {
            side = "SELL".equalsIgnoreCase(sideText) ? T212Fill.Side.SELL : T212Fill.Side.BUY;
        }
        double quantity = Math.abs(signedQuantity);

        String instrumentCurrency = firstText(order.path("instrument").path("currency"), order.path("currency"));
        Double price = Json.number(fill.path("price"));
        String priceCurrency = instrumentCurrency;
        if (price != null && isPence(instrumentCurrency)) {
            price = price / 100;
            priceCurrency = "GBP";
        }

        JsonNode wallet = fill.path("walletImpact");
        String walletCurrency = Optional.ofNullable(Json.text(wallet.path("currency"))).orElse(accountCurrency);
        Double netValue = Json.number(wallet.path("netValue"));
        if (netValue == null) {
            netValue = Json.number(order.path("filledValue"));
        }
        if (netValue == null && price != null && sameCurrency(priceCurrency, walletCurrency)) {
            netValue = price * quantity;
        }
        double value = netValue == null ? 0 : Math.abs(netValue);
        // Account currency per unit of price currency, derived from the fill itself (no assumption about the
        // direction of fxRate); used to convert charges quoted in the instrument currency.
        Double impliedRate = price != null && price > 0 && value > 0 ? value / (price * quantity) : null;

        double fees = 0;
        double taxes = 0;
        for (JsonNode tax : wallet.path("taxes").values()) {
            Double amount = Json.number(tax.path("quantity"));
            if (amount == null) {
                continue;
            }
            double converted = convert(Math.abs(amount), Json.text(tax.path("currency")), walletCurrency,
                    priceCurrency, impliedRate);
            if (TAX_NAMES.contains(Json.text(tax.path("name")))) {
                taxes += converted;
            } else {
                fees += converted;
            }
        }
        Double realized = side == T212Fill.Side.SELL ? Json.number(wallet.path("realisedProfitLoss")) : null;
        return Optional.of(new T212Fill(id, orderId, executedAt, ticker, side, kind, fillType, quantity, price,
                priceCurrency, value, round(fees), round(taxes), Json.number(wallet.path("fxRate")), realized,
                Json.text(order.path("type")), sameCurrency(walletCurrency, accountCurrency) ? null : walletCurrency));
    }

    public static Optional<T212DividendPayment> dividend(JsonNode item, String accountCurrency) {
        String ticker = firstText(item.path("ticker"), item.path("instrument").path("ticker"));
        Instant paidAt = firstInstant(item.path("paidOn"));
        Double amount = Json.number(item.path("amount"));
        if (ticker == null || paidAt == null || amount == null) {
            return Optional.empty();
        }
        String id = Optional.ofNullable(Json.text(item.path("reference")))
                .orElse("d-" + ticker + "-" + paidAt.toEpochMilli() + "-" + amount);
        Double perShare = Json.number(item.path("grossAmountPerShare"));
        String perShareCurrency = firstText(item.path("tickerCurrency"), item.path("instrument").path("currency"));
        if (perShare != null && isPence(perShareCurrency)) {
            perShare = perShare / 100;
            perShareCurrency = "GBP";
        }
        Double quantity = Json.number(item.path("quantity"));
        // Multi-currency accounts pay into the wallet of the dividend currency; the amount is then in that currency.
        String currency = Json.text(item.path("currency"));
        return Optional.of(new T212DividendPayment(id, paidAt, ticker, quantity == null ? 0 : Math.abs(quantity),
                amount, perShare, perShareCurrency, Json.text(item.path("type")),
                currency == null || sameCurrency(currency, accountCurrency) ? null : currency));
    }

    public static Optional<T212CashTransaction> transaction(JsonNode item, String accountCurrency) {
        Instant at = firstInstant(item.path("dateTime"));
        Double amount = Json.number(item.path("amount"));
        String type = Json.text(item.path("type"));
        if (at == null || amount == null || type == null) {
            return Optional.empty();
        }
        String id = Optional.ofNullable(Json.text(item.path("reference")))
                .orElse("t-" + type + "-" + at.toEpochMilli() + "-" + amount);
        // Trading 212 signs the amounts (withdrawals and fees negative); an unsigned withdrawal is still money out.
        double signed = "WITHDRAW".equals(type) && amount > 0 ? -amount : amount;
        String currency = Optional.ofNullable(Json.text(item.path("currency"))).orElse(accountCurrency);
        return Optional.of(new T212CashTransaction(id, at, type, signed, currency));
    }

    private static double convert(double amount, String currency, String walletCurrency, String priceCurrency,
            Double impliedRate) {
        if (currency == null || sameCurrency(currency, walletCurrency)) {
            return amount;
        }
        double inPriceUnits = isPence(currency) ? amount / 100 : amount;
        String normalized = isPence(currency) ? "GBP" : currency;
        if (impliedRate != null && sameCurrency(normalized, priceCurrency)) {
            return inPriceUnits * impliedRate;
        }
        return amount; // unknown currency: best effort, recorded as is
    }

    private static boolean sameCurrency(String a, String b) {
        return a != null && a.equalsIgnoreCase(b) && !(isPence(a) ^ isPence(b));
    }

    private static double round(double value) {
        return Math.round(value * 1e6) / 1e6;
    }

    private static String firstText(JsonNode... nodes) {
        for (JsonNode node : nodes) {
            String text = Json.text(node);
            if (text != null) {
                return text;
            }
        }
        return null;
    }

    private static Instant firstInstant(JsonNode... nodes) {
        for (JsonNode node : nodes) {
            String text = Json.text(node);
            if (text != null) {
                try {
                    return Instant.parse(text);
                } catch (DateTimeParseException e) {
                    try {
                        return java.time.OffsetDateTime.parse(text).toInstant();
                    } catch (DateTimeParseException ignored) {
                        // try the next field
                    }
                }
            }
        }
        return null;
    }
}
