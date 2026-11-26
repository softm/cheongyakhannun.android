// 청약한눈 전용 Kakao AdFit 매체와 단위를 신규 발급한 뒤에만 활성화한다.
// 기존 NKm/DAN-*은 분양한눈 소유이므로 이 저장소에서 재사용하지 않는다.
export const NATIVE_ADS = /\bAdMobNative\/1\b/.test(globalThis.navigator?.userAgent || "");

export const ADFIT_CONFIG = Object.freeze({
  enabled: false && !NATIVE_ADS,
  hostname: "softm.github.io",
  pathname: "/cheongyakhannun/",
  script: "https://t1.kakaocdn.net/kas/static/ba.min.js",
  bottom: Object.freeze({
    desktop: Object.freeze({ unit: "", width: 728, height: 90 }),
    mobile: Object.freeze({ unit: "", width: 320, height: 100 })
  })
});
