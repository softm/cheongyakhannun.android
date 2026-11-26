export const REGIONS = [
  "서울", "경기", "인천", "부산", "대구", "광주", "대전", "울산", "세종",
  "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"
];

export const NOTICE_TYPES = [
  "민간분양", "공공분양", "공공임대", "민간임대", "오피스텔", "무순위", "임의공급"
];

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

export function getNoticePhase(notice, now = new Date()) {
  const today = todayKey(now);
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
  const query = String(filters.query || "").trim().toLocaleLowerCase("ko-KR");
  return notices.filter((notice) => {
    if (filters.region && filters.region !== "전체" && notice.region !== filters.region) return false;
    if (filters.type && filters.type !== "전체" && notice.type !== filters.type && notice.subtype !== filters.type) return false;
    const phase = getNoticePhase(notice, now).id;
    if (filters.phase === "active" && !["open", "upcoming", "announced"].includes(phase)) return false;
    if (filters.phase && !["all", "active"].includes(filters.phase) && phase !== filters.phase) return false;
    if (filters.savedIds && !filters.savedIds.has(notice.id)) return false;
    if (!query) return true;
    const haystack = [notice.title, notice.region, notice.district, notice.address, notice.type, notice.subtype, notice.sourceName]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("ko-KR");
    return haystack.includes(query);
  });
}

export function sortNotices(notices, mode = "deadline", now = new Date()) {
  const today = todayKey(now);
  const futureScore = (notice) => {
    const date = notice.applyEnd || notice.applyStart || notice.publishedAt || "9999-12-31";
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
  const regions = [...new Set((Array.isArray(value.regions) ? value.regions : []).filter((item) => REGIONS.includes(item)))];
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
