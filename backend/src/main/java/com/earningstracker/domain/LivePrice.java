package com.earningstracker.domain;

import java.time.LocalDate;

/**
 * The live quote as the calculators see it: its trading date in the exchange's local time, so it can be compared
 * with daily bars. {@code volume} may be null (not every quote source has it).
 */
public record LivePrice(LocalDate date, double price, Long volume) {
}
