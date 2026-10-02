package com.earningstracker.web;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;

import com.earningstracker.market.Importance;
import com.earningstracker.service.CalendarService;
import com.earningstracker.service.MarketEventService;
import com.earningstracker.service.MarketEventService.EventRegion;
import com.earningstracker.web.dto.Dtos;
import com.earningstracker.web.error.ApiException;
import com.earningstracker.web.error.ErrorCode;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class MarketEventsController {

    private final MarketEventService marketEvents;

    public MarketEventsController(MarketEventService marketEvents) {
        this.marketEvents = marketEvents;
    }

    /** Every date from {@code from} to {@code to} (inclusive, at most 42 days). */
    @GetMapping("/market-events")
    public Dtos.MarketEvents marketEvents(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "LOW") Importance minImportance,
            @RequestParam(defaultValue = "ALL") EventRegion region,
            @RequestParam(defaultValue = "true") boolean includeEarnings) {
        if (to.isBefore(from)) {
            throw new ApiException(ErrorCode.BAD_REQUEST, "to must not be before from");
        }
        if (ChronoUnit.DAYS.between(from, to) + 1 > CalendarService.MAX_DAYS) {
            throw new ApiException(ErrorCode.BAD_REQUEST, "the range can span at most " + CalendarService.MAX_DAYS
                    + " days");
        }
        return marketEvents.events(from, to, minImportance, region, includeEarnings);
    }
}
