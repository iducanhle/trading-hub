package com.earningstracker.t212;

import com.earningstracker.provider.t212.T212Exception;
import com.earningstracker.web.error.ApiException;
import com.earningstracker.web.error.ErrorCode;

/** Contract errors for failed Trading 212 calls. */
public final class T212Errors {

    private T212Errors() {
    }

    public static ErrorCode code(T212Exception e) {
        return switch (e.kind()) {
            case UNAUTHORIZED -> ErrorCode.T212_INVALID_CREDENTIALS;
            case FORBIDDEN -> ErrorCode.T212_MISSING_PERMISSIONS;
            case RATE_LIMITED -> ErrorCode.T212_RATE_LIMITED;
            case UNAVAILABLE, BAD_RESPONSE -> ErrorCode.T212_UNAVAILABLE;
        };
    }

    public static String message(T212Exception e) {
        return switch (e.kind()) {
            case UNAUTHORIZED -> "Trading 212 rejected the API key. Check the key, the secret, Live or Demo, and the "
                    + "key's IP restriction.";
            case FORBIDDEN -> "The API key lacks a permission the app needs.";
            case RATE_LIMITED -> "Trading 212's rate limit was reached. Try again in a minute.";
            case UNAVAILABLE -> "Trading 212 is not reachable right now (" + e.getMessage() + ").";
            case BAD_RESPONSE -> "Trading 212 sent an unexpected answer (" + e.getMessage() + ").";
        };
    }

    public static ApiException toApi(T212Exception e) {
        return new ApiException(code(e), message(e));
    }
}
