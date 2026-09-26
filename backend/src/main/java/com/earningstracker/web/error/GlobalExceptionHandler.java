package com.earningstracker.web.error;

import java.util.stream.Collectors;

import jakarta.validation.ConstraintViolationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.TypeMismatchException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.ErrorResponse;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;

/** Maps every exception that reaches Spring MVC to the contract error format. */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ApiException.class)
    ResponseEntity<ApiError> handleApiException(ApiException ex) {
        return respond(ex.code(), ex.getMessage());
    }

    @ExceptionHandler(HandlerMethodValidationException.class)
    ResponseEntity<ApiError> handleValidation(HandlerMethodValidationException ex) {
        String message = ex.getParameterValidationResults().stream()
                .flatMap(result -> result.getResolvableErrors().stream()
                        .map(error -> result.getMethodParameter().getParameterName() + ": " + error.getDefaultMessage()))
                .collect(Collectors.joining("; "));
        return respond(ErrorCode.BAD_REQUEST, message.isEmpty() ? "Invalid request" : message);
    }

    @ExceptionHandler(TypeMismatchException.class)
    ResponseEntity<ApiError> handleTypeMismatch(TypeMismatchException ex) {
        return respond(ErrorCode.BAD_REQUEST, "Invalid value for '" + ex.getPropertyName() + "': " + ex.getValue());
    }

    @ExceptionHandler({ConstraintViolationException.class, HttpMessageNotReadableException.class})
    ResponseEntity<ApiError> handleBadRequest(Exception ex) {
        return respond(ErrorCode.BAD_REQUEST, "Invalid request");
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ApiError> handleOther(Exception ex) {
        if (ex instanceof ErrorResponse errorResponse) {
            // Framework exceptions (missing parameter, unknown path, wrong method, ...) carry their own status.
            ErrorCode code = ErrorCode.forStatus(errorResponse.getStatusCode());
            String detail = errorResponse.getBody().getDetail();
            return ResponseEntity.status(errorResponse.getStatusCode())
                    .body(ApiError.of(code, detail != null ? detail : code.status().getReasonPhrase()));
        }
        log.error("Unhandled exception", ex);
        return respond(ErrorCode.INTERNAL_ERROR, "Unexpected server error");
    }

    private static ResponseEntity<ApiError> respond(ErrorCode code, String message) {
        return ResponseEntity.status(code.status()).body(ApiError.of(code, message));
    }
}
