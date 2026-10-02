package com.earningstracker.service;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;

import com.earningstracker.market.EventCategory;
import com.earningstracker.market.Importance;
import com.earningstracker.web.dto.Dtos;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

/**
 * Dates that no free feed provides but the institutions publish a year or two ahead: ECB, Bank of England and Bank
 * of Japan decisions, US elections ({@code market-events.json}). Update the file when the banks publish new
 * calendars.
 */
@Component
public class CuratedMarketEvents {

    private record Row(String id, LocalDate date, LocalTime time, String zone, String country, EventCategory category,
            Importance importance, String label, String title, String note, String sourceUrl) {
    }

    private static final Logger log = LoggerFactory.getLogger(CuratedMarketEvents.class);
    private static final String RESOURCE = "market-events.json";

    private final List<Dtos.MarketEvent> events;

    public CuratedMarketEvents(JsonMapper jsonMapper) {
        try (InputStream in = new ClassPathResource(RESOURCE).getInputStream()) {
            List<Row> rows = jsonMapper.readValue(in, jsonMapper.getTypeFactory().constructCollectionType(List.class,
                    Row.class));
            this.events = rows.stream().map(CuratedMarketEvents::event).toList();
        } catch (IOException e) {
            throw new UncheckedIOException("Could not read " + RESOURCE, e);
        }
        log.info("Curated market events: {} loaded from {}", events.size(), RESOURCE);
    }

    public List<Dtos.MarketEvent> events() {
        return events;
    }

    private static Dtos.MarketEvent event(Row row) {
        var startsAt = row.time() == null ? null
                : row.date().atTime(row.time()).atZone(ZoneId.of(row.zone())).toInstant();
        return new Dtos.MarketEvent(row.id(), row.date(), startsAt, startsAt == null, row.title(), row.label(),
                row.category(), row.country(), row.importance(), row.note(), null, row.sourceUrl(), null, null, null);
    }
}
