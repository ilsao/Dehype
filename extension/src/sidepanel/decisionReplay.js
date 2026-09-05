import "./decisionReplay.css";
import { buildDecisionTrace } from "../shared/decisionTrace.ts";

const timeline = document.querySelector("#timeline");
const products = document.querySelector("#products");
const analysis = document.querySelector("#analysis");
const configureGeminiButton = document.querySelector("#configure-gemini");
const kpis = document.querySelector("#kpis");
const attentionShare = document.querySelector("#attention-share");
const journeyChart = document.querySelector("#journey-chart");
const pricePath = document.querySelector("#price-path");
const persuasionChart = document.querySelector("#persuasion-chart");
const meta = document.querySelector("#session-meta");
const budget = document.querySelector("#budget");
let session;
window.setInterval(() => {
  if (session) render();
}, 1000);

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "DEHYPE_REPLAY_SESSION_UPDATED" || !message.session) return;
  session = message.session;
  render();
});

document.querySelector("#analyze").addEventListener("click", async () => {
  setAnalysisMessage("Analyzing the local replay...");
  configureGeminiButton.hidden = true;
  try {
    const response = await chrome.runtime.sendMessage({ type: "DEHYPE_REPLAY_ANALYZE" });
    renderAnalysis(response?.result);
  } catch (error) {
    setAnalysisMessage(
      error instanceof Error
        ? error.message
        : "Replay analysis could not be started.",
    );
  }
});

configureGeminiButton.addEventListener("click", async () => {
  try {
    await chrome.action.openPopup();
  } catch {
    setAnalysisMessage("Open the Dehype toolbar popup to configure Gemini.");
  }
});

document.querySelector("#reset").addEventListener("click", async () => {
  session = (await chrome.runtime.sendMessage({ type: "DEHYPE_REPLAY_RESET_SESSION" }))?.session;
  render();
});

document.querySelector("#save-intent").addEventListener("click", async () => {
  if (!session) return;
  session.intent = budget.value.trim() ? { budget: budget.value.trim() } : undefined;
  await chrome.storage.local.set({ decisionReplaySession: session });
  render();
});

void load();

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes.decisionReplaySession?.newValue) return;
  session = changes.decisionReplaySession.newValue;
  render();
});

async function load() {
  const response = await chrome.runtime.sendMessage({ type: "DEHYPE_REPLAY_GET_SESSION" });
  session = response?.session;
  render();
}

function render() {
  if (!session) return;
  meta.textContent = `${session.events.length} events · started ${formatTime(session.startedAt)}`;
  budget.value = session.intent?.budget ?? "";
  renderDashboard(buildDecisionTrace(session));
  renderTimeline();
  renderProducts();
}

function renderTimeline() {
  const events = session.events.filter((event) => event.action !== "PRODUCT_CLICK" || event.durationMs === undefined);
  const viewed = new Set();
  timeline.replaceChildren();
  if (!events.length) { timeline.innerHTML = '<li class="empty">No product activity yet.</li>'; return; }
  for (const event of events) {
    const item = document.createElement("li");
    item.className = "timeline-item";
    const product = event.product;
    const isRevisit = event.action === "PRODUCT_VIEW" && event.productId && viewed.has(event.productId);
    const label = event.action === "PRODUCT_VIEW"
      ? (isRevisit ? "Revisited" : event.durationMs === undefined ? "Viewing" : "Viewed")
      : actionLabel(event.action, Boolean(event.product));
    if (event.action === "PRODUCT_VIEW" && event.productId) viewed.add(event.productId);
    const duration = event.action === "PRODUCT_VIEW"
      ? `<span class="duration">${formatDuration(event.durationMs ?? Date.now() - event.timestamp)}</span>`
      : "";
    item.innerHTML = `<span class="time">${formatTime(event.timestamp)}</span><span><span class="event-action">${label}</span> <span class="event-name">${escapeHtml(product?.name ?? event.productId ?? "Session")}</span></span><span class="price">${escapeHtml(product?.currentPrice ?? "")}</span>${duration}`;
    timeline.append(item);
  }
}

function renderDashboard(trace) {
  const finalProduct = trace.products.find((product) => product.productId === trace.finalProductId);
  const budgetText = trace.budgetAlignment
    ? trace.budgetAlignment.status === "within-budget"
      ? `${formatMoney(trace.budgetAlignment.difference ?? 0)} under budget`
      : trace.budgetAlignment.status === "over-budget"
        ? `${formatMoney(Math.abs(trace.budgetAlignment.difference ?? 0))} over budget`
        : "Budget alignment unavailable"
    : "No budget recorded";
  kpis.innerHTML = [
    kpiValue(String(trace.products.length), "Products explored"),
    kpiValue(formatDuration(trace.totalDecisionTimeMs), "Decision time"),
    kpiValue(String(trace.comparisonCount), "Comparisons"),
    kpiValue(String(trace.revisitCount), "Revisits"),
    kpiValue(finalProduct?.currentPrice ?? "None", "Final choice"),
    kpiValue(budgetText, "Budget alignment"),
  ].join("");

  attentionShare.innerHTML = trace.products.length
    ? trace.products.map((product) => barRow(product.name ?? product.productId, product.attentionShare, `${Math.round(product.attentionShare * 100)}%`)).join("")
    : emptyChart("No completed product views yet.");

  const productById = new Map(trace.products.map((product) => [product.productId, product]));
  journeyChart.innerHTML = trace.sequence.length
    ? trace.sequence.map((productId, index) => {
      const product = productById.get(productId);
      const revisit = trace.sequence.slice(0, index).includes(productId);
      return `<span class="journey-node"><strong>${revisit ? "↻" : "👀"}</strong><span>${escapeHtml(product?.name ?? productId)}</span></span>${index < trace.sequence.length - 1 ? '<span class="journey-arrow">→</span>' : ""}`;
    }).join("")
    : emptyChart("No product journey yet.");

  pricePath.innerHTML = trace.sequence.length
    ? trace.sequence.map((productId) => {
      const product = productById.get(productId);
      return `<span class="price-node">${escapeHtml(product?.currentPrice ?? "Unknown")}</span>`;
    }).join('<span class="journey-arrow">→</span>')
    : emptyChart("Price path unavailable.");

  const maxSignals = Math.max(...trace.persuasionSignals.map((signal) => signal.count), 0);
  persuasionChart.innerHTML = trace.persuasionSignals.length
    ? trace.persuasionSignals.map((signal) => barRow(signal.persuasionType, maxSignals ? signal.count / maxSignals : 0, String(signal.count))).join("")
    : emptyChart("No persuasion signals recorded.");
}

function kpiValue(value, label) {
  return `<div class="kpi"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>`;
}

function barRow(label, ratio, value) {
  return `<div class="bar-row"><div class="bar-label"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div><div class="bar-track"><span style="width:${Math.max(0, Math.min(100, ratio * 100))}%"></span></div></div>`;
}

function emptyChart(message) { return `<p class="empty">${escapeHtml(message)}</p>`; }

function renderProducts() {
  const byProduct = new Map();
  for (const event of session.events) {
    if (!event.product) continue;
    const current = byProduct.get(event.product.productId) ?? { ...event.product, durationMs: 0 };
    current.durationMs +=
      event.durationMs ??
      (event.action === "PRODUCT_VIEW" ? Date.now() - event.timestamp : 0);
    byProduct.set(event.product.productId, current);
  }
  products.replaceChildren();
  if (!byProduct.size) { products.innerHTML = '<p class="empty">No products viewed yet.</p>'; return; }
  for (const product of byProduct.values()) {
    const row = document.createElement("div");
    row.className = "product-row";
    const facts = [product.discount, product.stockAmount]
      .filter(Boolean)
      .map((value) => escapeHtml(value))
      .join(" · ");
    row.innerHTML = `<span class="product-name">${escapeHtml(product.name)}${facts ? `<small>${facts}</small>` : ""}</span><span class="product-price">${escapeHtml(product.currentPrice ?? "")}</span><span class="duration">${formatDuration(product.durationMs)}</span>`;
    products.append(row);
  }
}

function renderAnalysis(result) {
  if (!result?.ok) {
    setAnalysisMessage(result?.message ?? "Analysis unavailable. Replay collection continues.");
    configureGeminiButton.hidden = false;
    return;
  }
  configureGeminiButton.hidden = true;
  analysis.replaceChildren();
  const structured = result.analysis ?? {};
  const groups = [
    ["What happened", structured.summary ? [structured.summary] : []],
    ["Journey insights", (structured.journeyInsights ?? []).map((item) => `${item.title}: ${item.observation}`)],
    ["Attention insights", (structured.attentionInsights ?? []).map((item) => item.observation)],
    ["Potential influence", (structured.potentialInfluences ?? []).map((item) => `${item.persuasionType}: ${item.observation}`)],
    ["Reflection", structured.reflection ?? []],
    ["Uncertainty", structured.uncertainty ?? []],
  ];
  for (const [title, values] of groups) {
    const group = document.createElement("div");
    group.className = "analysis-group";
    group.innerHTML = `<h3>${escapeHtml(title)}</h3><ul>${values.map((value) => `<li>${escapeHtml(value)}</li>`).join("") || "<li>No signal recorded.</li>"}</ul>`;
    analysis.append(group);
  }
}

function setAnalysisMessage(message) { analysis.innerHTML = `<p class="empty">${escapeHtml(message)}</p>`; }
function actionLabel(action, hasProduct) {
  if (action === "PRODUCT_CLICK" && hasProduct) return "Compared";
  if (action === "ADD_TO_CART") return "Selected";
  return ({ REMOVE_FROM_CART: "Removed", CHECKOUT: "Checkout", PRODUCT_CLICK: "Clicked" })[action] ?? action;
}
function formatTime(timestamp) { return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
function formatDuration(durationMs) { return `${Math.round(durationMs / 1000)}s`; }
function formatMoney(value) { return `$${Math.abs(value).toFixed(2)}`; }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]); }