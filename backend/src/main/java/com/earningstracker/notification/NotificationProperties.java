package com.earningstracker.notification;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.util.StringUtils;

/**
 * @param fromAddress {@code MAIL_USERNAME}: the Gmail account that sends the digest
 * @param password    {@code MAIL_APP_PASSWORD}; only checked for presence here (Spring Mail uses it)
 * @param fromName    display name of the sender
 * @param baseUrl     {@code APP_BASE_URL}, for links to {@code /stock/{symbol}}
 */
@ConfigurationProperties("app.mail")
public record NotificationProperties(String fromAddress, String password, String fromName, String baseUrl) {

    public boolean configured() {
        return StringUtils.hasText(fromAddress) && StringUtils.hasText(password);
    }

    @Override
    public String toString() {
        return "NotificationProperties[fromAddress=" + fromAddress + ", fromName=" + fromName + ", baseUrl=" + baseUrl
                + "]"; // never the password
    }
}
