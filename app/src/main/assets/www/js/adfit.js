import { ADFIT_CONFIG, NATIVE_ADS } from "../adfit-config.js";

export const BOTTOM_AD_STORAGE_KEY = "cheongyakhannun:ad-bottom:expanded:v1";

let sdkReady;
let serial = 0;
let bottomController;

function isProduction() {
  return location.hostname === ADFIT_CONFIG.hostname
    && location.pathname.startsWith(ADFIT_CONFIG.pathname);
}

function validUnit(unit) {
  return /^DAN-[A-Za-z0-9_-]+$/.test(unit || "");
}

function selectSlot(win) {
  const desktop = win.matchMedia("(min-width: 768px)").matches;
  return desktop ? ADFIT_CONFIG.bottom.desktop : ADFIT_CONFIG.bottom.mobile;
}

function loadSdk(createFirstAd) {
  if (sdkReady) return sdkReady;
  sdkReady = new Promise((resolve, reject) => {
    const resolveWhenReady = () => {
      if (typeof window.adfit?.render === "function") resolve();
      else reject(new Error("AdFit render unavailable"));
    };
    createFirstAd(resolveWhenReady, reject);
    const script = document.createElement("script");
    script.async = true;
    script.charset = "utf-8";
    script.src = ADFIT_CONFIG.script;
    script.onerror = () => reject(new Error("AdFit SDK load failed"));
    script.onload = () => {
      if (typeof window.adfit?.render !== "function") reject(new Error("AdFit SDK initialization failed"));
    };
    document.body.append(script);
  });
  return sdkReady;
}

function createAdNode(slot, onState) {
  const node = document.createElement("div");
  node.className = "adfit-bottom-ad-body";
  node.hidden = true;
  let attempted = false;
  let queued = false;
  let visible = false;
  let timeout = 0;

  const setState = (state) => {
    node.dataset.state = state;
    onState(state);
  };
  const clear = () => {
    window.clearTimeout(timeout);
    node.replaceChildren();
    node.style.minHeight = "";
    node.hidden = true;
    setState("empty");
  };
  const eligible = () => visible
    && !document.hidden
    && node.isConnected
    && node.clientWidth >= slot.width;

  function insertAd(resolveFirst, rejectFirst) {
    attempted = true;
    queued = false;
    observer.disconnect();
    document.removeEventListener("visibilitychange", request);
    node.hidden = false;
    node.style.minHeight = `${slot.height}px`;
    setState("requested");

    const ins = document.createElement("ins");
    ins.className = "kakao_ad_area";
    ins.style.display = "none";
    ins.dataset.adUnit = slot.unit;
    ins.dataset.adWidth = String(slot.width);
    ins.dataset.adHeight = String(slot.height);
    const id = ++serial;
    const failed = `cheongyakAdFailed${id}`;
    const loaded = `cheongyakAdLoaded${id}`;
    window[failed] = () => { resolveFirst?.(); clear(); };
    window[loaded] = () => {
      window.clearTimeout(timeout);
      node.hidden = false;
      setState("filled");
      resolveFirst?.();
    };
    ins.dataset.adOnfail = failed;
    ins.dataset.adOnload = loaded;
    node.append(ins);
    timeout = window.setTimeout(() => {
      rejectFirst?.(new Error("AdFit response timeout"));
      if (!node.querySelector("iframe")) clear();
    }, 10_000);
    return ins;
  }

  function request() {
    if (attempted || queued || !eligible()) return;
    queued = true;
    if (!sdkReady) {
      loadSdk(insertAd).catch(clear);
      return;
    }
    sdkReady.then(() => {
      queued = false;
      if (!eligible()) return;
      const ins = insertAd();
      try { window.adfit.render(ins); } catch { clear(); }
    }).catch(() => {
      queued = false;
      attempted = true;
      clear();
    });
  }

  const observer = new IntersectionObserver((entries) => {
    visible = entries.some((entry) => entry.isIntersecting);
    if (visible) request();
  });
  observer.observe(node);
  document.addEventListener("visibilitychange", request);
  return node;
}

export function mountBottomAd({ win = window, doc = document } = {}) {
  if (bottomController) return bottomController;
  const slot = selectSlot(win);
  const viewportWidth = Math.max(doc.documentElement?.clientWidth || 0, win.innerWidth || 0);
  if (NATIVE_ADS || !ADFIT_CONFIG.enabled || !isProduction() || !validUnit(slot?.unit) || viewportWidth < slot.width) {
    return null;
  }

  const shell = doc.createElement("aside");
  shell.className = "adfit-bottom-ad";
  shell.setAttribute("aria-label", "하단 광고");
  shell.innerHTML = `
    <button type="button" class="adfit-bottom-ad-toggle" aria-controls="adfitBottomAdPanel" aria-expanded="true" aria-label="하단 광고 접기">
      <span class="adfit-bottom-ad-grip" aria-hidden="true"></span>
      <span class="adfit-bottom-ad-chevron" aria-hidden="true"></span>
    </button>
    <section id="adfitBottomAdPanel" class="adfit-bottom-ad-panel" aria-label="광고"></section>`;
  const button = shell.querySelector(".adfit-bottom-ad-toggle");
  const panel = shell.querySelector(".adfit-bottom-ad-panel");
  let expanded = true;
  let resizeObserver;
  try {
    const stored = win.sessionStorage.getItem(BOTTOM_AD_STORAGE_KEY);
    if (stored !== null) expanded = stored === "true";
  } catch { /* Storage can be unavailable in privacy mode. */ }

  const syncSpace = () => {
    const height = Math.ceil(shell.getBoundingClientRect().height);
    doc.body.style.setProperty("--adfit-bottom-ad-space", `${height}px`);
    doc.body.classList.toggle("adfit-bottom-ad-active", height > 0);
  };
  const node = createAdNode(slot, (state) => {
    if (state === "empty") {
      shell.remove();
      doc.body.style.setProperty("--adfit-bottom-ad-space", "0px");
      doc.body.classList.remove("adfit-bottom-ad-active");
      bottomController = null;
      return;
    }
    syncSpace();
  });
  panel.append(node);
  doc.body.append(shell);

  const sync = () => {
    panel.hidden = !expanded;
    shell.classList.toggle("is-collapsed", !expanded);
    button.setAttribute("aria-expanded", String(expanded));
    button.setAttribute("aria-label", expanded ? "하단 광고 접기" : "하단 광고 펼치기");
    node.hidden = !expanded || node.dataset.state === "empty";
    syncSpace();
  };
  const setExpanded = (value) => {
    expanded = Boolean(value);
    try { win.sessionStorage.setItem(BOTTOM_AD_STORAGE_KEY, String(expanded)); } catch { /* Optional preference. */ }
    sync();
  };
  const toggle = () => setExpanded(!expanded);
  button.addEventListener("click", toggle);
  resizeObserver = win.ResizeObserver ? new win.ResizeObserver(syncSpace) : null;
  resizeObserver?.observe(shell);
  sync();

  bottomController = {
    setExpanded,
    destroy() {
      resizeObserver?.disconnect();
      button.removeEventListener("click", toggle);
      shell.remove();
      doc.body.style.setProperty("--adfit-bottom-ad-space", "0px");
      doc.body.classList.remove("adfit-bottom-ad-active");
      bottomController = null;
    }
  };
  return bottomController;
}
