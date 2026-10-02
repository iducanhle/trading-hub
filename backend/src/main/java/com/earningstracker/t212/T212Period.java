package com.earningstracker.t212;

import java.time.DateTimeException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

import com.earningstracker.web.error.ApiException;
import com.earningstracker.web.error.ErrorCode;

/**
 * A period of whole days in a time zone: {@code from} and {@code to} inclusive, either may be open. Both open means
 * all time.
 *
 * @param start first instant inside, or null
 * @param end   first instant after, or null
 */
public record T212Period(LocalDate from, LocalDate to, ZoneId zone, Instant start, Instant end) {

    public static final T212Period ALL_TIME = new T212Period(null, null, ZoneId.of("UTC"), null, null);

    /** @throws ApiException 400 for an unknown zone or {@code from} after {@code to} */
    public static T212Period of(LocalDate from, LocalDate to, String tz) {
        ZoneId zone;
        try {
            zone = tz == null || tz.isBlank() ? ZoneId.of("UTC") : ZoneId.of(tz.strip());
        } catch (DateTimeException e) {
            throw new ApiException(ErrorCode.BAD_REQUEST, "tz must be an IANA time zone such as Europe/Prague");
        }
        if (from != null && to != null && from.isAfter(to)) {
            throw new ApiException(ErrorCode.BAD_REQUEST, "from must not be after to");
        }
        return new T212Period(from, to, zone, from == null ? null : from.atStartOfDay(zone).toInstant(),
                to == null ? null : to.plusDays(1).atStartOfDay(zone).toInstant());
    }

    public boolean allTime() {
        return from == null && to == null;
    }

    public boolean contains(Instant instant) {
        return (start == null || !instant.isBefore(start)) && (end == null || instant.isBefore(end));
    }

    public String tz() {
        return zone.getId();
    }
}
