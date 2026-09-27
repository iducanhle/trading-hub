package com.earningstracker.domain;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.function.Function;

import com.earningstracker.market.EarningsReport;
import com.earningstracker.market.ReportTime;

/**
 * Merges reports from several providers into one record per quarter (§5): quarters are the same when their fiscal
 * (year, quarter) match or, lacking fiscal data, their report dates are within {@value #DATE_TOLERANCE_DAYS} days.
 * Each field takes the first non-null value in source priority order. Rows without a report date attach to the
 * first report within {@value #MAX_REPORT_LAG_DAYS} days after their fiscal period end, or are dropped: a quarter
 * is never shown without a date.
 */
public final class EarningsMerger {

    /** A report tagged with the provider it came from; the stored form in {@code earnings/{symbol}}. */
    public record SourcedReport(String source, EarningsReport report) {
    }

    static final int DATE_TOLERANCE_DAYS = 5;
    static final int MAX_REPORT_LAG_DAYS = 100;

    private record Candidate(SourcedReport sourced, int rank) {
        EarningsReport r() {
            return sourced.report();
        }
    }

    private EarningsMerger() {
    }

    /**
     * @param reports  rows from any providers, in any order
     * @param priority provider ids, most trusted first (unknown sources rank last)
     * @return one report per quarter, newest first
     */
    public static List<SourcedReport> merge(List<SourcedReport> reports, List<String> priority) {
        List<Candidate> candidates = new ArrayList<>();
        reports.forEach(s -> candidates.add(new Candidate(s, rank(priority, s.source()))));
        candidates.sort(Comparator.comparingInt(Candidate::rank));

        List<List<Candidate>> clusters = new ArrayList<>();
        candidates.stream().filter(c -> c.r().date() != null).forEach(candidate -> clusters.stream()
                .filter(cluster -> cluster.stream().anyMatch(m -> sameQuarter(m.r(), candidate.r())))
                .findFirst()
                .ifPresentOrElse(cluster -> cluster.add(candidate), () -> clusters.add(new ArrayList<>(List.of(candidate)))));
        candidates.stream().filter(c -> c.r().date() == null).forEach(candidate -> attachDateless(clusters, candidate));

        return clusters.stream()
                .map(EarningsMerger::combine)
                .sorted(Comparator.comparing((SourcedReport s) -> s.report().date()).reversed())
                .toList();
    }

    /**
     * Whether two rows describe the same quarter: fiscal (year, quarter) decides when both have it; otherwise report
     * dates within the tolerance, or equal fiscal period ends.
     */
    public static boolean sameQuarter(EarningsReport a, EarningsReport b) {
        if (hasFiscal(a) && hasFiscal(b)) {
            return a.fiscalYear().equals(b.fiscalYear()) && a.fiscalQuarter().equals(b.fiscalQuarter());
        }
        if (a.date() != null && b.date() != null) {
            return Math.abs(ChronoUnit.DAYS.between(a.date(), b.date())) <= DATE_TOLERANCE_DAYS;
        }
        return a.periodEnd() != null && a.periodEnd().equals(b.periodEnd());
    }

    private static int rank(List<String> priority, String source) {
        int index = priority.indexOf(source);
        return index < 0 ? priority.size() : index;
    }

    /** A row known only by fiscal period: same fiscal quarter, same period end, or the first report after it. */
    private static void attachDateless(List<List<Candidate>> clusters, Candidate candidate) {
        EarningsReport report = candidate.r();
        List<Candidate> target = null;
        for (List<Candidate> cluster : clusters) {
            boolean fiscalMatch = hasFiscal(report) && cluster.stream().anyMatch(m -> hasFiscal(m.r())
                    && report.fiscalYear().equals(m.r().fiscalYear()) && report.fiscalQuarter().equals(m.r().fiscalQuarter()));
            boolean periodMatch = report.periodEnd() != null
                    && cluster.stream().anyMatch(m -> report.periodEnd().equals(m.r().periodEnd()));
            if (fiscalMatch || periodMatch) {
                target = cluster;
                break;
            }
        }
        if (target == null && report.periodEnd() != null) {
            LocalDate periodEnd = report.periodEnd();
            target = clusters.stream()
                    .filter(cluster -> cluster.stream().noneMatch(m -> m.r().periodEnd() != null
                            && !m.r().periodEnd().equals(periodEnd)))
                    .filter(cluster -> cluster.stream().noneMatch(m -> hasFiscal(m.r()) && hasFiscal(report)))
                    .filter(cluster -> {
                        LocalDate date = firstDate(cluster);
                        return date.isAfter(periodEnd) && !date.isAfter(periodEnd.plusDays(MAX_REPORT_LAG_DAYS));
                    })
                    .min(Comparator.comparing(EarningsMerger::firstDate))
                    .orElse(null);
        }
        if (target != null) {
            target.add(candidate);
            target.sort(Comparator.comparingInt(Candidate::rank));
        }
    }

    private static SourcedReport combine(List<Candidate> cluster) {
        EarningsReport confirmed = cluster.stream().map(Candidate::r)
                .filter(r -> r.date() != null && Boolean.TRUE.equals(r.dateConfirmed())).findFirst().orElse(null);
        LocalDate date = confirmed != null ? confirmed.date() : firstDate(cluster);
        ReportTime time = cluster.stream().map(Candidate::r)
                .filter(r -> date.equals(r.date()) && r.time() != null && r.time() != ReportTime.UNKNOWN)
                .map(EarningsReport::time).findFirst().orElse(ReportTime.UNKNOWN);
        EarningsReport fiscal = cluster.stream().map(Candidate::r).filter(EarningsMerger::hasFiscal).findFirst()
                .orElse(null);
        Boolean dateConfirmed = confirmed != null ? Boolean.TRUE : first(cluster, EarningsReport::dateConfirmed);
        EarningsReport head = cluster.getFirst().r();
        EarningsReport merged = new EarningsReport(head.symbol(), date, time, first(cluster, EarningsReport::periodEnd),
                fiscal == null ? null : fiscal.fiscalQuarter(), fiscal == null ? null : fiscal.fiscalYear(),
                first(cluster, EarningsReport::currency),
                first(cluster, EarningsReport::epsEstimate), first(cluster, EarningsReport::epsActual),
                first(cluster, EarningsReport::revenueEstimate), first(cluster, EarningsReport::revenueActual),
                dateConfirmed);
        return new SourcedReport(cluster.getFirst().sourced().source(), merged);
    }

    private static LocalDate firstDate(List<Candidate> cluster) {
        return cluster.stream().map(c -> c.r().date()).filter(Objects::nonNull).findFirst().orElseThrow();
    }

    private static <T> T first(List<Candidate> cluster, Function<EarningsReport, T> field) {
        return cluster.stream().map(c -> field.apply(c.r())).filter(Objects::nonNull).findFirst().orElse(null);
    }

    private static boolean hasFiscal(EarningsReport report) {
        return report.fiscalYear() != null && report.fiscalQuarter() != null;
    }
}
