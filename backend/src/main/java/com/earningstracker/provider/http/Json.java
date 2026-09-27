package com.earningstracker.provider.http;

import tools.jackson.databind.JsonNode;

/** Null-safe readers for loosely typed provider JSON: numbers may arrive as strings, fields may be missing. */
public final class Json {

    private Json() {
    }

    public static String text(JsonNode node) {
        if (node == null || node.isNull() || node.isMissingNode()) {
            return null;
        }
        String value = node.isString() ? node.stringValue() : node.toString();
        return value.isBlank() ? null : value.strip();
    }

    public static Double number(JsonNode node) {
        if (node == null) {
            return null;
        }
        if (node.isNumber()) {
            double value = node.doubleValue();
            return Double.isFinite(value) ? value : null;
        }
        if (node.isString()) {
            try {
                double value = Double.parseDouble(node.stringValue().strip());
                return Double.isFinite(value) ? value : null;
            } catch (NumberFormatException e) {
                return null;
            }
        }
        return null;
    }

    public static Long longNumber(JsonNode node) {
        Double value = number(node);
        return value == null ? null : Math.round(value);
    }

    public static Integer intNumber(JsonNode node) {
        Double value = number(node);
        return value == null ? null : (int) Math.round(value);
    }

    /** Yahoo wraps numbers as {@code {"raw": 1.23, "fmt": "1.23"}}; plain numbers are accepted too. */
    public static Double raw(JsonNode node) {
        if (node == null) {
            return null;
        }
        return node.isObject() ? number(node.path("raw")) : number(node);
    }

    /** Positive values only: some providers report a missing estimate as 0. */
    public static Double positive(Double value) {
        return value != null && value > 0 ? value : null;
    }
}
