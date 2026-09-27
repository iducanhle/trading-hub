package com.earningstracker.universe;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Collection;
import java.util.List;
import java.util.Set;
import java.util.function.Function;

import com.earningstracker.market.Region;
import com.earningstracker.market.Symbols;
import com.earningstracker.provider.ProviderException;
import com.earningstracker.provider.ProviderException.Kind;
import com.earningstracker.provider.SymbolValidator;
import com.earningstracker.universe.EuUniverse.Member;
import org.junit.jupiter.api.Test;

class EuUniverseTest {

    private static SymbolValidator validator(Function<Collection<String>, Set<String>> answer) {
        return new SymbolValidator() {
            @Override
            public String id() {
                return "fake";
            }

            @Override
            public Set<String> existingSymbols(Collection<String> symbols) {
                return answer.apply(symbols);
            }
        };
    }

    private static EuUniverse universe(SymbolValidator validator) {
        return new EuUniverse(validator, new UniverseProperties("eu-universe.csv", false));
    }

    @Test
    void parsesCommentsHeaderAndQuotedNamesAndSkipsBadLines() {
        List<Member> members = EuUniverse.parse(List.of(
                "# comment", "symbol,name", "", "SAP.DE,SAP", "CEZ.PR,\"CEZ, a. s.\"", "AAPL,Apple (US: not EU)",
                "SAP.F,Frankfurt floor", "SAP.DE,duplicate", "sie.de,Siemens"));

        assertThat(members).containsExactly(new Member("SAP.DE", "SAP"), new Member("CEZ.PR", "CEZ, a. s."),
                new Member("SIE.DE", "Siemens"));
    }

    @Test
    void theShippedUniverseHasOnlyValidEuropeanSymbols() {
        EuUniverse universe = universe(validator(symbols -> Set.copyOf(symbols)));

        assertThat(universe.members()).hasSizeGreaterThan(300);
        assertThat(universe.members()).allSatisfy(member -> {
            assertThat(Symbols.isValid(member.symbol())).isTrue();
            assertThat(Symbols.region(member.symbol())).isEqualTo(Region.EU);
        });
        assertThat(universe.find("SAP.DE")).isPresent();
        assertThat(universe.find("CEZ.PR")).map(Member::name).contains("CEZ, a. s.");
    }

    @Test
    void validationExcludesSymbolsYahooDoesNotKnow() {
        EuUniverse universe = universe(validator(symbols -> symbols.stream()
                .filter(s -> !s.equals("SAP.DE")).collect(java.util.stream.Collectors.toSet())));

        assertThat(universe.validate()).containsExactly("SAP.DE");
        assertThat(universe.invalidSymbols()).containsExactly("SAP.DE");
        assertThat(universe.validMembers()).extracting(Member::symbol).doesNotContain("SAP.DE")
                .hasSize(universe.members().size() - 1);
    }

    @Test
    void aFailedValidationKeepsEverySymbol() {
        EuUniverse universe = universe(validator(symbols -> {
            throw new ProviderException("fake", Kind.UNAVAILABLE, "down");
        }));

        assertThat(universe.validate()).isEmpty();
        assertThat(universe.validMembers()).hasSameSizeAs(universe.members());
    }
}
