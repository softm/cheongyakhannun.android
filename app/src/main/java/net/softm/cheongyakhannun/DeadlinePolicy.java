package net.softm.cheongyakhannun;

import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

public final class DeadlinePolicy {
    private static final long DAY_MILLIS = 86_400_000L;

    private DeadlinePolicy() { }

    public static String todayKey() {
        return formatter().format(new Date());
    }

    public static Integer daysUntil(String today, String deadline) {
        try {
            Date from = formatter().parse(today);
            Date to = formatter().parse(deadline);
            if (from == null || to == null) return null;
            return (int) Math.round((to.getTime() - from.getTime()) / (double) DAY_MILLIS);
        } catch (ParseException ignored) {
            return null;
        }
    }

    public static String notificationKey(String noticeId, int days) {
        return "deadline:" + noticeId + ":" + days;
    }

    private static SimpleDateFormat formatter() {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
        format.setLenient(false);
        format.setTimeZone(TimeZone.getTimeZone("Asia/Seoul"));
        return format;
    }
}
