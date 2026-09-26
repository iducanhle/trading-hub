package com.earningstracker.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.core.env.PropertySource;
import org.springframework.core.io.ByteArrayResource;

class DotenvPropertySourceLoaderTest {

    private final DotenvPropertySourceLoader loader = new DotenvPropertySourceLoader();

    private PropertySource<?> load(String content) throws IOException {
        List<PropertySource<?>> sources =
                loader.load("dotenv", new ByteArrayResource(content.getBytes(StandardCharsets.UTF_8)));
        assertThat(sources).hasSize(1);
        return sources.getFirst();
    }

    @Test
    void parsesKeysValuesAndSkipsCommentsAndBlankLines() throws IOException {
        PropertySource<?> source = load("""
                \uFEFFPLAIN=value
                # comment

                export EXPORTED=yes
                EMPTY=
                """);
        assertThat(source.getProperty("PLAIN")).isEqualTo("value");
        assertThat(source.getProperty("EXPORTED")).isEqualTo("yes");
        assertThat(source.getProperty("EMPTY")).isEqualTo("");
    }

    @Test
    void stripsMatchingQuotesAndKeepsTheirContentLiterally() throws IOException {
        PropertySource<?> source = load("""
                DOUBLE="Earnings Tracker"
                SINGLE='a # not a comment'
                QUOTED_WITH_COMMENT="v" # trailing comment
                """);
        assertThat(source.getProperty("DOUBLE")).isEqualTo("Earnings Tracker");
        assertThat(source.getProperty("SINGLE")).isEqualTo("a # not a comment");
        assertThat(source.getProperty("QUOTED_WITH_COMMENT")).isEqualTo("v");
    }

    @Test
    void handlesInlineCommentsLikeDockerCompose() throws IOException {
        PropertySource<?> source = load("""
                FMP_API_KEY=                      # optional
                WITH_COMMENT=abc # comment
                HASH_IN_VALUE=abc#def
                """);
        assertThat(source.getProperty("FMP_API_KEY")).isEqualTo("");
        assertThat(source.getProperty("WITH_COMMENT")).isEqualTo("abc");
        assertThat(source.getProperty("HASH_IN_VALUE")).isEqualTo("abc#def");
    }

    @Test
    void keepsBackslashesSoWindowsPathsWork() throws IOException {
        PropertySource<?> source = load("CREDS=C:\\Users\\me\\secrets\\firebase-sa.json\r\n");
        assertThat(source.getProperty("CREDS")).isEqualTo("C:\\Users\\me\\secrets\\firebase-sa.json");
    }

    @Test
    void ignoresMalformedLines() throws IOException {
        PropertySource<?> source = load("""
                no-equals-sign
                =no-key
                1STARTS_WITH_DIGIT=x
                HAS SPACE=x
                GOOD=ok
                """);
        assertThat(source.getProperty("GOOD")).isEqualTo("ok");
        assertThat(source.getProperty("1STARTS_WITH_DIGIT")).isNull();
        assertThat(source.getProperty("HAS SPACE")).isNull();
    }

    @Test
    void emptyFileYieldsNoPropertySource() throws IOException {
        assertThat(loader.load("dotenv", new ByteArrayResource(new byte[0]))).isEmpty();
    }
}
