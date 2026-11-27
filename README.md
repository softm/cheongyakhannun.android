# 청약한눈 Android

`cheongyakhannun` PWA를 표시하고 관심조건에 맞는 신규 공고·접수 마감을 기기 안에서 확인하는 한눈서비스 Android 앱입니다.

## 구성

- SDK: `compileSdk 36`, `targetSdk 36`, `minSdk 24`
- 패키지: `net.softm.cheongyakhannun`
- 운영 URL: `https://softm.github.io/cheongyakhannun/`
- 시작 시 문서·정적 자산 1회 재검증 후 기본 캐시 정책 복귀
- 메인 문서 네트워크/HTTP 오류 시 공통 실패 화면과 48dp 재시도 버튼
- WorkManager 6시간 주기, 관심조건과 공식 JSON을 기기 안에서 비교
- `hannun-admob-android` 및 `hannun-in-app-update-android` 공통 모듈 사용
- AdMob 공통 모듈은 연결되어 있으나 `net.softm.cheongyakhannun` 전용 앱·지면 ID가 등록되기 전에는 운영 요청을 비활성화합니다. `net.softm.bunyanghannun`의 ID를 재사용하지 않습니다.
- Google UMP 동의 및 광고 개인정보 설정, 광고 실패 시 빈 공간 제거, Activity 광고 생명주기를 공통 모듈에서 관리
- Android WebView User-Agent에 `AdMobNative/1`을 표시해 웹 Kakao AdFit 요청과 중복 노출을 차단
- 빌드 전 형제 저장소 `../cheongyakhannun/public`을 오프라인 assets로 동기화

## 로컬 검증

```bash
python3 scripts/validate_ads.py
./gradlew testDebugUnitTest lintDebug assembleDebug
```

Release 서명은 저장소 밖의 환경변수 `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`로만 주입합니다. 배포 판단 전에는 공통 `softm.keystore.jks` 인증서를 확인하고 실제 서명된 Release를 기기 또는 에뮬레이터에서 별도로 검증해야 합니다.

웹 Kakao AdFit은 청약한눈 전용 매체 `NKw`로 계속 동작하며 Android WebView에서는 전용 AdMob이 실제 구성된 경우에만 `AdMobNative/1`로 중복 요청을 차단합니다.

GitHub Actions의 `Prepare verified Play release`는 공통 키스토어 SHA-256을 확인한 뒤 같은 커밋에서 서명 APK·AAB와 체크섬을 비공개 Draft Release로 만듭니다. 워크플로 성공만으로 Play 제출이나 실제 공개가 완료된 것은 아닙니다.
