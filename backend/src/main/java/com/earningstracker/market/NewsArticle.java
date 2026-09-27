package com.earningstracker.market;

import java.time.Instant;

public record NewsArticle(String headline, String source, String url, Instant publishedAt, String imageUrl,
        String summary) {
}
