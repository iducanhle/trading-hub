package com.earningstracker.provider;

import java.util.Collection;
import java.util.Set;

public interface SymbolValidator extends MarketDataProvider {

    /** The subset of {@code symbols} the provider knows; unknown symbols are left out. */
    Set<String> existingSymbols(Collection<String> symbols);
}
