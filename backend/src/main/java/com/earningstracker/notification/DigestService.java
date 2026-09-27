package com.earningstracker.notification;

import java.io.UnsupportedEncodingException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.stream.Collectors;

import com.earningstracker.cache.TieredCache.Cached;
import com.earningstracker.market.EarningsReport;
import com.earningstracker.market.ReportTime;
import com.earningstracker.service.EarningsService;
import com.earningstracker.service.FollowService;
import com.earningstracker.service.ProfileService;
import com.earningstracker.service.StockProfile;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import org.springframework.mail.MailPreparationException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;
import org.thymeleaf.ITemplateEngine;
import org.thymeleaf.context.Context;

/**
 * The earnings digest (§8): followed stocks reporting in a date window, from stored data only, rendered as a
 * mobile-friendly HTML email with a plain-text alternative.
 */
@Service
public class DigestService {

    public record Item(String symbol, String name, String logoUrl, LocalDate date, ReportTime time, String currency,
            Double epsEstimate, Double revenueEstimate) {
    }

    public record Message(String to, String subject, String html, String text) {
    }

    /** One stock as displayed; formatted once for both the HTML and the text part. */
    public record Row(String symbol, String name, String logoUrl, String initials, String date, String time,
            String eps, String revenue, String url) {
    }

    static final int MAX_SUBJECT_SYMBOLS = 5;
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("EEE, d MMM yyyy", Locale.ENGLISH);

    private final FollowService follows;
    private final EarningsService earnings;
    private final ProfileService profiles;
    private final ITemplateEngine templates;
    private final JavaMailSender mailSender;
    private final NotificationProperties properties;

    public DigestService(FollowService follows, EarningsService earnings, ProfileService profiles,
            ITemplateEngine templates, JavaMailSender mailSender, NotificationProperties properties) {
        this.follows = follows;
        this.earnings = earnings;
        this.profiles = profiles;
        this.templates = templates;
        this.mailSender = mailSender;
        this.properties = properties;
    }

    public boolean isConfigured() {
        return properties.configured();
    }

    /** The user's followed stocks reporting from {@code from} to {@code to}; unknown symbols load in the background. */
    public List<Item> upcoming(String uid, LocalDate from, LocalDate to) {
        List<Item> items = new ArrayList<>();
        for (FollowService.Follow follow : follows.follows(uid)) {
            Optional<Cached<List<EarningsReport>>> stored = earnings.stored(follow.symbol());
            if (stored.isEmpty()) {
                earnings.warmUp(follow.symbol());
                continue;
            }
            String logo = follow.logoUrl() != null ? follow.logoUrl()
                    : profiles.stored(follow.symbol()).map(StockProfile::logoUrl).orElse(null);
            stored.get().value().stream()
                    .filter(r -> r.date() != null && r.epsActual() == null && !r.date().isBefore(from)
                            && !r.date().isAfter(to))
                    .forEach(r -> items.add(new Item(follow.symbol(), follow.name(), logo, r.date(), r.time(),
                            r.currency(), r.epsEstimate(), r.revenueEstimate())));
        }
        items.sort(Comparator.comparing(Item::date).thenComparing(Item::symbol));
        return items;
    }

    /** Illustrative rows for the test email when the user follows nothing with upcoming earnings. */
    public List<Item> samples(LocalDate today) {
        return List.of(
                new Item("NVDA", "NVIDIA Corporation (sample)", null, today.plusDays(1), ReportTime.AMC, "USD", 1.05,
                        54.9e9),
                new Item("SAP.DE", "SAP SE (sample)", null, today.plusDays(2), ReportTime.BMO, "EUR", 1.83, 10.09e9));
    }

    public Message compose(String to, List<Item> items, LocalDate today, boolean sample, boolean test) {
        List<String> symbols = items.stream().map(Item::symbol).distinct().toList();
        String list = String.join(", ", symbols.subList(0, Math.min(MAX_SUBJECT_SYMBOLS, symbols.size())))
                + (symbols.size() > MAX_SUBJECT_SYMBOLS ? " +" + (symbols.size() - MAX_SUBJECT_SYMBOLS) + " more" : "");
        boolean tomorrow = items.stream().allMatch(i -> i.date().equals(today.plusDays(1)));
        String subject = (test ? "[Test] " : "") + (tomorrow ? "Earnings tomorrow: " : "Upcoming earnings: ") + list;
        String title = tomorrow ? "Reporting tomorrow" : "Upcoming earnings";
        String baseUrl = properties.baseUrl().replaceAll("/+$", "");
        List<Row> rows = items.stream().map(item -> row(item, baseUrl)).toList();

        Context context = new Context(Locale.ENGLISH);
        context.setVariable("title", title);
        context.setVariable("rows", rows);
        context.setVariable("sample", sample);
        context.setVariable("test", test);
        context.setVariable("appUrl", baseUrl);
        context.setVariable("settingsUrl", baseUrl + "/settings");
        String html = templates.process("email/digest", context);
        return new Message(to, subject, html, text(title, rows, sample, baseUrl));
    }

    public void send(Message message) {
        try {
            MimeMessage mime = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(mime, true, StandardCharsets.UTF_8.name());
            helper.setFrom(properties.fromAddress(), properties.fromName());
            helper.setTo(message.to());
            helper.setSubject(message.subject());
            helper.setText(message.text(), message.html());
            mailSender.send(mime);
        } catch (MessagingException | UnsupportedEncodingException e) {
            throw new MailPreparationException("Could not build the digest email", e);
        }
    }

    static Row row(Item item, String baseUrl) {
        return new Row(item.symbol(), item.name(), item.logoUrl(), initials(item.name(), item.symbol()),
                DATE.format(item.date()), timeLabel(item.time()),
                item.epsEstimate() == null ? "—" : String.format(Locale.ENGLISH, "%.2f %s", item.epsEstimate(),
                        currency(item)),
                item.revenueEstimate() == null ? "—" : compact(item.revenueEstimate()) + " " + currency(item),
                baseUrl + "/stock/" + URLEncoder.encode(item.symbol(), StandardCharsets.UTF_8));
    }

    static String timeLabel(ReportTime time) {
        return switch (time == null ? ReportTime.UNKNOWN : time) {
            case BMO -> "Before open";
            case AMC -> "After close";
            case DMH -> "During market hours";
            case UNKNOWN -> "Time TBD";
        };
    }

    /** 10088648850 → "10.09B". */
    static String compact(double value) {
        double abs = Math.abs(value);
        if (abs >= 1e12) {
            return String.format(Locale.ENGLISH, "%.2fT", value / 1e12);
        }
        if (abs >= 1e9) {
            return String.format(Locale.ENGLISH, "%.2fB", value / 1e9);
        }
        if (abs >= 1e6) {
            return String.format(Locale.ENGLISH, "%.2fM", value / 1e6);
        }
        return String.format(Locale.ENGLISH, "%.0f", value);
    }

    private static String currency(Item item) {
        return item.currency() == null ? "" : item.currency();
    }

    private static String initials(String name, String symbol) {
        String source = name == null || name.isBlank() ? symbol : name;
        return Arrays.stream(source.split("[\\s.-]+")).filter(w -> !w.isEmpty()).limit(2)
                .map(w -> w.substring(0, 1).toUpperCase(Locale.ROOT)).collect(Collectors.joining());
    }

    private static String text(String title, List<Row> rows, boolean sample, String baseUrl) {
        StringBuilder text = new StringBuilder(title).append("\n\n");
        if (sample) {
            text.append("You don't follow any stocks reporting soon, so this shows sample data.\n\n");
        }
        for (Row row : rows) {
            text.append(row.symbol()).append(" · ").append(row.name()).append('\n')
                    .append("  ").append(row.date()).append(" · ").append(row.time()).append('\n')
                    .append("  EPS est. ").append(row.eps()).append(" · Revenue est. ").append(row.revenue()).append('\n')
                    .append("  ").append(row.url()).append("\n\n");
        }
        return text.append("Manage notifications: ").append(baseUrl).append("/settings\n").toString();
    }
}
