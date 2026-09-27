package com.earningstracker.config;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
class ExecutorConfig {

    /** Virtual threads for fanning out blocking provider calls and for fire-and-forget writes. */
    @Bean(destroyMethod = "close")
    ExecutorService virtualThreads() {
        return Executors.newVirtualThreadPerTaskExecutor();
    }
}
