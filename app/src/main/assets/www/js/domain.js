export const REGIONS = [
  "서울", "경기", "인천", "부산", "대구", "광주특별시", "대전", "울산", "세종",
  "강원", "충북", "충남", "전북", "경북", "경남", "제주"
];

const REGION_ALIASES = Object.freeze({
  "광주": "광주특별시",
  "전남": "광주특별시",
  "전남광주통합특별시": "광주특별시",
  "전남광주특별시": "광주특별시"
});

export const NOTICE_TYPES = [
  "민간분양", "공공분양", "공공임대", "민간임대", "오피스텔", "무순위", "임의공급"
];

export const THIRD_NEW_TOWN_PROGRAM_ID = "third-new-town";

export const THIRD_NEW_TOWN_DISTRICTS = Object.freeze([
  { id: "namyangju-wangsuk", label: "남양주 왕숙·왕숙2", tokens: ["남양주", "왕숙"], fieldPatterns: ["남양주왕숙", "왕숙2"], allowCrossField: true },
  { id: "hanam-gyosan", label: "하남 교산", tokens: ["하남", "교산"], fieldPatterns: ["하남교산"], allowCrossField: true },
  { id: "incheon-gyeyang", label: "인천 계양", tokens: ["인천", "계양"], fieldPatterns: ["인천계양", "계양신도시", "계양테크노밸리"], allowCrossField: false },
  { id: "goyang-changneung", label: "고양 창릉", tokens: ["고양", "창릉"], fieldPatterns: ["고양창릉"], allowCrossField: true },
  { id: "bucheon-daejang", label: "부천 대장", tokens: ["부천", "대장"], fieldPatterns: ["부천대장"], allowCrossField: true }
]);

export const DEFAULT_WATCH_PROFILE = Object.freeze({
  enabled: false,
  regions: [],
  types: [],
  newNotice: true,
  deadline3: true,
  deadline1: true,
  deadlineToday: true,
  confirmedAt: null
});

export function parseDate(value) {
  if (!value) return null;
  const match = String(value).trim().match(/^(\d{4})[-./]?(\d{2})[-./]?(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) return null;
  const normalized = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  return normalized === `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` ? date : null;
}

export function toDateKey(value) {
  const date = value instanceof Date ? value : parseDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function todayKey(now = new Date()) {
  return toDateKey(now);
}

export function daysBetween(from, to) {
  const start = parseDate(typeof from === "string" ? from : toDateKey(from));
  const end = parseDate(typeof to === "string" ? to : toDateKey(to));
  if (!start || !end) return null;
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

function normaliseSearchText(value) {
  return String(value || "")
    .toLocaleLowerCase("ko-KR")
    .replace(/[\s·._()\[\]{}\-/]+/g, "");
}

function noticeSearchFields(notice) {
  return [
    notice.title,
    notice.region,
    notice.district,
    notice.address,
    notice.type,
    notice.subtype,
    notice.sourceName,
    notice.provider,
    notice.programName,
    notice.programDistrict,
    ...(Array.isArray(notice.tags) ? notice.tags : [])
  ].filter(Boolean).map(normaliseSearchText);
}

function noticeSearchText(notice) {
  return noticeSearchFields(notice).join("");
}

export function classifyThirdNewTown(notice = {}) {
  const declared = THIRD_NEW_TOWN_DISTRICTS.find((district) => district.id === notice.programDistrictId);
  if (notice.program === THIRD_NEW_TOWN_PROGRAM_ID && declared) return declared;
  const fields = noticeSearchFields(notice);
  const text = fields.join("");
  return THIRD_NEW_TOWN_DISTRICTS.find((district) =>
    district.fieldPatterns.some((pattern) => fields.some((field) => field.includes(pattern)))
    || (district.allowCrossField && district.tokens.every((token) => text.includes(token)))
  ) || null;
}

export function getNoticePhase(notice, now = new Date()) {
  const today = todayKey(now);
  if (notice.dataKind === "supply_plan") {
    const planMonth = String(notice.supplyPlanMonth || "");
    if (/^\d{4}-\d{2}$/.test(planMonth) && planMonth < today.slice(0, 7)) {
      return { id: "closed", label: "계획 시점 경과", tone: "muted" };
    }
    return { id: "planned", label: "공급계획", tone: "plan" };
  }
  const start = notice.applyStart || notice.specialStart || "";
  const end = notice.applyEnd || notice.specialEnd || "";
  const published = notice.publishedAt || "";
  if (end && end < today) return { id: "closed", label: "접수 마감", tone: "muted" };
  if (start && start <= today && (!end || end >= today)) return { id: "open", label: "오늘 접수", tone: "hot" };
  if (start && start > today) return { id: "upcoming", label: "접수 예정", tone: "rose" };
  if (published && published <= today) return { id: "announced", label: "새 공고", tone: "navy" };
  return { id: "unknown", label: "일정 확인", tone: "muted" };
}

export function getDday(date, now = new Date()) {
  const days = daysBetween(todayKey(now), date);
  if (days === null) return "";
  if (days === 0) return "D-DAY";
  if (days > 0) return `D-${days}`;
  return `D+${Math.abs(days)}`;
}

export function matchesWatchProfile(notice, profile) {
  if (!profile?.enabled) return false;
  const regions = Array.isArray(profile.regions) ? profile.regions : [];
  const types = Array.isArray(profile.types) ? profile.types : [];
  const regionMatch = !regions.length || regions.includes(notice.region);
  const typeMatch = !types.length || types.includes(notice.type) || types.includes(notice.subtype);
  return regionMatch && typeMatch;
}

export function filterNotices(notices, filters = {}, now = new Date()) {
  const query = normaliseSearchText(filters.query);
  const thirdNewTownQuery = /(?:제)?3기신도시/.test(query) || /^(?:제)?3기(?:청약)?$/.test(query);
  const residualQuery = thirdNewTownQuery
    ? query.replace(/(?:제)?3기신도시/g, "").replace(/^(?:제)?3기/g, "").replace(/^청약|청약$/g, "")
    : query;
  return notices.filter((notice) => {
    const thirdNewTown = classifyThirdNewTown(notice);
    if (filters.region && filters.region !== "전체" && notice.region !== filters.region) return false;
    if (filters.type && filters.type !== "전체" && notice.type !== filters.type && notice.subtype !== filters.type) return false;
    if (filters.program === THIRD_NEW_TOWN_PROGRAM_ID && !thirdNewTown) return false;
    const phase = getNoticePhase(notice, now).id;
    if (filters.phase === "active" && !["open", "upcoming", "announced", "planned"].includes(phase)) return false;
    if (filters.phase && !["all", "active"].includes(filters.phase) && phase !== filters.phase) return false;
    if (filters.savedIds && !filters.savedIds.has(notice.id)) return false;
    if (!query) return true;
    if (thirdNewTownQuery && !thirdNewTown) return false;
    if (!residualQuery) return true;
    return noticeSearchText(notice).includes(residualQuery);
  });
}

export function sortNotices(notices, mode = "deadline", now = new Date()) {
  const today = todayKey(now);
  const futureScore = (notice) => {
    const date = notice.applyEnd || notice.applyStart || (notice.supplyPlanMonth ? `${notice.supplyPlanMonth}-01` : "") || notice.publishedAt || "9999-12-31";
    return date < today ? `9999-${date}` : date;
  };
  return [...notices].sort((a, b) => {
    if (mode === "recent") return String(b.publishedAt || "").localeCompare(String(a.publishedAt || ""));
    if (mode === "title") return String(a.title).localeCompare(String(b.title), "ko-KR");
    return futureScore(a).localeCompare(futureScore(b)) || String(b.publishedAt || "").localeCompare(String(a.publishedAt || ""));
  });
}

export function formatKoreanDate(value, options = {}) {
  const date = parseDate(value);
  if (!date) return "일정 미정";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: options.year === false ? undefined : "numeric",
    month: "long",
    day: "numeric",
    weekday: options.weekday ? "short" : undefined
  }).format(date);
}

export function formatKoreanMonth(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return "일정 미정";
  return `${Number(match[1])}년 ${Number(match[2])}월`;
}

export function formatPrice(amountTenThousand) {
  const amount = Number(amountTenThousand);
  if (!Number.isFinite(amount) || amount <= 0) return "분양가 원문 확인";
  const eok = Math.floor(amount / 10_000);
  const man = Math.round(amount % 10_000);
  if (!eok) return `${man.toLocaleString("ko-KR")}만원`;
  return man ? `${eok}억 ${man.toLocaleString("ko-KR")}만원` : `${eok}억원`;
}

export function buildCalendarEvents(notices) {
  const events = [];
  notices.forEach((notice) => {
    [
      ["publishedAt", "모집공고", "notice"],
      ["specialStart", "특별공급 시작", "start"],
      ["applyStart", "청약 접수 시작", "start"],
      ["applyEnd", "청약 접수 마감", "deadline"],
      ["winnerDate", "당첨자 발표", "winner"]
    ].forEach(([field, label, kind]) => {
      if (!notice[field]) return;
      events.push({ date: notice[field], label, kind, notice });
    });
  });
  return events.sort((a, b) => a.date.localeCompare(b.date));
}

function escapeIcs(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function icsDate(value) {
  return String(value || "").replaceAll("-", "");
}

export function createNoticeIcs(notice) {
  if (notice.dataKind === "supply_plan") return "";
  const start = notice.applyStart || notice.publishedAt;
  const end = notice.applyEnd || start;
  if (!start) return "";
  const endDate = parseDate(end);
  endDate?.setDate(endDate.getDate() + 1);
  const uid = `${notice.id}@cheongyakhannun.softm.net`.replace(/[^A-Za-z0-9@._-]/g, "-");
  const description = `${notice.sourceName || "공식기관"} 공고입니다. 자격과 일정은 기관 원문에서 최종 확인하세요.`;
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//softm//Cheongyak Hannun//KO",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`,
    `DTSTART;VALUE=DATE:${icsDate(start)}`,
    `DTEND;VALUE=DATE:${icsDate(toDateKey(endDate || end))}`,
    `SUMMARY:${escapeIcs(`[청약한눈] ${notice.title}`)}`,
    `DESCRIPTION:${escapeIcs(description)}`,
    `URL:${escapeIcs(notice.officialUrl || "")}`,
    "END:VEVENT",
    "END:VCALENDAR",
    ""
  ].join("\r\n");
}

export function sanitizeWatchProfile(value = {}) {
  const regions = [...new Set((Array.isArray(value.regions) ? value.regions : [])
    .map((item) => REGION_ALIASES[item] || item)
    .filter((item) => REGIONS.includes(item)))];
  const types = [...new Set((Array.isArray(value.types) ? value.types : []).filter((item) => NOTICE_TYPES.includes(item)))];
  return {
    enabled: Boolean(value.enabled),
    regions,
    types,
    newNotice: value.newNotice !== false,
    deadline3: value.deadline3 !== false,
    deadline1: value.deadline1 !== false,
    deadlineToday: value.deadlineToday !== false,
    confirmedAt: typeof value.confirmedAt === "string" ? value.confirmedAt : null
  };
}
