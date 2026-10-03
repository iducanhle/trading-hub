package com.earningstracker.web;

import java.time.LocalDate;
import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;

import com.earningstracker.security.AuthenticatedUser;
import com.earningstracker.t212.T212ConnectionService;
import com.earningstracker.t212.T212LiveService;
import com.earningstracker.t212.T212Period;
import com.earningstracker.t212.T212PieService;
import com.earningstracker.t212.T212PortfolioService;
import com.earningstracker.t212.T212PortfolioService.SideFilter;
import com.earningstracker.t212.T212PortfolioService.StatusFilter;
import com.earningstracker.t212.T212SyncService;
import com.earningstracker.web.dto.T212Dtos;
import com.earningstracker.web.error.ApiException;
import com.earningstracker.web.error.ErrorCode;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Trading 212 portfolio (docs/CONTRACT.md, "Trading 212"); every call acts on the caller's own account. */
@RestController
@RequestMapping("/api/t212")
public class T212Controller {

    private static final int MAX_TICKER_LENGTH = 40;
    private static final int MAX_TICKERS = 50;

    private final T212ConnectionService connection;
    private final T212SyncService sync;
    private final T212LiveService live;
    private final T212PieService pies;
    private final T212PortfolioService portfolio;

    public T212Controller(T212ConnectionService connection, T212SyncService sync, T212LiveService live,
            T212PieService pies, T212PortfolioService portfolio) {
        this.connection = connection;
        this.sync = sync;
        this.live = live;
        this.pies = pies;
        this.portfolio = portfolio;
    }

    @GetMapping("/status")
    public T212Dtos.Status status(@AuthenticationPrincipal AuthenticatedUser user) {
        return connection.status(user.uid());
    }

    @PutMapping("/credentials")
    public T212Dtos.Status saveCredentials(@AuthenticationPrincipal AuthenticatedUser user,
            @RequestBody T212Dtos.CredentialsRequest request) {
        connection.connect(user.uid(), request);
        live.forget(user.uid());
        pies.forget(user.uid());
        return sync.start(user.uid());
    }

    @DeleteMapping("/credentials")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteCredentials(@AuthenticationPrincipal AuthenticatedUser user) {
        connection.disconnect(user.uid());
        live.forget(user.uid());
        pies.forget(user.uid());
    }

    /** Starts an incremental sync; if one is running, answers with its status. */
    @PostMapping("/sync")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public T212Dtos.Status sync(@AuthenticationPrincipal AuthenticatedUser user) {
        return sync.start(user.uid());
    }

    @GetMapping("/summary")
    public T212Dtos.Summary summary(@AuthenticationPrincipal AuthenticatedUser user,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String tz) {
        return portfolio.summary(user.uid(), T212Period.of(from, to, tz));
    }

    @GetMapping("/instruments")
    public T212Dtos.InstrumentList instruments(@AuthenticationPrincipal AuthenticatedUser user,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String tz,
            @RequestParam(defaultValue = "ALL") StatusFilter status) {
        return portfolio.instruments(user.uid(), T212Period.of(from, to, tz), status);
    }

    @GetMapping("/holdings")
    public T212Dtos.HoldingList holdings(@AuthenticationPrincipal AuthenticatedUser user) {
        return portfolio.holdings(user.uid());
    }

    @GetMapping("/instruments/{t212Ticker}")
    public T212Dtos.InstrumentDetail instrument(@AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable String t212Ticker) {
        return portfolio.instrument(user.uid(), ticker(t212Ticker));
    }

    @GetMapping("/trades")
    public T212Dtos.TradePage trades(@AuthenticationPrincipal AuthenticatedUser user,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String tz,
            @RequestParam(required = false) SideFilter side,
            @RequestParam(required = false) String ticker,
            @RequestParam(required = false) String cursor,
            @RequestParam(defaultValue = "50") int limit) {
        if (limit < 1 || limit > 100) {
            throw new ApiException(ErrorCode.BAD_REQUEST, "limit must be 1–100");
        }
        return portfolio.trades(user.uid(), T212Period.of(from, to, tz), side, tickers(ticker), cursor, limit);
    }

    @GetMapping("/dividends")
    public T212Dtos.DividendList dividends(@AuthenticationPrincipal AuthenticatedUser user,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String tz,
            @RequestParam(required = false) String ticker) {
        return portfolio.dividends(user.uid(), T212Period.of(from, to, tz), optionalTicker(ticker));
    }

    @GetMapping("/transactions")
    public T212Dtos.TransactionList transactions(@AuthenticationPrincipal AuthenticatedUser user,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String tz,
            @RequestParam(required = false) String type) {
        return portfolio.transactions(user.uid(), T212Period.of(from, to, tz),
                type == null || type.isBlank() ? null : type.strip().toUpperCase());
    }

    /** A comma-separated list of tickers; empty means all. */
    private static Set<String> tickers(String tickers) {
        if (tickers == null || tickers.isBlank()) {
            return Set.of();
        }
        Set<String> result = Arrays.stream(tickers.split(",")).filter(t -> !t.isBlank())
                .map(T212Controller::ticker).collect(Collectors.toSet());
        if (result.size() > MAX_TICKERS) {
            throw new ApiException(ErrorCode.BAD_REQUEST, "at most " + MAX_TICKERS + " tickers");
        }
        return result;
    }

    private static String optionalTicker(String ticker) {
        return ticker == null || ticker.isBlank() ? null : ticker(ticker);
    }

    private static String ticker(String ticker) {
        String trimmed = ticker.strip();
        if (trimmed.isEmpty() || trimmed.length() > MAX_TICKER_LENGTH || !trimmed.matches("[A-Za-z0-9_.-]+")) {
            throw new ApiException(ErrorCode.BAD_REQUEST, "invalid Trading 212 ticker");
        }
        return trimmed;
    }
}
