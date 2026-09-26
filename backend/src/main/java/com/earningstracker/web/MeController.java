package com.earningstracker.web;

import com.earningstracker.security.AuthenticatedUser;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class MeController {

    public record MeResponse(String uid, String email, boolean allowed) {
    }

    /** Only allowed users reach this; the security chain answers 403 for everyone else. */
    @GetMapping("/me")
    public MeResponse me(@AuthenticationPrincipal AuthenticatedUser user) {
        return new MeResponse(user.uid(), user.email(), true);
    }
}
