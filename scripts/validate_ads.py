#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


main_ids = read("app/src/main/res/values/admob.xml")
debug_ids = read("app/src/debug/res/values/admob.xml")
manifest = read("app/src/main/AndroidManifest.xml")
activity = read("app/src/main/java/net/softm/cheongyakhannun/MainActivity.java")
build = read("app/build.gradle.kts")
web_config = read("app/src/main/assets/www/adfit-config.js")
web_adfit = read("app/src/main/assets/www/js/adfit.js")

production_app_ids = re.findall(r"ca-app-pub-4219853075548260~\d+", main_ids)
production_unit_ids = re.findall(r"ca-app-pub-4219853075548260/\d+", main_ids)
assert len(production_app_ids) == 1, "운영 AdMob 앱 ID가 정확히 하나여야 합니다."
assert len(production_unit_ids) == 4, "운영 광고 단위 ID 4개가 모두 필요합니다."
assert len(set(production_unit_ids)) == 4, "네이티브·배너·전면·종료 광고 단위는 서로 달라야 합니다."
assert "ca-app-pub-3940256099942544" not in main_ids, "운영 리소스에 Google 테스트 ID가 있습니다."

for test_id in (
    "ca-app-pub-3940256099942544~3347511713",
    "ca-app-pub-3940256099942544/2247696110",
    "ca-app-pub-3940256099942544/9214589741",
    "ca-app-pub-3940256099942544/1033173712",
    "ca-app-pub-3940256099942544/6300978111",
):
    assert test_id in debug_ids, f"Debug 테스트 ID 누락: {test_id}"

assert "@string/admob_app_id" in manifest, "Google Mobile Ads 앱 ID 메타데이터가 필요합니다."
assert 'namespace = "net.softm.cheongyakhannun"' in build
assert 'applicationId = "net.softm.cheongyakhannun"' in build
assert "https://softm.github.io/cheongyakhannun/" in build
assert "HannunWebViewAds.markNativeAds(settings)" in activity, "AdMobNative/1 표식 연결이 필요합니다."
assert 'implementation("com.github.softm:hannun-admob-android:1.0.6")' in build
for token in (
    "new HannunAdConfig(",
    "new HannunAds(",
    "ads.start()",
    "ads.onResume()",
    "ads.onPause()",
    "ads.showExitConfirmation(",
    "ads.destroy()",
):
    assert token in activity, f"공통 광고 생명주기 연결 누락: {token}"

assert r"AdMobNative\/1" in web_config, "번들 웹에 네이티브 광고 중복 방지 표식이 없습니다."
web_adfit_units = re.findall(r'unit:\s*"(DAN-[^"]+)"', web_config)
assert len(web_adfit_units) == 2, "청약한눈 전용 PC·모바일 AdFit 단위가 모두 필요합니다."
assert len(set(web_adfit_units)) == 2, "청약한눈 PC·모바일 AdFit 단위를 재사용하면 안 됩니다."
assert set(web_adfit_units) == {"DAN-obc38Zd2XD9940os", "DAN-c5FSnJxYcJGNguZZ"}
assert "DAN-iRADVNYvQvGxjcdU" not in web_config and "DAN-jT5C5ojnNK2xQIkp" not in web_config
assert "if (NATIVE_ADS" in web_adfit, "Android WebView에서 AdFit 요청을 차단해야 합니다."
assert "new IntersectionObserver" in web_adfit and "10_000" in web_adfit
assert "showAdPrivacyOptions" not in activity, "공통 UMP 버튼과 중복되는 웹 브리지를 두면 안 됩니다."

print("청약한눈 AdMob·AdFit 공통 광고 정적 검증 통과")
