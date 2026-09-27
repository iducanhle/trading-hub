package com.earningstracker.market;

/** A search hit on a supported exchange. {@code currency} is the listing's usual currency (pence as GBP). */
public record SymbolMatch(String symbol, String name, Exchange exchange, String currency) {

    public Region region() {
        return exchange.region();
    }
}
