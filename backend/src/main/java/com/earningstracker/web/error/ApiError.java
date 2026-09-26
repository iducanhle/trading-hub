package com.earningstracker.web.error;

/** Error body of every non-2xx response: {@code { "code": string, "message": string }}. */
public record ApiError(String code, String message) {

    public static ApiError of(ErrorCode code, String message) {
        return new ApiError(code.name(), message);
    }
}
