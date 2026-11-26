# 청약한눈 Android 저장소 분리 증빙

- 원본 Android 저장소: `softm/bunyanghannun.android`
- 원본 기준 SHA: `468814110e4e70e8af1a88f2a81de221ae4cfe20`
- 분리 대상 저장소: `softm/cheongyakhannun.android`
- 신규 패키지: `net.softm.cheongyakhannun`
- 원본 저장소와 Draft Release는 변경하거나 삭제하지 않았다.

## 원본 Draft Release

- 대상 SHA: `d04bbbda043bebe1de22223ff9082375ac18ba9c`
- APK SHA-256: `672be513db0f3364b0fc0d3b727a1f44d59027e62321f2bcceb0e3504e4ed01f`
- AAB SHA-256: `4457ac237fcfac6fe7623c41310fdf3cd1531d553f67d97c63ad72ab896ffc2d`
- SHA256SUMS SHA-256: `e9a98f74fd857028813b1fefd7390eaa0b20882d5b69e421ee068201f4eaf4ed`

## 외부 설정

- 원본 서명 Secret 이름: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`
- Secret 값은 읽거나 저장소에 복사하지 않는다. 신규 저장소에 별도로 등록해야 한다.
- AdMob 운영 ID는 청약한눈 전용으로 표기돼 있으나 신규 패키지 `net.softm.cheongyakhannun`의 Play 연결 전 상태를 확인한 뒤 Release 배포에 사용한다.
- 번들 웹은 분양한눈 소유 AdFit ID를 포함하지 않으며, 청약한눈 전용 AdFit 발급 전까지 비활성화한다.
