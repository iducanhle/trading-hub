package com.earningstracker.provider;

/** A value tagged with the id of the provider that supplied it. */
public record Sourced<T>(String provider, T value) {
}
