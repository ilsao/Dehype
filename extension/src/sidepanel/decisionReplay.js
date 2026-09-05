import "./decisionReplay.css";

const timeline = document.querySelector("#timeline");
const products = document.querySelector("#products");
const analysis = document.querySelector("#analysis");
const meta = document.querySelector("#session-meta");
const budget = document.querySelector("#budget");
let session;

document.querySelector("#analyze").addEventListener("click", async () => {
  setAnalysisMessage("Analyzing the local replay...");
  const response = await chrome.runtime.sendMessage({ type: "DEHYPE_REPLAY_ANALYZE" });
  renderAnalysis(response?.result);
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

async function load() {
  const response = await chrome.runtime.sendMessage({ type: "DEHYPE_REPLAY_GET_SESSION" });
  session = response?.session;
  render();
}

function render() {
  if (!session) return;
  meta.textContent = `${session.events.length} events · started ${formatTime(session.startedAt)}`;
  budget.value = session.intent?.budget ?? "";
  renderTimeline();
  renderProducts();
}

function renderTimeline() {
  const events = session.events.filter((event) => event.action !== "PRODUCT_CLICK" || event.durationMs === undefined);
  timeline.replaceChildren();
  if (!events.length) { timeline.innerHTML = '<li class="empty">No product activity yet.</li>'; return; }
  for (const event of events) {
    const item = document.createElement("li");
    item.className = "timeline-item";
    const product = event.product;
    const label = event.action === "PRODUCT_VIEW" && event.durationMs !== undefined ? "Viewed" : actionLabel(event.action);
    item.innerHTML = `<span class="time">${formatTime(event.timestamp)}</span><span><span class="event-action">${label}</span> <span class="event-name">${escapeHtml(product?.name ?? event.productId ?? "Session")}</span></span><span class="price">${escapeHtml(product?.currentPrice ?? "")}</span>${event.durationMs !== undefined ? `<span class="duration">${formatDuration(event.durationMs)}</span>` : ""}`;
    timeline.append(item);
  }
}

function renderProducts() {
  const byProduct = new Map();
  for (const event of session.events) {
    if (!event.product) continue;
    const current = byProduct.get(event.product.productId) ?? { ...event.product, durationMs: 0 };
    current.durationMs += event.durationMs ?? 0;
    byProduct.set(event.product.productId, current);
  }
  products.replaceChildren();
  if (!byProduct.size) { products.innerHTML = '<p class="empty">No products viewed yet.</p>'; return; }
  for (const product of byProduct.values()) {
    const row = document.createElement("div");
    row.className = "product-row";
    row.innerHTML = `<span class="product-name">${escapeHtml(product.name)}</span><span class="product-price">${escapeHtml(product.currentPrice ?? "")}</span><span class="duration">${formatDuration(product.durationMs)}</span>`;
    products.append(row);
  }
}

function renderAnalysis(result) {
  if (!result?.ok) { setAnalysisMessage(result?.message ?? "Analysis unavailable. Replay collection continues."); return; }
  analysis.replaceChildren();
  for (const [title, values] of Object.entries(result.analysis ?? {})) {
    const group = document.createElement("div");
    group.className = "analysis-group";
    group.innerHTML = `<h3>${escapeHtml(title)}</h3><ul>${values.map((value) => `<li>${escapeHtml(value)}</li>`).join("") || "<li>No signal recorded.</li>"}</ul>`;
    analysis.append(group);
  }
}

function setAnalysisMessage(message) { analysis.innerHTML = `<p class="empty">${escapeHtml(message)}</p>`; }
function actionLabel(action) { return ({ ADD_TO_CART: "Added", REMOVE_FROM_CART: "Removed", CHECKOUT: "Checkout", PRODUCT_CLICK: "Clicked" })[action] ?? action; }
function formatTime(timestamp) { return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
function formatDuration(durationMs) { return `${Math.round(durationMs / 1000)}s`; }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]); }