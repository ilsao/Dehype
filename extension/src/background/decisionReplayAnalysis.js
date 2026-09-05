/* global fetch */

import { loadAiSettings } from "../shared/aiSettings.js";
import { buildReplayAnalysisPayload } from "../shared/decisionReplay.ts";

const ANALYSIS_SYSTEM_PROMPT = [
  "You are a neutral decision replay analyst.",
  "Describe observations, preference signals, price patterns, decision turning points, and potential influence.",
  "Do not claim that any element caused a user action or purchase.",
  "Use uncertain language such as possible influence, potential influence, or temporal association.",
  "Return JSON with arrays: observations, preferenceSignals, pricePatterns, decisionTurningPoints, potentialInfluence.",
].join(" ");

export async function analyzeDecisionReplay(
  session,
  dependencies = {},
) {
  const payload = buildReplayAnalysisPayload(session);
  const settings = await loadAiSettings(
    dependencies.storage ?? chrome.storage.local,
  );
  if (settings.state !== "remote" || settings.provider !== "gemini") {
    const hasGeminiCredentials =
      settings.provider === "gemini" && Boolean(settings.model && settings.apiKey);
    return {
      ok: false,
      payload,
      message: hasGeminiCredentials
        ? "Gemini is configured, but remote consent is not enabled. Open Dehype settings, enable consent, and save settings."
        : "Configure Gemini, enter a model and API key, enable remote consent, and save settings.",
    };
  }

  try {
    const modelPath = settings.model.startsWith("models/")
      ? settings.model
      : `models/${settings.model}`;
    const response = await (dependencies.fetchImpl ?? fetch)(
      `https://generativelanguage.googleapis.com/v1beta/${encodeURI(modelPath)}:generateContent`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": settings.apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: ANALYSIS_SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts: [{ text: JSON.stringify(payload) }] }],
          generationConfig: { responseMimeType: "application/json" },
        }),
      },
    );
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.error?.message ?? response.statusText);
    }
    const text = data?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text)
      .filter(Boolean)
      .join("\n");
    return { ok: true, payload, analysis: parseAnalysis(text) };
  } catch (error) {
    return {
      ok: false,
      payload,
      message: error instanceof Error ? error.message : "Gemini analysis failed.",
    };
  }
}

function parseAnalysis(text) {
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("Gemini returned an empty analysis.");
  }
  const fenced = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const parsed = JSON.parse(fenced?.[1] ?? text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Gemini returned an invalid analysis.");
  }
  const fields = [
    "observations",
    "preferenceSignals",
    "pricePatterns",
    "decisionTurningPoints",
    "potentialInfluence",
  ];
  return Object.fromEntries(
    fields.map((field) => [
      field,
      Array.isArray(parsed[field])
        ? parsed[field].filter((item) => typeof item === "string")
        : [],
    ]),
  );
}