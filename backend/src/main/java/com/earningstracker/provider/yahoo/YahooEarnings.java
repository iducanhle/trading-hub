package com.earningstracker.provider.yahoo;

import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.earningstracker.market.EarningsReport;
import com.earningstracker.market.Exchange;
import com.earningstracker.market.Money;
import com.earningstracker.market.ReportTime;
import com.earningstracker.provider.http.Json;
import tools.jackson.databind.JsonNode;

/**
 * Builds a symbol's reports from Yahoo data, with no I/O:
 * <ul>
 * <li>{@code sp_earnings} rows: report datetimes (hence report time), EPS estimate/actual, fiscal period of the
 * upcoming event;</li>
 * <li>{@code calendarEvents} / {@code earningsTrend}: estimates for the upcoming quarter;</li>
 * <li>{@code financialsChart}: revenue actuals of the last 4 quarters;</li>
 * <li>{@code earningsHistory}: EPS of the last 4 quarters with their fiscal period end.</li>
 * </ul>
 * Quarter-level values attach to the first report dated within {@value #MAX_REPORT_LAG_DAYS} days after the
 * quarter end.
 */
final class YahooEarnings {

    static final int MAX_REPORT_LAG_DAYS = 100;
    private static final Pattern FISCAL_PERIOD = Pattern.compile("Q([1-4])\\s+(\\d{4})");
    private static final Pattern QUARTER_LABEL = Pattern.compile("([1-4])Q(\\d{4})");

    private YahooEarnings() {
    }

    static List<EarningsReport> merge(String symbol, JsonNode spEarnings, JsonNode summary, LocalDate today,
            Exchange exchange) {
        String rawCurrency = Objects.requireNonNullElse(Json.text(summary.path("earnings").path("financialCurrency")),
                Objects.requireNonNullElse(Json.text(summary.path("price").path("currency")), exchange.currency()));
        List<EarningsReport> reports = fromSpEarnings(symbol, spEarnings, rawCurrency, exchange);
        applyUpcoming(symbol, reports, summary, rawCurrency, today);
        applyRevenueActuals(reports, summary, rawCurrency, today);
        applyEarningsHistory(symbol, reports, summary, rawCurrency, today);
        return reports;
    }

    private static List<EarningsReport> fromSpEarnings(String symbol, JsonNode spEarnings, String rawCurrency,
            Exchange exchange) {
        JsonNode document = spEarnings.path("finance").path("result").path(0).path("documents").path(0);
        List<String> columns = new ArrayList<>();
        document.path("columns").forEach(column -> columns.add(Json.text(column.path("id"))));
        List<EarningsReport> reports = new ArrayList<>();
        for (JsonNode row : document.path("rows")) {
            String eventType = Json.text(cell(row, columns, "eventtype"));
            String start = Json.text(cell(row, columns, "startdatetime"));
            if (start == null || (eventType != null && !eventType.equals("EAD") && !eventType.equals("ERA"))) {
                continue;
            }
            Instant at = Instant.parse(start);
            boolean dateOnly = at.getEpochSecond() % 86_400 == 0;
            LocalDate date = dateOnly ? LocalDate.ofInstant(at, ZoneOffset.UTC) : exchange.localDate(at);
            if (reports.stream().anyMatch(r -> date.equals(r.date()))) {
                continue;
            }
            String timeType = Objects.requireNonNullElse(Json.text(cell(row, columns, "startdatetimetype")), "");
            ReportTime time = switch (timeType.toUpperCase(Locale.ROOT)) {
                case "BMO" -> ReportTime.BMO;
                case "AMC" -> ReportTime.AMC;
                case "TAS" -> exchange.classify(at);
                default -> ReportTime.UNKNOWN;
            };
            Matcher fiscal = FISCAL_PERIOD.matcher(Objects.requireNonNullElse(Json.text(cell(row, columns, "eventname")), ""));
            boolean hasFiscal = fiscal.find();
            reports.add(new EarningsReport(symbol, date, time, null,
                    hasFiscal ? Integer.valueOf(fiscal.group(1)) : null, hasFiscal ? Integer.valueOf(fiscal.group(2)) : null,
                    Money.majorCurrency(rawCurrency),
                    Money.toMajor(Json.number(cell(row, columns, "epsestimate")), rawCurrency),
                    Money.toMajor(Json.number(cell(row, columns, "epsactual")), rawCurrency), null, null, null));
        }
        return reports;
    }

    /** Estimates and date confirmation for the next report, from calendarEvents with earningsTrend as fallback. */
    private static void applyUpcoming(String symbol, List<EarningsReport> reports, JsonNode summary,
            String rawCurrency, LocalDate today) {
        JsonNode calendar = summary.path("calendarEvents").path("earnings");
        List<LocalDate> dates = new ArrayList<>();
        calendar.path("earningsDate").forEach(d -> {
            LocalDate date = dateOf(d);
            if (date != null) {
                dates.add(date);
            }
        });
        JsonNode thisQuarter = trend(summary, "0q");
        Double epsEstimate = firstNonNull(Json.raw(calendar.path("earningsAverage")),
                Json.raw(thisQuarter.path("earningsEstimate").path("avg")));
        Double revenueEstimate = firstNonNull(Json.positive(Json.raw(calendar.path("revenueAverage"))),
                Json.positive(Json.raw(thisQuarter.path("revenueEstimate").path("avg"))));
        LocalDate periodEnd = date(Json.text(thisQuarter.path("endDate")));
        if (dates.isEmpty() || dates.getFirst().isBefore(today)) {
            return;
        }
        LocalDate next = dates.getFirst();
        JsonNode estimateFlag = calendar.path("isEarningsDateEstimate");
        Boolean confirmed = estimateFlag.isBoolean() ? !estimateFlag.booleanValue() : (dates.size() > 1 ? false : null);

        int upcoming = -1;
        for (int i = 0; i < reports.size(); i++) {
            LocalDate date = reports.get(i).date();
            if (date != null && !date.isBefore(today)
                    && (upcoming < 0 || date.isBefore(reports.get(upcoming).date()))) {
                upcoming = i;
            }
        }
        Double eps = Money.toMajor(epsEstimate, rawCurrency);
        Double revenue = Money.toMajor(revenueEstimate, rawCurrency);
        if (upcoming < 0) {
            reports.add(new EarningsReport(symbol, next, ReportTime.UNKNOWN, periodEnd, null, null,
                    Money.majorCurrency(rawCurrency), eps, null, revenue, null, confirmed));
            return;
        }
        EarningsReport r = reports.get(upcoming);
        reports.set(upcoming, new EarningsReport(symbol, r.date(), r.time(), firstNonNull(r.periodEnd(), periodEnd),
                r.fiscalQuarter(), r.fiscalYear(), r.currency(), firstNonNull(r.epsEstimate(), eps), r.epsActual(),
                firstNonNull(r.revenueEstimate(), revenue), r.revenueActual(),
                r.date().equals(next) ? confirmed : r.dateConfirmed()));
    }

    private static void applyRevenueActuals(List<EarningsReport> reports, JsonNode summary, String rawCurrency,
            LocalDate today) {
        for (JsonNode quarter : summary.path("earnings").path("financialsChart").path("quarterly")) {
            LocalDate periodEnd = quarterEnd(Json.text(quarter.path("date")));
            Double revenue = Money.toMajor(Json.positive(Json.raw(quarter.path("revenue"))), rawCurrency);
            int i = periodEnd == null || revenue == null ? -1 : reportFor(reports, periodEnd, today);
            if (i >= 0) {
                EarningsReport r = reports.get(i);
                reports.set(i, new EarningsReport(r.symbol(), r.date(), r.time(), periodEnd, r.fiscalQuarter(),
                        r.fiscalYear(), r.currency(), r.epsEstimate(), r.epsActual(), r.revenueEstimate(),
                        firstNonNull(r.revenueActual(), revenue), r.dateConfirmed()));
            }
        }
    }

    private static void applyEarningsHistory(String symbol, List<EarningsReport> reports, JsonNode summary,
            String rawCurrency, LocalDate today) {
        for (JsonNode row : summary.path("earningsHistory").path("history")) {
            LocalDate periodEnd = dateOf(row.path("quarter"));
            if (periodEnd == null) {
                continue;
            }
            String rowCurrency = Objects.requireNonNullElse(Json.text(row.path("currency")), rawCurrency);
            Double estimate = Money.toMajor(Json.raw(row.path("epsEstimate")), rowCurrency);
            Double actual = Money.toMajor(Json.raw(row.path("epsActual")), rowCurrency);
            int i = reportFor(reports, periodEnd, today);
            if (i >= 0) {
                EarningsReport r = reports.get(i);
                reports.set(i, new EarningsReport(r.symbol(), r.date(), r.time(), periodEnd, r.fiscalQuarter(),
                        r.fiscalYear(), r.currency(), firstNonNull(r.epsEstimate(), estimate),
                        firstNonNull(r.epsActual(), actual), r.revenueEstimate(), r.revenueActual(),
                        r.dateConfirmed()));
            } else if (reports.stream().noneMatch(r -> periodEnd.equals(r.periodEnd()))) {
                reports.add(new EarningsReport(symbol, null, ReportTime.UNKNOWN, periodEnd, null, null,
                        Money.majorCurrency(rowCurrency), estimate, actual, null, null, null));
            }
        }
    }

    /** The first past report dated within the reporting lag after {@code periodEnd}, not yet tied to another quarter. */
    private static int reportFor(List<EarningsReport> reports, LocalDate periodEnd, LocalDate today) {
        int best = -1;
        for (int i = 0; i < reports.size(); i++) {
            EarningsReport r = reports.get(i);
            if (r.date() == null || !r.date().isAfter(periodEnd) || r.date().isAfter(today)
                    || r.date().isAfter(periodEnd.plusDays(MAX_REPORT_LAG_DAYS))
                    || (r.periodEnd() != null && !r.periodEnd().equals(periodEnd))) {
                continue;
            }
            if (best < 0 || r.date().isBefore(reports.get(best).date())) {
                best = i;
            }
        }
        return best;
    }

    private static JsonNode trend(JsonNode summary, String period) {
        for (JsonNode t : summary.path("earningsTrend").path("trend")) {
            if (period.equals(Json.text(t.path("period")))) {
                return t;
            }
        }
        return summary.path("earningsTrend").path("missing");
    }

    private static JsonNode cell(JsonNode row, List<String> columns, String column) {
        int index = columns.indexOf(column);
        return index < 0 ? row.path(-1) : row.path(index);
    }

    /** "3Q2025" → 2025-09-30 (calendar quarter labels). */
    static LocalDate quarterEnd(String label) {
        Matcher matcher = QUARTER_LABEL.matcher(label == null ? "" : label);
        if (!matcher.matches()) {
            return null;
        }
        return YearMonth.of(Integer.parseInt(matcher.group(2)), Integer.parseInt(matcher.group(1)) * 3).atEndOfMonth();
    }

    /** A Yahoo date: {@code {"raw": epochSeconds, "fmt": "YYYY-MM-DD"}}, a plain epoch, or an ISO date string. */
    private static LocalDate dateOf(JsonNode node) {
        LocalDate formatted = date(Json.text(node.path("fmt")));
        if (formatted != null) {
            return formatted;
        }
        Double epoch = Json.raw(node);
        return epoch == null ? date(Json.text(node)) : LocalDate.ofInstant(Instant.ofEpochSecond(epoch.longValue()), ZoneOffset.UTC);
    }

    private static LocalDate date(String value) {
        return value != null && value.matches("\\d{4}-\\d{2}-\\d{2}.*") ? LocalDate.parse(value.substring(0, 10)) : null;
    }

    private static <T> T firstNonNull(T a, T b) {
        return a != null ? a : b;
    }
}
