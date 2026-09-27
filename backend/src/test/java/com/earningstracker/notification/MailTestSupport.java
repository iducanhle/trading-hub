package com.earningstracker.notification;

import java.io.IOException;
import java.util.Map;
import java.util.TreeMap;

import jakarta.mail.BodyPart;
import jakarta.mail.MessagingException;
import jakarta.mail.Multipart;
import jakarta.mail.Part;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.thymeleaf.spring6.SpringTemplateEngine;
import org.thymeleaf.templatemode.TemplateMode;
import org.thymeleaf.templateresolver.ClassLoaderTemplateResolver;

/** Mail plumbing shared by the digest tests. */
public final class MailTestSupport {

    public static final String SENDER = "sender@example.com";
    public static final String APP_PASSWORD = "app-password";

    private MailTestSupport() {
    }

    /** Resolves templates the way Spring Boot's Thymeleaf auto-configuration does. */
    public static SpringTemplateEngine templateEngine() {
        ClassLoaderTemplateResolver resolver = new ClassLoaderTemplateResolver();
        resolver.setPrefix("templates/");
        resolver.setSuffix(".html");
        resolver.setTemplateMode(TemplateMode.HTML);
        resolver.setCharacterEncoding("UTF-8");
        SpringTemplateEngine engine = new SpringTemplateEngine();
        engine.setTemplateResolver(resolver);
        return engine;
    }

    public static JavaMailSenderImpl mailSender(int port) {
        JavaMailSenderImpl sender = new JavaMailSenderImpl();
        sender.setHost("127.0.0.1");
        sender.setPort(port);
        sender.setUsername(SENDER);
        sender.setPassword(APP_PASSWORD);
        sender.getJavaMailProperties().put("mail.smtp.auth", "true");
        sender.getJavaMailProperties().put("mail.smtp.connectiontimeout", "2000");
        return sender;
    }

    public static NotificationProperties properties() {
        return new NotificationProperties(SENDER, APP_PASSWORD, "Earnings Tracker", "https://app.example.com/");
    }

    /** The text parts of a message by content type ({@code text/plain}, {@code text/html}). */
    public static Map<String, String> parts(Part part) throws MessagingException, IOException {
        Map<String, String> parts = new TreeMap<>();
        collect(part, parts);
        return parts;
    }

    private static void collect(Part part, Map<String, String> parts) throws MessagingException, IOException {
        if (part.getContent() instanceof Multipart multipart) {
            for (int i = 0; i < multipart.getCount(); i++) {
                BodyPart child = multipart.getBodyPart(i);
                collect(child, parts);
            }
        } else if (part.isMimeType("text/plain")) {
            parts.put("text/plain", (String) part.getContent());
        } else if (part.isMimeType("text/html")) {
            parts.put("text/html", (String) part.getContent());
        }
    }
}
