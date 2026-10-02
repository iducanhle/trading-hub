package com.earningstracker.web;

import com.earningstracker.security.AuthenticatedUser;
import com.earningstracker.t212.T212ConnectionService;
import com.earningstracker.t212.T212SyncService;
import com.earningstracker.web.dto.T212Dtos;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
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
    private final T212SyncService sync;

    public T212Controller(T212ConnectionService connection, T212SyncService sync) {
        this.connection = connection;
        this.sync = sync;
    }

    @GetMapping("/status")
    public T212Dtos.Status status(@AuthenticationPrincipal AuthenticatedUser user) {
        return connection.status(user.uid());
    }

    @PutMapping("/credentials")
    public T212Dtos.Status saveCredentials(@AuthenticationPrincipal AuthenticatedUser user,
            @RequestBody T212Dtos.CredentialsRequest request) {
        connection.connect(user.uid(), request);
        return sync.start(user.uid());
    }

    /** Starts an incremental sync; if one is running, answers with its status. */
    @PostMapping("/sync")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public T212Dtos.Status sync(@AuthenticationPrincipal AuthenticatedUser user) {
        return sync.start(user.uid());
    }

    @DeleteMapping("/credentials")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteCredentials(@AuthenticationPrincipal AuthenticatedUser user) {
        connection.disconnect(user.uid());
    }
}
