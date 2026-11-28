import {
  REGIONS,
  NOTICE_TYPES,
  DEFAULT_WATCH_PROFILE,
  THIRD_NEW_TOWN_PROGRAM_ID,
  buildCalendarEvents,
  classifyThirdNewTown,
  createNoticeIcs,
  filterNotices,
  formatKoreanDate,
  formatKoreanMonth,
  formatPrice,
  getDday,
  getNoticePhase,
  matchesWatchProfile,
  parseDate,
  sanitizeWatchProfile,
  sortNotices,
  todayKey,
  toDateKey
} from "./domain.js";
import { mountBottomAd } from "./adfit.js";

const STORAGE = {
  watch: "cheongyakhannun:watch:v1",
  saved: "cheongyakhannun:saved:v1",
  seen: "cheongyakhannun:seen:v1",
  checklist: "cheongyakhannun:checklist:v1"
};
const urlParams = new URLSearchParams(location.search);
const allowedPhases = new Set(["active", "open", "upcoming", "announced", "planned", "closed", "all"]);

const state = {
  envelope: { status: "loading", notices: [], sources: [] },
  notices: [],
  view: "feed",
  region: urlParams.get("region") || "전체",
  type: urlParams.get("type") || "전체",
  program: urlParams.get("program") === THIRD_NEW_TOWN_PROGRAM_ID ? THIRD_NEW_TOWN_PROGRAM_ID : "all",
  phase: allowedPhases.has(urlParams.get("phase")) ? urlParams.get("phase") : "active",
  query: urlParams.get("q") || "",
  sort: ["deadline", "recent", "title"].includes(urlParams.get("sort")) ? urlParams.get("sort") : "deadline",
  saved: new Set(readJson(STORAGE.saved, [])),
  seen: new Set(readJson(STORAGE.seen, [])),
  watch: sanitizeWatchProfile(readJson(STORAGE.watch, DEFAULT_WATCH_PROFILE)),
  calendarEvents: [],
  calendarMonth: new Date(),
  selectedDate: todayKey(),
  visibleCount: 24,
  deferredInstallPrompt: null,
  demo: urlParams.get("demo") === "1"
};

const els = {};
let toastTimer = 0;

document.addEventListener("DOMContentLoaded", init);
window.setTimeout(hideSplash, 5000);

async function init() {
  bindElements();
  els.searchInput.value = state.query;
  els.sortSelect.value = state.sort;
  renderWatchChoices();
  restoreChecklist();
  bindEvents();
  configureWatchMode();
  configureInstallEntry();
  mountBottomAd();
  setInitialView();
  document.querySelector("#todayDate").textContent = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "short", timeZone: "Asia/Seoul" }).format(new Date());
  try {
    await loadData();
    renderAll();
    await notifyNewMatches();
  } catch (error) {
    console.error(error);
    state.envelope = { status: "error", generatedAt: null, notices: [], sources: [] };
    state.notices = [];
    renderAll();
  } finally {
    window.setTimeout(hideSplash, 280);
  }
  registerServiceWorker();
}

function bindElements() {
  [
    "dataBanner", "dataStatusTitle", "dataStatusCopy", "noticeGrid", "noticeEmpty", "savedGrid", "savedEmpty",
    "resultSummary", "sortSelect", "searchForm", "searchInput", "programFilters", "regionFilters", "typeFilters", "phaseFilters", "watchDialog",
    "watchForm", "watchRegions", "watchTypes", "watchTitle", "watchSummary", "permissionNote", "detailDialog",
    "detailContent", "detailSource", "detailDialogTitle", "sourceDialog", "sourceStatusList", "calendarGrid",
    "calendarEvents", "calendarTitle", "savedCountBadge", "deadlineList", "toast", "installButton", "installDialog",
    "installGuide", "prepareChecklist", "loadMoreButton"
  ].forEach((id) => { els[id] = document.getElementById(id); });
}

function bindEvents() {
  ["openWatchButton", "heroWatchButton", "sideWatchButton"].forEach((id) => document.getElementById(id)?.addEventListener("click", openWatchDialog));
  document.getElementById("heroCalendarButton")?.addEventListener("click", () => setView("calendar", { scroll: true }));
  document.getElementById("dataStatusAction")?.addEventListener("click", openSourceDialog);
  document.getElementById("sourceButton")?.addEventListener("click", openSourceDialog);
  document.getElementById("footerSourceButton")?.addEventListener("click", openSourceDialog);
  document.getElementById("closeSourceButton")?.addEventListener("click", () => els.sourceDialog.close());
  document.getElementById("closeWatchButton")?.addEventListener("click", () => els.watchDialog.close());
  document.getElementById("closeDetailButton")?.addEventListener("click", () => els.detailDialog.close());
  document.getElementById("closeInstallButton")?.addEventListener("click", () => els.installDialog.close());
  document.getElementById("installButton")?.addEventListener("click", handleInstallClick);

  document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view, { scroll: true })));
  document.querySelector("[role=tablist]")?.addEventListener("keydown", handleTabKeydown);
  document.querySelectorAll("[data-view-target]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.viewTarget, { scroll: true })));
  document.querySelectorAll("[data-quick-phase]").forEach((button) => button.addEventListener("click", () => {
    state.phase = button.dataset.quickPhase;
    state.region = "전체";
    state.type = "전체";
    state.program = "all";
    state.visibleCount = 24;
    setView("feed");
    renderFilters();
    renderFeed();
    document.querySelector("#feedView")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }));

  els.searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    state.query = els.searchInput.value.trim();
    state.visibleCount = 24;
    renderFeed();
  });
  els.searchInput.addEventListener("input", () => {
    state.query = els.searchInput.value.trim();
    state.visibleCount = 24;
    renderFeed();
  });
  els.sortSelect.addEventListener("change", () => { state.sort = els.sortSelect.value; state.visibleCount = 24; renderFeed(); });
  els.loadMoreButton.addEventListener("click", () => { state.visibleCount += 24; renderFeed(); });
  document.getElementById("resetFiltersButton")?.addEventListener("click", resetFilters);
  document.getElementById("emptyResetButton")?.addEventListener("click", resetFilters);

  [els.noticeGrid, els.savedGrid].forEach((grid) => grid.addEventListener("click", handleNoticeGridClick));
  els.deadlineList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-notice-id]");
    if (button) openDetail(button.dataset.noticeId);
  });
  els.calendarEvents.addEventListener("click", (event) => {
    const button = event.target.closest("[data-notice-id]");
    if (button) openDetail(button.dataset.noticeId);
  });
  document.getElementById("prevMonth")?.addEventListener("click", () => shiftMonth(-1));
  document.getElementById("nextMonth")?.addEventListener("click", () => shiftMonth(1));

  els.watchForm.addEventListener("submit", handleWatchSubmit);
  document.getElementById("disableWatchButton")?.addEventListener("click", disableWatch);
  els.prepareChecklist.addEventListener("change", persistChecklist);
  window.addEventListener("popstate", () => setView(new URLSearchParams(location.search).get("view") || "feed", { history: false }));
}

async function loadData() {
  const file = state.demo ? "./data/sample-notices.json" : "./data/notices.json";
  const response = await fetch(`${file}?t=${Date.now()}`, { cache: "no-store", headers: { "Cache-Control": "no-cache" } });
  if (!response.ok) throw new Error(`Notice data HTTP ${response.status}`);
  const envelope = await response.json();
  if (!Array.isArray(envelope.notices)) throw new Error("Invalid notice data envelope");
  state.envelope = envelope;
  state.notices = envelope.notices.filter((notice) => notice?.id && notice?.title);
  state.calendarEvents = buildCalendarEvents(state.notices);
  const nearest = state.calendarEvents.find((event) => event.date >= todayKey()) || state.calendarEvents.at(-1);
  if (nearest) {
    const date = parseDate(nearest.date);
    state.calendarMonth = date || new Date();
    state.selectedDate = nearest.date;
  }
}

function renderAll() {
  renderDataStatus();
  renderFilters();
  renderSummary();
  renderFeed();
  renderSaved();
  renderWatchSummary();
  renderDeadlines();
  renderCalendar();
  renderSourceStatus();
}

function renderDataStatus() {
  const status = state.envelope.status;
  const count = state.notices.length;
  els.dataBanner.className = "data-banner";
  if (state.demo) {
    els.dataBanner.classList.add("warning");
    els.dataStatusTitle.textContent = "화면 검증용 데모 데이터";
    els.dataStatusCopy.textContent = "실제 공고가 아니며 기능·디자인 확인에만 사용합니다.";
    return;
  }
  if (status === "ready") {
    const age = dataAgeHours(state.envelope.generatedAt);
    if (age !== null && age >= 24) {
      els.dataBanner.classList.add("warning");
      els.dataStatusTitle.textContent = `공식 공고 ${count.toLocaleString("ko-KR")}건 · 갱신 지연`;
      els.dataStatusCopy.textContent = `${relativeDataAge(age)} 마지막 확인 · 신청 전 기관 원문을 확인하세요.`;
      return;
    }
    els.dataStatusTitle.textContent = `공식 공고 ${count.toLocaleString("ko-KR")}건 확인`;
    els.dataStatusCopy.textContent = age === null ? "갱신 기준 확인 중" : `${relativeDataAge(age)} 갱신`;
    return;
  }
  if (status === "partial") {
    els.dataBanner.classList.add("warning");
    els.dataStatusTitle.textContent = `일부 공식 공고 ${count.toLocaleString("ko-KR")}건 확인`;
    els.dataStatusCopy.textContent = "연결되지 않은 기관은 출처 상태에서 확인하세요.";
    return;
  }
  if (status === "awaiting_credentials") {
    els.dataBanner.classList.add("warning");
    els.dataStatusTitle.textContent = "공식 데이터 연결 준비 중";
    els.dataStatusCopy.textContent = "공공데이터 인증키 연결 전이며 오래된 공고를 최신처럼 표시하지 않습니다.";
    return;
  }
  els.dataBanner.classList.add("error");
  els.dataStatusTitle.textContent = "공식 공고를 불러오지 못했어요";
  els.dataStatusCopy.textContent = "기관 원문은 계속 이용할 수 있습니다.";
}

function dataAgeHours(value) {
  const timestamp = Date.parse(value || "");
  return Number.isFinite(timestamp) ? Math.max(0, (Date.now() - timestamp) / 3_600_000) : null;
}

function relativeDataAge(hours) {
  if (hours < 1) return "1시간 이내";
  if (hours < 24) return `${Math.floor(hours)}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

function renderSummary() {
  const phases = state.notices.reduce((counts, notice) => {
    counts[getNoticePhase(notice).id] = (counts[getNoticePhase(notice).id] || 0) + 1;
    return counts;
  }, {});
  document.getElementById("openCount").textContent = phases.open || 0;
  document.getElementById("upcomingCount").textContent = phases.upcoming || 0;
  document.getElementById("newCount").textContent = phases.announced || 0;
  const matched = state.notices.filter((notice) => matchesWatchProfile(notice, state.watch));
  const firstDeadline = sortNotices(matched.length ? matched : state.notices).find((notice) => notice.applyEnd && notice.applyEnd >= todayKey());
  document.getElementById("todayHeadline").textContent = firstDeadline
    ? `${firstDeadline.region} ${firstDeadline.title}, ${getDday(firstDeadline.applyEnd)} 마감`
    : state.notices.length
      ? "새 공고와 접수 일정을 확인해 보세요"
      : "공식 공고 연결 상태를 확인해 주세요";
  document.getElementById("todayNote").textContent = state.watch.enabled
    ? `${watchLabel(state.watch)} 조건으로 ${matched.length.toLocaleString("ko-KR")}건을 보고 있어요.`
    : "관심조건을 설정하면 나에게 맞는 공고만 알려드려요.";
}

function renderFilters() {
  const programs = [["all", "전체 청약"], [THIRD_NEW_TOWN_PROGRAM_ID, "3기 신도시"]];
  els.programFilters.innerHTML = programs.map(([value, label]) => `<button type="button" class="${state.program === value ? "active" : ""}" aria-pressed="${state.program === value}" data-program="${value}">${label}</button>`).join("");
  els.programFilters.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => { state.program = button.dataset.program; state.visibleCount = 24; renderFilters(); renderFeed(); }));
  const availableRegions = [...new Set(state.notices.map((notice) => notice.region).filter(Boolean))];
  const regions = ["전체", ...REGIONS.filter((region) => availableRegions.includes(region)), ...availableRegions.filter((region) => !REGIONS.includes(region))];
  els.regionFilters.innerHTML = regions.map((region) => `<button type="button" class="${state.region === region ? "active" : ""}" aria-pressed="${state.region === region}" data-region="${escapeAttribute(region)}">${escapeHtml(region)}</button>`).join("");
  els.regionFilters.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => { state.region = button.dataset.region; state.visibleCount = 24; renderFilters(); renderFeed(); }));
  const featuredTypes = ["전체", "민간분양", "공공분양", "공공임대", "무순위", "오피스텔", "민간임대"];
  els.typeFilters.innerHTML = featuredTypes.map((type) => `<button type="button" class="${state.type === type ? "active" : ""}" aria-pressed="${state.type === type}" data-type="${escapeAttribute(type)}">${escapeHtml(type)}</button>`).join("");
  els.typeFilters.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => { state.type = button.dataset.type; state.visibleCount = 24; renderFilters(); renderFeed(); }));
  const phases = [["active", "진행·예정"], ["open", "접수중"], ["upcoming", "접수예정"], ["announced", "새 공고"], ["planned", "공급계획"], ["closed", "지난 항목"], ["all", "전체"]];
  els.phaseFilters.innerHTML = phases.map(([value, label]) => `<button type="button" class="${state.phase === value ? "active" : ""}" aria-pressed="${state.phase === value}" data-phase="${value}">${label}</button>`).join("");
  els.phaseFilters.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => { state.phase = button.dataset.phase; state.visibleCount = 24; renderFilters(); renderFeed(); }));
}

function renderFeed() {
  const filtered = sortNotices(filterNotices(state.notices, {
    region: state.region,
    type: state.type,
    program: state.program,
    phase: state.phase,
    query: state.query
  }), state.sort);
  const visible = filtered.slice(0, state.visibleCount);
  els.noticeGrid.innerHTML = visible.map(renderNoticeCard).join("");
  els.noticeEmpty.hidden = filtered.length > 0;
  els.loadMoreButton.hidden = visible.length >= filtered.length;
  els.loadMoreButton.textContent = `공고 더 보기 (${(filtered.length - visible.length).toLocaleString("ko-KR")}개 남음)`;
  const itemLabel = filtered.some((notice) => notice.dataKind === "supply_plan") ? "공고·계획" : "공고";
  els.resultSummary.textContent = `${filtered.length.toLocaleString("ko-KR")}개 ${itemLabel}${visible.length < filtered.length ? ` · ${visible.length.toLocaleString("ko-KR")}개 표시` : ""}${state.program === THIRD_NEW_TOWN_PROGRAM_ID ? " · 3기 신도시" : ""}${state.phase !== "all" ? ` · ${phaseLabel(state.phase)}` : ""}`;
  syncBrowseUrl();
}

function renderSaved() {
  const saved = sortNotices(state.notices.filter((notice) => state.saved.has(notice.id)));
  els.savedGrid.innerHTML = saved.map(renderNoticeCard).join("");
  els.savedEmpty.hidden = saved.length > 0;
  els.savedCountBadge.textContent = String(saved.length);
  persistJson(STORAGE.saved, [...state.saved]);
}

function renderNoticeCard(notice) {
  const phase = getNoticePhase(notice);
  const date = notice.applyEnd || notice.applyStart || notice.publishedAt;
  const saved = state.saved.has(notice.id);
  const isSupplyPlan = notice.dataKind === "supply_plan";
  const thirdNewTown = classifyThirdNewTown(notice);
  const tags = [...new Set([...(thirdNewTown ? ["3기 신도시", thirdNewTown.label] : []), ...(notice.tags || [])])].slice(0, 3);
  const firstScheduleLabel = isSupplyPlan ? "공급 예정" : "접수 기간";
  const firstScheduleValue = isSupplyPlan ? formatKoreanMonth(notice.supplyPlanMonth) : formatDateRange(notice.applyStart, notice.applyEnd);
  const secondScheduleLabel = isSupplyPlan ? "공고 상태" : "당첨 발표";
  const secondScheduleValue = isSupplyPlan ? "모집공고 전 계획" : notice.winnerDate ? formatKoreanDate(notice.winnerDate, { year: false }) : "원문 확인";
  const footer = isSupplyPlan
    ? `${Number(notice.supplyUnits || notice.totalUnits || 0).toLocaleString("ko-KR")}호 공급 계획 · ${formatSupplyAreas(notice.supplyAreas)}`
    : `${notice.totalUnits ? `${Number(notice.totalUnits).toLocaleString("ko-KR")}세대` : notice.provider || "공식 공고"} · ${formatPrice(notice.maxPriceTenThousand)}`;
  return `
    <article class="notice-card ${isSupplyPlan ? "supply-plan" : ""} ${notice.stale ? "stale" : ""}" data-card-id="${escapeAttribute(notice.id)}">
      <button class="notice-open" type="button" data-open-notice="${escapeAttribute(notice.id)}" aria-label="${escapeAttribute(notice.title)} 상세 보기">
        <span class="card-topline">
          <span class="card-badges"><span class="badge phase ${phase.tone}">${escapeHtml(phase.label)}</span><span class="badge source">${escapeHtml(notice.sourceName || "공식기관")}</span></span>
          <span class="dday">${isSupplyPlan ? "" : escapeHtml(getDday(date))}</span>
        </span>
        <h3>${escapeHtml(notice.title)}</h3>
        <p class="card-location">${escapeHtml([notice.region, notice.district, notice.type].filter(Boolean).join(" · "))}</p>
        <span class="card-schedule">
          <span class="schedule-cell"><small>${firstScheduleLabel}</small><strong>${escapeHtml(firstScheduleValue)}</strong></span>
          <span class="schedule-cell"><small>${secondScheduleLabel}</small><strong>${escapeHtml(secondScheduleValue)}</strong></span>
        </span>
        <span class="tag-row">${tags.map((tag) => `<span>#${escapeHtml(tag)}</span>`).join("")}</span>
      </button>
      <footer class="card-footer"><span>${escapeHtml(footer)}</span><button class="save-button ${saved ? "saved" : ""}" type="button" data-save-notice="${escapeAttribute(notice.id)}" aria-label="${saved ? "관심 항목에서 삭제" : "관심 항목으로 저장"}" aria-pressed="${saved}">${saved ? "♥" : "♡"}</button></footer>
    </article>`;
}

function handleNoticeGridClick(event) {
  const save = event.target.closest("[data-save-notice]");
  if (save) {
    toggleSaved(save.dataset.saveNotice);
    return;
  }
  const open = event.target.closest("[data-open-notice]");
  if (open) openDetail(open.dataset.openNotice);
}

function toggleSaved(id) {
  if (state.saved.has(id)) {
    state.saved.delete(id);
    showToast("관심 공고에서 뺐어요.");
  } else {
    state.saved.add(id);
    showToast("관심 공고에 저장했어요.");
  }
  renderFeed();
  renderSaved();
}

function openDetail(id) {
  const notice = state.notices.find((item) => item.id === id);
  if (!notice) return;
  const phase = getNoticePhase(notice);
  const date = notice.applyEnd || notice.applyStart || notice.publishedAt;
  const isSupplyPlan = notice.dataKind === "supply_plan";
  const thirdNewTown = classifyThirdNewTown(notice);
  els.detailSource.textContent = `${notice.sourceName || "공식기관"} · ${notice.region || "전국"}`;
  els.detailDialogTitle.textContent = notice.title;
  els.detailContent.innerHTML = `
    <section class="detail-hero">
      <div class="detail-badges"><span class="badge phase ${phase.tone}">${escapeHtml(phase.label)}</span><span class="badge">${escapeHtml(notice.type || "공고")}</span>${thirdNewTown ? '<span class="badge program">3기 신도시</span>' : ""}${notice.stale ? '<span class="badge">이전 수집본</span>' : ""}</div>
      <h3 class="detail-title">${escapeHtml(notice.title)}</h3>
      <p class="detail-address">${escapeHtml(notice.address || [notice.region, notice.district].filter(Boolean).join(" ") || "주소 원문 확인")}</p>
      <div class="detail-primary-date"><span><small>${isSupplyPlan ? "공급 예정 시기" : "접수 기간"}</small><strong>${escapeHtml(isSupplyPlan ? formatKoreanMonth(notice.supplyPlanMonth) : formatDateRange(notice.applyStart, notice.applyEnd))}</strong></span>${isSupplyPlan ? "" : `<b>${escapeHtml(getDday(date))}</b>`}</div>
    </section>
    <section class="detail-section"><h3>${isSupplyPlan ? "공급계획" : "중요 일정"}</h3><div class="timeline">
      ${isSupplyPlan ? renderTimelineMonthRow("공급 예정", notice.supplyPlanMonth) : `
        ${renderTimelineRow("모집공고", notice.publishedAt)}
        ${renderTimelineRow("특별공급", notice.specialStart, notice.specialEnd)}
        ${renderTimelineRow("청약 접수", notice.applyStart, notice.applyEnd)}
        ${renderTimelineRow("당첨자 발표", notice.winnerDate)}
        ${renderTimelineRow("계약", notice.contractStart, notice.contractEnd)}`}
    </div></section>
    <section class="detail-section"><h3>공급 정보</h3><div class="detail-facts">
      ${renderFact("주택 유형", [notice.type, notice.subtype].filter(Boolean).join(" · ") || "원문 확인")}
      ${renderFact(isSupplyPlan ? "계획 공급" : "공급 세대", isSupplyPlan ? `${Number(notice.supplyUnits || notice.totalUnits || 0).toLocaleString("ko-KR")}호` : notice.totalUnits ? `${Number(notice.totalUnits).toLocaleString("ko-KR")}세대` : "원문 확인")}
      ${isSupplyPlan ? renderFact("전용면적", formatSupplyAreas(notice.supplyAreas)) : renderFact("최고 분양가", formatPrice(notice.maxPriceTenThousand))}
      ${isSupplyPlan ? renderFact("비고", notice.planNote || "원문 확인") : renderFact("입주 예정", notice.moveIn || "원문 확인")}
      ${renderFact("시행·공급", notice.provider || "원문 확인")}
      ${renderFact("문의", notice.contact || "기관 원문 확인")}
    </div></section>
    <p class="detail-caution">${isSupplyPlan ? "LH 공급계획은 모집공고가 아니며 사업·공급 여건에 따라 시기와 물량이 바뀔 수 있습니다. 청약은 추후 공식 모집공고를 확인해야 합니다." : `청약 자격, 접수 시간, 공급금액과 일정 변경은 기관 원문이 최종 기준입니다.${notice.demo ? " 이 공고는 화면 검증용 예시입니다." : ""}`}</p>
    <div class="detail-actions">${isSupplyPlan ? "" : `<button type="button" data-calendar-download="${escapeAttribute(notice.id)}">캘린더에 저장</button>`}<a href="${escapeAttribute(safeOfficialUrl(notice.officialUrl))}" target="_blank" rel="noopener">${isSupplyPlan ? "LH 공급계획 확인" : "기관 원문 확인"}</a></div>`;
  els.detailContent.querySelector("[data-calendar-download]")?.addEventListener("click", () => downloadCalendar(notice));
  showDialog(els.detailDialog);
}

function renderTimelineRow(label, start, end = "") {
  if (!start && !end) return "";
  const value = start && end && start !== end ? formatDateRange(start, end) : formatKoreanDate(start || end, { weekday: true });
  return `<div class="timeline-row"><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong></div>`;
}

function renderTimelineMonthRow(label, month) {
  if (!month) return "";
  return `<div class="timeline-row"><small>${escapeHtml(label)}</small><strong>${escapeHtml(formatKoreanMonth(month))}</strong></div>`;
}

function renderFact(label, value) {
  return `<div class="detail-fact"><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong></div>`;
}

function downloadCalendar(notice) {
  const content = createNoticeIcs(notice);
  if (!content) { showToast("저장할 일정이 아직 없어요."); return; }
  const native = postNative({ type: "downloadText", name: `${safeFilename(notice.title)}.ics`, mime: "text/calendar", text: content });
  if (native) { showToast("캘린더 파일 저장 화면을 열었어요."); return; }
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${safeFilename(notice.title)}.ics`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("캘린더 파일을 저장했어요.");
}

function renderWatchChoices() {
  els.watchRegions.innerHTML = REGIONS.map((region) => `<label><input type="checkbox" name="region" value="${region}"><span>${region}</span></label>`).join("");
  els.watchTypes.innerHTML = NOTICE_TYPES.map((type) => `<label><input type="checkbox" name="type" value="${type}"><span>${type}</span></label>`).join("");
}

function openWatchDialog() {
  els.watchForm.querySelectorAll('input[name="region"]').forEach((input) => { input.checked = state.watch.regions.includes(input.value); });
  els.watchForm.querySelectorAll('input[name="type"]').forEach((input) => { input.checked = state.watch.types.includes(input.value); });
  els.watchForm.elements.newNotice.checked = state.watch.newNotice;
  els.watchForm.elements.deadline3.checked = state.watch.deadline3;
  els.watchForm.elements.deadline1.checked = state.watch.deadline1;
  els.permissionNote.textContent = isAndroidApp()
    ? "Android 앱이 약 6시간마다 공식 공고를 확인합니다. 시스템 절전 상태에 따라 알림 시각은 조금 늦어질 수 있어요."
    : "웹은 방문할 때 새 공고를 표시하고, 캘린더 저장으로 마감을 챙길 수 있어요. 웹이 닫혀 있을 때 푸시 알림을 보내지는 않습니다.";
  showDialog(els.watchDialog);
}

async function handleWatchSubmit(event) {
  event.preventDefault();
  const regions = [...els.watchForm.querySelectorAll('input[name="region"]:checked')].map((input) => input.value);
  const types = [...els.watchForm.querySelectorAll('input[name="type"]:checked')].map((input) => input.value);
  state.watch = sanitizeWatchProfile({
    enabled: true,
    regions,
    types,
    newNotice: els.watchForm.elements.newNotice.checked,
    deadline3: els.watchForm.elements.deadline3.checked,
    deadline1: els.watchForm.elements.deadline1.checked,
    deadlineToday: els.watchForm.elements.deadline1.checked,
    confirmedAt: new Date().toISOString()
  });
  persistJson(STORAGE.watch, state.watch);
  postNative({ type: "saveWatchProfile", profile: state.watch });
  if (isAndroidApp()) {
    postNative({ type: "requestNotificationPermission" });
  }
  const baseline = state.notices.filter((notice) => matchesWatchProfile(notice, state.watch)).map((notice) => notice.id);
  baseline.forEach((id) => state.seen.add(id));
  persistJson(STORAGE.seen, [...state.seen].slice(-1200));
  els.watchDialog.close();
  renderWatchSummary();
  renderSummary();
  showToast(isAndroidApp() ? "내 분양 알림 조건을 저장했어요." : "관심조건을 이 기기에 저장했어요.");
}

function disableWatch() {
  state.watch = sanitizeWatchProfile(DEFAULT_WATCH_PROFILE);
  persistJson(STORAGE.watch, state.watch);
  postNative({ type: "saveWatchProfile", profile: state.watch });
  els.watchDialog.close();
  renderWatchSummary();
  renderSummary();
  showToast("저장한 관심조건을 지웠어요.");
}

function renderWatchSummary() {
  if (!state.watch.enabled) {
    els.watchTitle.textContent = "아직 조건이 없어요";
    els.watchSummary.textContent = "관심 지역과 주택 유형을 선택해 새 공고와 마감 일정을 받아보세요.";
    return;
  }
  els.watchTitle.textContent = isAndroidApp() ? "알림이 준비됐어요" : "관심조건을 저장했어요";
  els.watchSummary.textContent = `${watchLabel(state.watch)} · 맞는 공고부터 보여드려요.`;
}

function configureWatchMode() {
  const label = document.getElementById("headerWatchLabel");
  const dialogTitle = document.getElementById("watchDialogTitle");
  const saveButton = document.getElementById("saveWatchButton");
  if (!isAndroidApp()) return;
  if (label) label.textContent = "알림 설정";
  if (dialogTitle) dialogTitle.textContent = "내 분양 알림";
  if (saveButton) saveButton.textContent = "알림 저장";
  document.getElementById("notificationOptions").hidden = false;
}

function watchLabel(profile) {
  const regions = profile.regions.length ? profile.regions.slice(0, 2).join("·") + (profile.regions.length > 2 ? ` 외 ${profile.regions.length - 2}` : "") : "전국";
  const types = profile.types.length ? profile.types.slice(0, 2).join("·") + (profile.types.length > 2 ? ` 외 ${profile.types.length - 2}` : "") : "모든 유형";
  return `${regions} · ${types}`;
}

function renderDeadlines() {
  const base = state.watch.enabled ? state.notices.filter((notice) => matchesWatchProfile(notice, state.watch)) : state.notices;
  const deadlines = sortNotices(base).filter((notice) => notice.applyEnd && notice.applyEnd >= todayKey()).slice(0, 3);
  els.deadlineList.innerHTML = deadlines.length ? deadlines.map((notice) => `<button class="deadline-item" type="button" data-notice-id="${escapeAttribute(notice.id)}"><span class="deadline-day">${escapeHtml(getDday(notice.applyEnd))}</span><span><strong>${escapeHtml(notice.title)}</strong><small>${escapeHtml(formatKoreanDate(notice.applyEnd, { year: false }))} 마감</small></span></button>`).join("") : '<p class="mini-empty">다가오는 접수 마감이 없어요.</p>';
}

function renderCalendar() {
  const month = state.calendarMonth;
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const first = new Date(year, monthIndex, 1);
  const last = new Date(year, monthIndex + 1, 0);
  const gridStart = new Date(year, monthIndex, 1 - first.getDay());
  const cells = Math.ceil((first.getDay() + last.getDate()) / 7) * 7;
  const eventMap = new Map();
  state.calendarEvents.forEach((event) => {
    if (!eventMap.has(event.date)) eventMap.set(event.date, []);
    eventMap.get(event.date).push(event);
  });
  els.calendarTitle.textContent = `${year}년 ${monthIndex + 1}월`;
  els.calendarGrid.innerHTML = Array.from({ length: cells }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    const key = toDateKey(date);
    const events = eventMap.get(key) || [];
    const classes = [date.getMonth() !== monthIndex ? "muted" : "", key === state.selectedDate ? "selected" : "", key === todayKey() ? "today" : ""].filter(Boolean).join(" ");
    return `<button type="button" class="calendar-day ${classes}" data-calendar-date="${key}" aria-label="${key}, 일정 ${events.length}개"><strong>${date.getDate()}</strong><span class="calendar-dots">${events.slice(0, 4).map((event) => `<i class="${event.kind}" aria-hidden="true"></i>`).join("")}</span></button>`;
  }).join("");
  els.calendarGrid.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => { state.selectedDate = button.dataset.calendarDate; renderCalendar(); }));
  renderCalendarEvents(eventMap.get(state.selectedDate) || []);
}

function renderCalendarEvents(events) {
  els.calendarEvents.innerHTML = `<div class="calendar-events-header"><strong>${escapeHtml(formatKoreanDate(state.selectedDate, { weekday: true }))}</strong><span>${events.length}개 일정</span></div>${events.length ? `<div class="calendar-event-list">${events.map((event) => `<button class="calendar-event" type="button" data-notice-id="${escapeAttribute(event.notice.id)}"><span class="calendar-event-date">${escapeHtml(event.label.replace("청약 ", ""))}</span><span><strong>${escapeHtml(event.notice.title)}</strong><small>${escapeHtml(event.notice.region)} · ${escapeHtml(event.notice.sourceName || "공식기관")}</small></span></button>`).join("")}</div>` : '<div class="calendar-empty">이날 등록된 청약 일정이 없어요.</div>'}`;
}

function shiftMonth(delta) {
  state.calendarMonth = new Date(state.calendarMonth.getFullYear(), state.calendarMonth.getMonth() + delta, 1);
  state.selectedDate = toDateKey(state.calendarMonth);
  renderCalendar();
}

function renderSourceStatus() {
  const labels = { ready: "정상", demo: "데모", partial: "일부", awaiting_credentials: "연결 필요", error: "확인 필요" };
  els.sourceStatusList.innerHTML = (state.envelope.sources || []).map((source) => {
    const tone = ["ready", "demo"].includes(source.status) ? "" : source.status === "error" ? "error" : "warning";
    return `<article class="source-status-item"><div><strong>${escapeHtml(source.name)}</strong><span class="${tone}">${escapeHtml(labels[source.status] || source.status)}</span></div><p>${escapeHtml(source.message || (source.fetchedAt ? `${formatTimestamp(source.fetchedAt)} 확인` : "상태 확인 중"))}</p><a href="${escapeAttribute(safeOfficialUrl(source.officialUrl))}" target="_blank" rel="noopener">공식 출처 확인</a></article>`;
  }).join("") || '<p class="mini-empty">출처 상태를 불러오지 못했습니다.</p>';
}

function openSourceDialog() { showDialog(els.sourceDialog); }

function setInitialView() {
  const requested = new URLSearchParams(location.search).get("view");
  setView(["feed", "calendar", "saved", "prepare"].includes(requested) ? requested : "feed", { history: false });
}

function setView(view, options = {}) {
  if (!["feed", "calendar", "saved", "prepare"].includes(view)) view = "feed";
  state.view = view;
  document.querySelectorAll("[data-view-panel]").forEach((panel) => { const active = panel.dataset.viewPanel === view; panel.hidden = !active; panel.classList.toggle("active", active); });
  document.querySelectorAll("[data-view]").forEach((button) => {
    const active = button.dataset.view === view;
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  });
  document.querySelectorAll(".bottom-nav [data-view-target]").forEach((button) => {
    const active = button.dataset.viewTarget === view;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current");
  });
  if (view === "calendar") renderCalendar();
  if (view === "saved") renderSaved();
  if (options.history !== false) {
    const url = new URL(location.href);
    if (view === "feed") url.searchParams.delete("view"); else url.searchParams.set("view", view);
    history.pushState({ view }, "", url);
  }
  const workspaceTop = document.querySelector(".workspace")?.offsetTop || 0;
  const activePanel = document.querySelector(`[data-view-panel="${view}"]`);
  const activeTop = activePanel ? Math.max(0, window.scrollY + activePanel.getBoundingClientRect().top - 84) : workspaceTop;
  window.scrollTo({ top: options.scroll ? activeTop : Math.min(window.scrollY, workspaceTop), behavior: "smooth" });
}

function handleTabKeydown(event) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const tabs = [...document.querySelectorAll('[role="tab"][data-view]')];
  const current = Math.max(0, tabs.indexOf(document.activeElement));
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  event.preventDefault();
  tabs[next].focus();
  setView(tabs[next].dataset.view);
}

function syncBrowseUrl() {
  const url = new URL(location.href);
  const setOrDelete = (key, value, defaultValue) => value && value !== defaultValue ? url.searchParams.set(key, value) : url.searchParams.delete(key);
  setOrDelete("region", state.region, "전체");
  setOrDelete("type", state.type, "전체");
  setOrDelete("program", state.program, "all");
  setOrDelete("phase", state.phase, "active");
  setOrDelete("sort", state.sort, "deadline");
  setOrDelete("q", state.query, "");
  history.replaceState(history.state, "", url);
}

function resetFilters() {
  state.region = "전체";
  state.type = "전체";
  state.program = "all";
  state.phase = "active";
  state.query = "";
  els.searchInput.value = "";
  state.visibleCount = 24;
  renderFilters();
  renderFeed();
}

function restoreChecklist() {
  const checked = new Set(readJson(STORAGE.checklist, []));
  els.prepareChecklist.querySelectorAll("input").forEach((input) => { input.checked = checked.has(input.value); });
}

function persistChecklist() {
  const checked = [...els.prepareChecklist.querySelectorAll("input:checked")].map((input) => input.value);
  persistJson(STORAGE.checklist, checked);
}

async function notifyNewMatches() {
  if (!state.watch.enabled) return;
  const matched = state.notices.filter((notice) => matchesWatchProfile(notice, state.watch));
  const fresh = matched.filter((notice) => !state.seen.has(notice.id));
  matched.forEach((notice) => state.seen.add(notice.id));
  persistJson(STORAGE.seen, [...state.seen].slice(-1200));
  if (!fresh.length || isAndroidApp()) return;
  showToast(`관심조건에 맞는 새 공고 ${fresh.length.toLocaleString("ko-KR")}건을 확인했어요.`);
}

function configureInstallEntry() {
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  if (standalone || isAndroidApp()) return;
  els.installButton.hidden = false;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.deferredInstallPrompt = event;
  });
  window.addEventListener("appinstalled", () => {
    state.deferredInstallPrompt = null;
    els.installButton.hidden = true;
    showToast("청약한눈을 홈 화면에 설치했어요.");
  });
}

async function handleInstallClick() {
  if (state.deferredInstallPrompt) {
    const prompt = state.deferredInstallPrompt;
    state.deferredInstallPrompt = null;
    await prompt.prompt();
    await prompt.userChoice.catch(() => null);
    return;
  }
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) {
    els.installGuide.innerHTML = "<p>Safari에서 아래 순서로 홈 화면에 추가할 수 있어요.</p><ol><li>하단의 공유 버튼을 누릅니다.</li><li><strong>홈 화면에 추가</strong>를 선택합니다.</li><li>오른쪽 위 <strong>추가</strong>를 누릅니다.</li></ol>";
  } else if (/SamsungBrowser/i.test(ua)) {
    els.installGuide.innerHTML = "<p>Samsung Internet 메뉴에서 설치할 수 있어요.</p><ol><li>브라우저 메뉴를 엽니다.</li><li><strong>현재 페이지 추가</strong>를 누릅니다.</li><li><strong>홈 화면</strong>을 선택합니다.</li></ol>";
  } else if (/Android/i.test(ua)) {
    els.installGuide.innerHTML = "<p>브라우저 메뉴에서 홈 화면에 추가할 수 있어요.</p><ol><li>오른쪽 위 메뉴를 엽니다.</li><li><strong>홈 화면에 추가</strong> 또는 <strong>앱 설치</strong>를 선택합니다.</li></ol>";
  } else {
    els.installGuide.innerHTML = "<p>주소창의 설치 아이콘이나 브라우저 메뉴를 이용하세요.</p><ol><li>브라우저 메뉴를 엽니다.</li><li><strong>청약한눈 설치</strong> 또는 <strong>앱 설치</strong>를 선택합니다.</li></ol>";
  }
  showDialog(els.installDialog);
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  try { await navigator.serviceWorker.register("./sw.js", { scope: "./" }); }
  catch (error) { console.warn("Service worker registration failed", error); }
}

function postNative(payload) {
  try {
    if (window.CheongyakNative?.postMessage) {
      window.CheongyakNative.postMessage(JSON.stringify(payload));
      return true;
    }
  } catch (error) { console.warn("Native bridge failed", error); }
  return false;
}

function isAndroidApp() {
  return /CheongyakHannunAndroid\/|AdMobNative\/1/i.test(navigator.userAgent);
}

function showDialog(dialog) {
  if (!dialog.open) dialog.showModal();
}

function hideSplash() {
  const splash = document.getElementById("bootSplash");
  if (!splash || splash.classList.contains("done")) return;
  splash.classList.add("done");
  window.setTimeout(() => splash.remove(), 350);
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add("show");
  toastTimer = window.setTimeout(() => els.toast.classList.remove("show"), 2600);
}

function formatDateRange(start, end) {
  if (!start && !end) return "기관 원문 확인";
  if (!end || start === end) return formatKoreanDate(start || end, { year: false, weekday: true });
  return `${formatKoreanDate(start, { year: false })} ~ ${formatKoreanDate(end, { year: false })}`;
}

function formatTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "갱신시각 미정";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function phaseLabel(id) {
  return ({ active: "진행·예정", open: "접수중", upcoming: "접수예정", announced: "새 공고", planned: "공급계획", closed: "지난 항목" })[id] || "전체";
}

function formatSupplyAreas(areas) {
  const values = Array.isArray(areas) ? areas.filter((value) => Number.isFinite(Number(value))) : [];
  return values.length ? `${values.map((value) => Number(value).toLocaleString("ko-KR")).join("·")}㎡` : "면적 원문 확인";
}

function safeOfficialUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : "https://www.applyhome.co.kr/";
  } catch { return "https://www.applyhome.co.kr/"; }
}

function safeFilename(value) {
  return String(value || "청약일정").replace(/[\\/:*?\"<>|]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "청약일정";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function escapeAttribute(value) { return escapeHtml(value).replace(/`/g, "&#96;"); }

function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}

function persistJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch { /* Storage can be unavailable in private browsing. */ }
}
