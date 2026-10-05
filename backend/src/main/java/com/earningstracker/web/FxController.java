package com.earningstracker.web;

import java.util.LinkedHashMap;
import java.util.Map;

import com.earningstracker.fx.FxService;
import com.earningstracker.web.dto.Dtos;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class FxController {

    private final FxService fx;

    public FxController(FxService fx) {
        this.fx = fx;
    }

    /** Today's rates of every supported currency to USD, for showing amounts in another currency (approximate). */
    @GetMapping("/fx/latest")
    public Dtos.FxLatest latest() {
        Map<String, Double> rates = new LinkedHashMap<>();
        rates.put("USD", 1.0);
        rates.putAll(fx.rates());
        return new Dtos.FxLatest("USD", rates);
    }
}
