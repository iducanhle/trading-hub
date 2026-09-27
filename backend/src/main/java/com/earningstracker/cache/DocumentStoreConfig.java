package com.earningstracker.cache;

import com.earningstracker.firebase.FirebaseAppHolder;
import com.google.firebase.cloud.FirestoreClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
class DocumentStoreConfig {

    private static final Logger log = LoggerFactory.getLogger(DocumentStoreConfig.class);

    @Bean
    DocumentStore documentStore(FirebaseAppHolder firebase) {
        return firebase.app()
                .<DocumentStore>map(app -> new FirestoreDocumentStore(FirestoreClient.getFirestore(app)))
                .orElseGet(() -> {
                    log.warn("Firestore is not available: caching is in memory only and nothing is persisted");
                    return new NoopDocumentStore();
                });
    }
}
