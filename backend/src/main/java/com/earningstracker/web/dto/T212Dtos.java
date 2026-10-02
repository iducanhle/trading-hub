package com.earningstracker.web.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import com.earningstracker.provider.t212.T212Environment;

/** Trading 212 response and request bodies, named as in docs/CONTRACT.md. */
public final class T212Dtos {

    private T212Dtos() {
    }

    public record Error(String code, String message) {
    }

    public record Status(boolean connected, T212Environment environment, String keyHint, String accountCurrency,
            Boolean credentialsValid, Instant connectedAt, String syncState, Instant syncStartedAt,
            Instant lastSyncAt, Error lastError, String serverIpHint) {
    }

    public record InstrumentRef(String t212Ticker, String symbol, String name, String logoUrl, double totalPnl) {
    }

    public record Summary(LocalDate from, LocalDate to, String tz, String accountCurrency, Double totalValue,
            Double cash, Double invested, Double currentValue, Double unrealizedPnl, double realizedPnl,
            double dividends, double fees, double interest, double deposits, double withdrawals, double netDeposits,
            int tradeCount, double totalPnl, boolean includesUnrealized, Double totalPnlPct, InstrumentRef best,
            InstrumentRef worst, String syncState, Instant lastSyncAt, Instant asOf, boolean stale) {
    }

    public record Amounts(double quantity, double value) {
    }

    public record Instrument(String t212Ticker, String symbol, String name, String isin, String logoUrl,
            String instrumentCurrency, String status, double quantity, Double averageCost, Double currentPrice,
            Double value, Double costBasis, Amounts bought, Amounts sold, double realizedPnl, double dividends,
            double fees, Double unrealizedPnl, double totalPnl, Double totalPnlPct, int tradeCount,
            Instant firstTradeAt, Instant lastTradeAt) {
    }

    public record InstrumentList(LocalDate from, LocalDate to, String tz, String accountCurrency,
            List<Instrument> items, Instant asOf, boolean stale) {
    }

    public record Trade(String id, Instant executedAt, String t212Ticker, String symbol, String name, String side,
            String kind, double quantity, Double price, String priceCurrency, double value, double fees, double taxes,
            Double fxRate, Double realizedPnl, String orderType) {
    }

    /** A trade in the instrument detail: {@code T212Trade & { positionAfter }}. */
    public record DetailTrade(String id, Instant executedAt, String t212Ticker, String symbol, String name,
            String side, String kind, double quantity, Double price, String priceCurrency, double value, double fees,
            double taxes, Double fxRate, Double realizedPnl, String orderType, double positionAfter) {
    }

    public record TradePage(List<Trade> items, String nextCursor, String accountCurrency, Instant asOf,
            boolean stale) {
    }

    public record Dividend(String id, Instant paidAt, String t212Ticker, String symbol, String name, double quantity,
            double amount, Double grossPerShare, String grossPerShareCurrency, String type) {
    }

    public record InstrumentDetail(String accountCurrency, Instrument instrument, List<DetailTrade> trades,
            List<Dividend> dividends, Instant asOf, boolean stale) {
    }

    public record DividendList(LocalDate from, LocalDate to, String tz, String accountCurrency, double total,
            List<Dividend> items, Instant asOf, boolean stale) {
    }

    public record Transaction(String id, Instant at, String type, double amount, String currency) {
    }

    public record TransactionTotals(double deposits, double withdrawals, double fees, double interest) {
    }

    public record TransactionList(LocalDate from, LocalDate to, String tz, String accountCurrency,
            TransactionTotals totals, List<Transaction> items, Instant asOf, boolean stale) {
    }

    /** {@code PUT /api/t212/credentials}. {@link #toString()} hides the key and secret. */
    public record CredentialsRequest(String apiKey, String apiSecret, T212Environment environment) {

        @Override
        public String toString() {
            return "CredentialsRequest[environment=" + environment + "]";
        }
    }
}
