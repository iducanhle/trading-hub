package com.earningstracker.web;

import com.earningstracker.security.AuthenticatedUser;
import com.earningstracker.t212.T212ConnectionService;
import com.earningstracker.web.dto.T212Dtos;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Trading 212 portfolio (docs/CONTRACT.md, "Trading 212"); every call acts on the caller's own account. */
@RestController
@RequestMapping("/api/t212")
public class T212Controller {

    private final T212ConnectionService connection;

    public T212Controller(T212ConnectionService connection) {
        this.connection = connection;
    }

    @GetMapping("/status")
    public T212Dtos.Status status(@AuthenticationPrincipal AuthenticatedUser user) {
        return connection.status(user.uid());
    }

    @PutMapping("/credentials")
    public T212Dtos.Status saveCredentials(@AuthenticationPrincipal AuthenticatedUser user,
            @RequestBody T212Dtos.CredentialsRequest request) {
        return connection.connect(user.uid(), request);
    }

    @DeleteMapping("/credentials")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteCredentials(@AuthenticationPrincipal AuthenticatedUser user) {
        connection.disconnect(user.uid());
    }
}
