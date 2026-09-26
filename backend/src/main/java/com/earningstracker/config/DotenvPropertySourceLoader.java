package com.earningstracker.config;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.boot.env.OriginTrackedMapPropertySource;
import org.springframework.boot.env.PropertySourceLoader;
import org.springframework.core.env.PropertySource;
import org.springframework.core.io.Resource;

/**
 * Loads a {@code .env} file, so the local profile can use {@code spring.config.import=optional:file:.env[.env]}.
 * <p>
 * Follows Docker Compose's env-file rules, because prod reads the same file through Compose: {@code KEY=VALUE}
 * lines, full-line {@code #} comments, an optional {@code export } prefix, matching quotes around the value, and
 * inline comments after unquoted values when the {@code #} is preceded by whitespace. Backslashes are kept as-is,
 * so Windows paths work (the built-in {@code [.properties]} import would treat them as escapes).
 */
public class DotenvPropertySourceLoader implements PropertySourceLoader {

    private static final Pattern KEY = Pattern.compile("[A-Za-z_][A-Za-z0-9_.]*");
    private static final Pattern INLINE_COMMENT = Pattern.compile("\\s#");

    @Override
    public String[] getFileExtensions() {
        return new String[] {"env"};
    }

    @Override
    public List<PropertySource<?>> load(String name, Resource resource) throws IOException {
        Map<String, Object> properties = new LinkedHashMap<>();
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(resource.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                parse(line, properties);
            }
        }
        return properties.isEmpty() ? List.of() : List.of(new OriginTrackedMapPropertySource(name, properties));
    }

    static void parse(String line, Map<String, Object> into) {
        String trimmed = line.replace("﻿", "").strip();
        if (trimmed.isEmpty() || trimmed.startsWith("#")) {
            return;
        }
        if (trimmed.startsWith("export ")) {
            trimmed = trimmed.substring("export ".length()).strip();
        }
        int eq = trimmed.indexOf('=');
        if (eq <= 0) {
            return;
        }
        String key = trimmed.substring(0, eq).strip();
        if (KEY.matcher(key).matches()) {
            into.put(key, value(trimmed.substring(eq + 1)));
        }
    }

    private static String value(String rest) {
        String raw = rest.strip();
        if (!raw.isEmpty() && (raw.charAt(0) == '"' || raw.charAt(0) == '\'')) {
            int end = raw.indexOf(raw.charAt(0), 1);
            if (end > 0) {
                return raw.substring(1, end);
            }
        }
        Matcher comment = INLINE_COMMENT.matcher(rest);
        return (comment.find() ? rest.substring(0, comment.start()) : rest).strip();
    }
}
