package net.softm.cheongyakhannun;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

public final class NoticeSyncWorker extends Worker {
    private static final String KEY_BASELINE_READY = "baseline_ready";
    private static final String KEY_SEEN_IDS = "seen_ids";
    private static final String KEY_NOTIFIED = "notified_keys";
    private static final int MAX_NOTIFICATIONS_PER_RUN = 4;
    private static final int MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

    public NoticeSyncWorker(@NonNull Context context, @NonNull WorkerParameters parameters) {
        super(context, parameters);
    }

    @NonNull @Override public Result doWork() {
        Context context = getApplicationContext();
        JSONObject profile = WatchProfileStore.load(context);
        if (!profile.optBoolean("enabled", false)) return Result.success();

        try {
            JSONObject envelope = fetchEnvelope();
            JSONArray notices = envelope.optJSONArray("notices");
            if (notices == null) return Result.failure();

            SharedPreferences preferences = WatchProfileStore.preferences(context);
            boolean baselineReady = preferences.getBoolean(KEY_BASELINE_READY, false);
            Set<String> seen = new HashSet<>(preferences.getStringSet(KEY_SEEN_IDS, Collections.emptySet()));
            Set<String> notified = new HashSet<>(preferences.getStringSet(KEY_NOTIFIED, Collections.emptySet()));
            Set<String> currentIds = new HashSet<>();
            String today = DeadlinePolicy.todayKey();
            int sent = 0;

            for (int index = 0; index < notices.length(); index += 1) {
                JSONObject notice = notices.optJSONObject(index);
                if (notice == null || notice.optBoolean("stale", false) || !WatchProfileStore.matches(notice, profile)) continue;
                String id = notice.optString("id", "");
                String title = notice.optString("title", "청약 공고");
                if (id.trim().isEmpty()) continue;
                currentIds.add(id);

                String newKey = "new:" + id;
                if (sent < MAX_NOTIFICATIONS_PER_RUN
                    && baselineReady
                    && profile.optBoolean("newNotice", true)
                    && !seen.contains(id)
                    && !notified.contains(newKey)
                    && NotificationHelper.show(context, newKey, "새 관심 청약 공고", title)) {
                    notified.add(newKey);
                    sent += 1;
                }

                String deadline = notice.optString("applyEnd", "");
                Integer days = DeadlinePolicy.daysUntil(today, deadline);
                if (days == null || days < 0 || days > 3 || sent >= MAX_NOTIFICATIONS_PER_RUN) continue;
                boolean enabled = (days == 3 && profile.optBoolean("deadline3", true))
                    || (days == 1 && profile.optBoolean("deadline1", true))
                    || (days == 0 && profile.optBoolean("deadlineToday", true));
                if (!enabled) continue;
                String deadlineKey = DeadlinePolicy.notificationKey(id, days);
                String dday = days == 0 ? "오늘 마감" : "D-" + days + " 마감";
                if (!notified.contains(deadlineKey)
                    && NotificationHelper.show(context, deadlineKey, "청약 접수 " + dday, title)) {
                    notified.add(deadlineKey);
                    sent += 1;
                }
            }

            seen.addAll(currentIds);
            preferences.edit()
                .putBoolean(KEY_BASELINE_READY, true)
                .putStringSet(KEY_SEEN_IDS, seen)
                .putStringSet(KEY_NOTIFIED, notified)
                .apply();
            return Result.success();
        } catch (Exception error) {
            return getRunAttemptCount() < 3 ? Result.retry() : Result.failure();
        }
    }

    private JSONObject fetchEnvelope() throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(BuildConfig.DATA_URL).openConnection();
        connection.setConnectTimeout(15_000);
        connection.setReadTimeout(20_000);
        connection.setUseCaches(false);
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("Cache-Control", "no-cache");
        connection.setRequestProperty("User-Agent", "CheongyakHannunAndroid/1.0");
        try {
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) throw new IllegalStateException("Notice HTTP " + status);
            try (InputStream input = connection.getInputStream(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[16_384];
                int total = 0;
                int read;
                while ((read = input.read(buffer)) >= 0) {
                    total += read;
                    if (total > MAX_RESPONSE_BYTES) throw new IllegalStateException("Notice response too large");
                    output.write(buffer, 0, read);
                }
                return new JSONObject(new String(output.toByteArray(), StandardCharsets.UTF_8));
            }
        } finally {
            connection.disconnect();
        }
    }
}
