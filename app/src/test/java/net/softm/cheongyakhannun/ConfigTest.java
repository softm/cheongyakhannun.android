package net.softm.cheongyakhannun;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

public class ConfigTest {
    @Test public void officialUrlsUseHttps() {
        assertTrue(BuildConfig.WEB_URL.startsWith("https://"));
        assertTrue(BuildConfig.DATA_URL.startsWith(BuildConfig.WEB_URL));
    }

    @Test public void watchProfileMatchesRegionAndTypeTogether() throws Exception {
        JSONObject profile = new JSONObject()
            .put("enabled", true)
            .put("regions", new JSONArray().put("서울"))
            .put("types", new JSONArray().put("공공임대"));
        JSONObject matching = new JSONObject().put("region", "서울").put("type", "공공임대");
        JSONObject wrongRegion = new JSONObject().put("region", "경기").put("type", "공공임대");
        JSONObject wrongType = new JSONObject().put("region", "서울").put("type", "민간분양");

        assertTrue(WatchProfileStore.matches(matching, profile));
        assertFalse(WatchProfileStore.matches(wrongRegion, profile));
        assertFalse(WatchProfileStore.matches(wrongType, profile));
    }

    @Test public void deadlineUsesKoreanCalendarDates() {
        assertEquals(Integer.valueOf(3), DeadlinePolicy.daysUntil("2026-11-23", "2026-11-26"));
        assertEquals(Integer.valueOf(0), DeadlinePolicy.daysUntil("2026-11-23", "2026-11-23"));
        assertEquals("deadline:notice-1:1", DeadlinePolicy.notificationKey("notice-1", 1));
    }

    @Test public void supplyPlansDoNotTriggerNoticeNotifications() throws Exception {
        JSONObject notice = new JSONObject().put("dataKind", "notice");
        JSONObject supplyPlan = new JSONObject().put("dataKind", "supply_plan");
        JSONObject staleNotice = new JSONObject().put("dataKind", "notice").put("stale", true);

        assertTrue(NoticeSyncWorker.isNotifiableNotice(notice));
        assertFalse(NoticeSyncWorker.isNotifiableNotice(supplyPlan));
        assertFalse(NoticeSyncWorker.isNotifiableNotice(staleNotice));
    }
}
