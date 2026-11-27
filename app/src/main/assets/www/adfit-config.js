// 청약한눈 전용 Kakao AdFit Web 매체(NKw). 다른 서비스에서 광고 단위 ID를 재사용하지 않는다.
export const NATIVE_ADS = /\bAdMobNative\/1\b/.test(globalThis.navigator?.userAgent || "");

export const ADFIT_CONFIG = Object.freeze({
  enabled: !NATIVE_ADS,
  hostname: "softm.github.io",
  pathname: "/cheongyakhannun/",
  script: "https://t1.kakaocdn.net/kas/static/ba.min.js",
  bottom: Object.freeze({
    desktop: Object.freeze({ unit: "DAN-obc38Zd2XD9940os", width: 728, height: 90 }),
    mobile: Object.freeze({ unit: "DAN-c5FSnJxYcJGNguZZ", width: 320, height: 100 })
  })
});
