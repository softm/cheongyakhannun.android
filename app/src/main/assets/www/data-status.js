const $ = (selector) => document.querySelector(selector);
const formatCount = (value) => Number(value || 0).toLocaleString("ko-KR");
const statusLabels = { ready: "정상", partial: "일부 정상", awaiting_credentials: "인증 준비 중", error: "오류", demo: "데모" };

function safeOfficialUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : "#";
  } catch { return "#"; }
}

function dataAgeHours(value) {
  const timestamp = Date.parse(value || "");
  return Number.isFinite(timestamp) ? Math.max(0, (Date.now() - timestamp) / 3_600_000) : null;
}

function renderSources(sources, counts) {
  const body = $("#sources");
  body.replaceChildren(...sources.map((source) => {
    const row = document.createElement("tr");
    const name = document.createElement("td");
    const nameStrong = document.createElement("b");
    nameStrong.textContent = source.name || "공식기관";
    name.append(nameStrong);
    const status = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = `badge ${source.status === "error" ? "error" : ""}`;
    badge.textContent = statusLabels[source.status] || source.status || "확인 중";
    status.append(badge);
    const count = document.createElement("td");
    count.textContent = `${formatCount(counts[source.id])}건`;
    const message = document.createElement("td");
    message.textContent = source.message || "상태 확인 중";
    const linkCell = document.createElement("td");
    const link = document.createElement("a");
    link.href = safeOfficialUrl(source.officialUrl);
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "공식 출처";
    linkCell.append(link);
    row.append(name, status, count, message, linkCell);
    return row;
  }));
}

function formatTimestamp(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return value;
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "medium" }).format(parsed);
}

async function loadStatus() {
  const notice = $("#notice");
  $("#reload").disabled = true;
  try {
    const response = await fetch(`data/notices.json?t=${Date.now()}`, { cache: "no-store", headers: { "Cache-Control": "no-cache" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const envelope = await response.json();
    const items = Array.isArray(envelope.notices) ? envelope.notices : [];
    const sources = Array.isArray(envelope.sources) ? envelope.sources : [];
    const counts = items.reduce((result, item) => {
      result[item.source] = (result[item.source] || 0) + 1;
      return result;
    }, {});
    $("#total").textContent = formatCount(items.length);
    $("#applyhome").textContent = formatCount(counts.applyhome);
    $("#lh").textContent = formatCount(counts.lh);
    $("#lh-plan").textContent = formatCount(counts.lh_plan);
    $("#sh").textContent = formatCount(counts.sh);
    $("#generated").textContent = formatTimestamp(envelope.generatedAt);
    $("#overall-status").textContent = statusLabels[envelope.status] || envelope.status || "—";
    const published = items.map((item) => item.publishedAt).filter(Boolean).sort();
    $("#latest-notice").textContent = published.at(-1) || "—";
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
    const next = items.filter((item) => item.applyStart >= today).sort((a, b) => a.applyStart.localeCompare(b.applyStart))[0];
    $("#next-apply").textContent = next ? `${next.applyStart} · ${next.title}` : "예정 일정 없음";
    const thisMonth = today.slice(0, 7);
    const nextPlan = items.filter((item) => item.dataKind === "supply_plan" && item.supplyPlanMonth >= thisMonth).sort((a, b) => a.supplyPlanMonth.localeCompare(b.supplyPlanMonth))[0];
    $("#next-plan").textContent = nextPlan ? `${nextPlan.supplyPlanMonth} · ${nextPlan.title}` : "예정 계획 없음";
    renderSources(sources, counts);
    const age = dataAgeHours(envelope.generatedAt);
    const delayed = age !== null && age >= 24;
    notice.className = `notice ${envelope.status === "ready" && !delayed ? "ok" : envelope.status === "error" ? "error" : ""}`;
    notice.textContent = envelope.status === "ready" && !delayed
      ? `공식 공고·계획 ${formatCount(items.length)}건을 정상 제공하고 있습니다. 모든 원천이 정상입니다.`
      : delayed
        ? `공식 공고·계획 ${formatCount(items.length)}건을 제공 중이지만 마지막 갱신이 ${Math.floor(age / 24)}일 전입니다. 신청 전 기관 원문을 확인해 주세요.`
      : `공식 공고·계획 ${formatCount(items.length)}건을 제공 중입니다. 원천별 상태를 확인해 주세요.`;
  } catch (error) {
    notice.className = "notice error";
    notice.textContent = `데이터 현황을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요. (${error.message})`;
  } finally {
    $("#reload").disabled = false;
  }
}

$("#reload").addEventListener("click", loadStatus);
loadStatus();
