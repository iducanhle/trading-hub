package com.earningstracker.web.error;

import io.swagger.v3.oas.annotations.Hidden;
import jakarta.servlet.RequestDispatcher;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.boot.webmvc.error.ErrorController;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Replaces Boot's default {@code /error} page, so errors raised outside Spring MVC (servlet container,
 * request firewall) still use the contract error format.
 */
@Hidden
@RestController
public class JsonErrorController implements ErrorController {

    @RequestMapping("${server.error.path:/error}")
    ResponseEntity<ApiError> error(HttpServletRequest request) {
        HttpStatus status = request.getAttribute(RequestDispatcher.ERROR_STATUS_CODE) instanceof Integer code
                ? HttpStatus.resolve(code)
                : null;
        if (status == null) {
            status = HttpStatus.INTERNAL_SERVER_ERROR;
        }
        return ResponseEntity.status(status).body(ApiError.of(ErrorCode.forStatus(status), status.getReasonPhrase()));
    }
}
