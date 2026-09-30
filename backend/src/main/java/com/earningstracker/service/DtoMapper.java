package com.earningstracker.service;

import com.earningstracker.domain.EarningsMath;
import com.earningstracker.domain.EarningsStatsCalculator;
import com.earningstracker.domain.ReactionCalculator.Reaction;
import com.earningstracker.market.EarningsReport;
import com.earningstracker.market.Logos;
import com.earningstracker.market.Region;
import com.earningstracker.market.SymbolMatch;
import com.earningstracker.market.Symbols;
import com.earningstracker.web.dto.Dtos;

/** Domain objects → contract DTOs. */
final class DtoMapper {

    private DtoMapper() {
    }

    static Dtos.EarningsEvent event(StockProfile profile, EarningsReport report) {
        return event(profile.symbol(), profile.name(), profile.exchange().displayName(), profile.logoUrl(),
                profile.marketCapUsd(), report);
    }

    static Dtos.EarningsEvent event(String symbol, String name, String exchange, String logoUrl, Double marketCapUsd,
            EarningsReport report) {
        Region region = Symbols.region(symbol);
        return new Dtos.EarningsEvent(symbol, name, exchange, region, Logos.orFallback(symbol, logoUrl), report.date(), report.time(),
                report.fiscalQuarter(), report.fiscalYear(), report.currency(), report.epsEstimate(),
                report.epsActual(), report.revenueEstimate(), report.revenueActual(), marketCapUsd);
    }

    static Dtos.EarningsQuarter quarter(EarningsView.Quarter quarter) {
        EarningsReport r = quarter.report();
        Reaction reaction = quarter.reaction();
        return new Dtos.EarningsQuarter(r.date(), r.time(), quarter.timeAssumed(), r.fiscalQuarter(), r.fiscalYear(),
                r.currency(),
                new Dtos.EstimateActual(r.epsEstimate(), r.epsActual(),
                        EarningsMath.surprisePercent(r.epsEstimate(), r.epsActual())),
                new Dtos.EstimateActual(r.revenueEstimate(), r.revenueActual(),
                        EarningsMath.surprisePercent(r.revenueEstimate(), r.revenueActual())),
                quarter.result(),
                reaction == null ? null : new Dtos.EarningsReaction(reaction.preRunUpPercent(), reaction.gapPercent(),
                        reaction.reactionDayPercent(), reaction.driftPercent()));
    }

    static Dtos.EarningsStats stats(EarningsStatsCalculator.Stats stats) {
        return new Dtos.EarningsStats(stats.quartersAnalyzed(), stats.beatRate(),
                stats.streak() == null ? null : new Dtos.Streak(stats.streak().result(), stats.streak().count()),
                stats.avgAbsReactionPercent());
    }

    static Dtos.SearchResult searchResult(SymbolMatch match, String logoUrl) {
        return new Dtos.SearchResult(match.symbol(), match.name(), match.exchange().displayName(), match.region(),
                match.currency(), Logos.orFallback(match.symbol(), logoUrl));
    }
}
