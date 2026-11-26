package net.softm.cheongyakhannun;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

public final class WatchProfileStore {
    static final String PREFS = "cheongyak_watch_v1";
    private static final String KEY_PROFILE = "profile";

    private WatchProfileStore() { }

    public static void save(Context context, JSONObject input) {
        JSONObject safe = new JSONObject();
        try {
            safe.put("enabled", input.optBoolean("enabled", false));
            safe.put("regions", safeStrings(input.optJSONArray("regions")));
            safe.put("types", safeStrings(input.optJSONArray("types")));
            safe.put("newNotice", input.optBoolean("newNotice", true));
            safe.put("deadline3", input.optBoolean("deadline3", true));
            safe.put("deadline1", input.optBoolean("deadline1", true));
            safe.put("deadlineToday", input.optBoolean("deadlineToday", true));
            safe.put("confirmedAt", input.optString("confirmedAt", ""));
        } catch (Exception ignored) { }
        preferences(context).edit().putString(KEY_PROFILE, safe.toString()).apply();
    }

    public static JSONObject load(Context context) {
        String stored = preferences(context).getString(KEY_PROFILE, "");
        try {
            if (stored != null && !stored.trim().isEmpty()) return new JSONObject(stored);
        } catch (Exception ignored) { }
        try {
            return new JSONObject()
                .put("enabled", false)
                .put("regions", new JSONArray())
                .put("types", new JSONArray())
                .put("newNotice", true)
                .put("deadline3", true)
                .put("deadline1", true)
                .put("deadlineToday", true);
        } catch (Exception impossible) {
            return new JSONObject();
        }
    }

    public static boolean matches(JSONObject notice, JSONObject profile) {
        if (!profile.optBoolean("enabled", false)) return false;
        JSONArray regions = profile.optJSONArray("regions");
        JSONArray types = profile.optJSONArray("types");
        boolean regionMatches = regions == null || regions.length() == 0
            || contains(regions, notice.optString("region", ""));
        boolean typeMatches = types == null || types.length() == 0
            || contains(types, notice.optString("type", ""))
            || contains(types, notice.optString("subtype", ""));
        return regionMatches && typeMatches;
    }

    static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static JSONArray safeStrings(JSONArray values) {
        JSONArray result = new JSONArray();
        if (values == null) return result;
        for (int index = 0; index < Math.min(values.length(), 30); index += 1) {
            String value = values.optString(index, "").trim();
            if (!value.isEmpty() && value.length() <= 40) result.put(value);
        }
        return result;
    }

    private static boolean contains(JSONArray values, String expected) {
        if (expected == null || expected.isEmpty()) return false;
        for (int index = 0; index < values.length(); index += 1) {
            if (expected.equals(values.optString(index))) return true;
        }
        return false;
    }
}
