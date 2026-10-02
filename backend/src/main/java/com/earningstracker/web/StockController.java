package com.earningstracker.web;

import java.time.LocalDate;
import java.util.List;

import com.earningstracker.domain.HistoryCalculator;
import com.earningstracker.market.Symbols;
import com.earningstracker.service.PriceRange;
import com.earningstracker.service.SearchService;
import com.earningstracker.service.StockService;
import com.earningstracker.web.dto.Dtos;
import com.earningstracker.web.error.ApiException;
import com.earningstracker.web.error.ErrorCode;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class StockController {

    static final int MAX_QUERY_LENGTH = 64;

    private final SearchService search;
    private final StockService stocks;

    public StockController(SearchService search, StockService stocks) {
        this.search = search;
        this.stocks = stocks;
    }

    @GetMapping("/search")
    public List<Dtos.SearchResult> search(@RequestParam String q,
            @RequestParam(defaultValue = "10") @Min(1) @Max(20) int limit) {
        String query = q.strip();
        if (query.isEmpty() || query.length() > MAX_QUERY_LENGTH) {
            throw new ApiException(ErrorCode.BAD_REQUEST, "q must be 1 to " + MAX_QUERY_LENGTH + " characters");
        }
        return search.results(query, limit);
    }

    @GetMapping("/stocks/{symbol}")
    public Dtos.StockOverview overview(@PathVariable String symbol) {
        return stocks.overview(symbol(symbol));
    }

    @GetMapping("/stocks/{symbol}/prices")
    public Dtos.Prices prices(@PathVariable String symbol, @RequestParam(defaultValue = "1Y") String range) {
        PriceRange priceRange = PriceRange.parse(range)
                .orElseThrow(() -> new ApiException(ErrorCode.BAD_REQUEST, "range must be 1D, 1W, 1M, 2M, 3M, 6M, 1Y, 3Y or 5Y"));
        return stocks.prices(symbol(symbol), priceRange);
    }

    @GetMapping("/stocks/{symbol}/history")
    public Dtos.History history(@PathVariable String symbol,
            @RequestParam(defaultValue = "DAILY") HistoryCalculator.Period period,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate before,
            @RequestParam(defaultValue = "30") @Min(1) @Max(100) int limit) {
        return stocks.history(symbol(symbol), period, before, limit);
    }

    @GetMapping("/stocks/{symbol}/earnings")
    public Dtos.Earnings earnings(@PathVariable String symbol) {
        return stocks.earnings(symbol(symbol));
    }

    @GetMapping("/stocks/{symbol}/recommendations")
    public List<Dtos.RecommendationPeriod> recommendations(@PathVariable String symbol) {
        return stocks.recommendations(symbol(symbol));
    }

    @GetMapping("/stocks/{symbol}/news")
    public List<Dtos.NewsItem> news(@PathVariable String symbol,
            @RequestParam(defaultValue = "10") @Min(1) @Max(50) int limit) {
        return stocks.news(symbol(symbol), limit);
    }

    @GetMapping("/stocks/{symbol}/peers")
    public List<Dtos.SearchResult> peers(@PathVariable String symbol) {
        return stocks.peers(symbol(symbol));
    }

    /** Canonical symbol (upper case accepted in any case); 400 for formats or exchanges we do not support. */
    static String symbol(String raw) {
        return Symbols.normalize(raw).orElseThrow(() -> new ApiException(ErrorCode.BAD_REQUEST,
                "Invalid symbol '" + raw + "': use a US ticker (AAPL, BRK-B) or a supported European one (SAP.DE)"));
    }
}
