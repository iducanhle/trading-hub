package com.earningstracker.market;

import java.time.LocalDate;

/**
 * One quarterly report as a provider knows it, past or upcoming. Values are in {@code currency} (the reporting
 * currency) and are null when the provider does not have them.
 *
 * @param date          report date in the exchange's local time; null when the provider only knows the fiscal
 *                      period (e.g. Finnhub's last-4 EPS list), in which case {@code periodEnd} is set
 * @param periodEnd     end of the fiscal quarter being reported, when known
 * @param dateConfirmed true when the provider marks the date as confirmed, false when estimated, null if unknown
 */
public record EarningsReport(
        String symbol,
        LocalDate date,
        ReportTime time,
        LocalDate periodEnd,
        Integer fiscalQuarter,
        Integer fiscalYear,
        String currency,
        Double epsEstimate,
        Double epsActual,
        Double revenueEstimate,
        Double revenueActual,
        Boolean dateConfirmed) {
}
