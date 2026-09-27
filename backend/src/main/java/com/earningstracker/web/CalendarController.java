package com.earningstracker.web;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;

import com.earningstracker.security.AuthenticatedUser;
import com.earningstracker.service.CalendarService;
import com.earningstracker.service.CalendarService.RegionFilter;
import com.earningstracker.service.FollowedEarningsService;
import com.earningstracker.web.dto.Dtos;
import com.earningstracker.web.error.ApiException;
import com.earningstracker.web.error.ErrorCode;
import jakarta.validation.constraints.PositiveOrZero;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class CalendarController {

    private final CalendarService calendar;
    private final FollowedEarningsService followed;

    public CalendarController(CalendarService calendar, FollowedEarningsService followed) {
        this.calendar = calendar;
        this.followed = followed;
    }

    /** Every date from {@code from} to {@code to} (inclusive, at most 42 days). */
    @GetMapping("/calendar")
    public Dtos.Calendar calendar(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "0") @PositiveOrZero double minMarketCapUsd,
            @RequestParam(defaultValue = "ALL") RegionFilter region,
            @RequestParam(defaultValue = "false") boolean followedOnly,
            @AuthenticationPrincipal AuthenticatedUser user) {
        if (to.isBefore(from)) {
            throw new ApiException(ErrorCode.BAD_REQUEST, "to must not be before from");
        }
        if (ChronoUnit.DAYS.between(from, to) + 1 > CalendarService.MAX_DAYS) {
            throw new ApiException(ErrorCode.BAD_REQUEST, "the range can span at most " + CalendarService.MAX_DAYS
                    + " days");
        }
        return calendar.calendar(from, to, minMarketCapUsd, region, followedOnly, user.uid());
    }

    @GetMapping("/followed/earnings")
    public Dtos.FollowedEarnings followedEarnings(@AuthenticationPrincipal AuthenticatedUser user) {
        return followed.followed(user.uid());
    }
}
