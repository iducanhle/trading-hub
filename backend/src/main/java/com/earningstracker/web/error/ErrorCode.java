package com.earningstracker.web.error;

import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;

/** Error codes of the API contract (docs/CONTRACT.md, "Errors"), each with its HTTP status. */
public enum ErrorCode {
    BAD_REQUEST(HttpStatus.BAD_REQUEST),
    UNAUTHENTICATED(HttpStatus.UNAUTHORIZED),
    NOT_ALLOWED(HttpStatus.FORBIDDEN),
    SYMBOL_NOT_FOUND(HttpStatus.NOT_FOUND),
    NOT_FOUND(HttpStatus.NOT_FOUND),
    METHOD_NOT_ALLOWED(HttpStatus.METHOD_NOT_ALLOWED),
    RATE_LIMITED(HttpStatus.TOO_MANY_REQUESTS),
    INTERNAL_ERROR(HttpStatus.INTERNAL_SERVER_ERROR),
    UPSTREAM_UNAVAILABLE(HttpStatus.SERVICE_UNAVAILABLE);

    private final HttpStatus status;

    ErrorCode(HttpStatus status) {
        this.status = status;
    }

    public HttpStatus status() {
        return status;
    }

    /** Best code for a status raised by the framework rather than by our code. */
    public static ErrorCode forStatus(HttpStatusCode status) {
        return switch (status.value()) {
            case 401 -> UNAUTHENTICATED;
            case 403 -> NOT_ALLOWED;
            case 404 -> NOT_FOUND;
            case 405 -> METHOD_NOT_ALLOWED;
            case 429 -> RATE_LIMITED;
            case 503 -> UPSTREAM_UNAVAILABLE;
            default -> status.is4xxClientError() ? BAD_REQUEST : INTERNAL_ERROR;
        };
    }
}
