/* global fetch */

import { loadAiSettings } from "../shared/aiSettings.js";
import { buildReplayAnalysisPayload } from "../shared/decisionReplay.ts";

const ANALYSIS_SYSTEM_PROMPT = [
  "You are analyzing a user's shopping decision replay.",
  "Help the user understand how the decision unfolded. Do not judge the decision or recommend what to buy.",
  "Use only the provided deterministic trace and do not recalculate basic metrics.",
  "Do not invent missing information or infer causality from temporal sequence.",
  "Persuasion records are page environment signals, not proof of exposure or influence.",
  "Use cautious language such as may have, potentially, coincided with, occurred during, temporal association, and possible influence.",
  "Never say caused, definitely influenced, manipulated you, or because of X.",
  "Return only JSON with: summary (string), journeyInsights (array of {productId?: string, title: string, observation: string}), attentionInsights (array of {productId: string, observation: string}), potentialInfluences (array of {productId?: string, persuasionType: string, observation: string}), reflection (array of strings), uncertainty (array of strings).",
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
    return { ok: true, payload, analysis: parseDecisionAnalysis(text) };
  } catch (error) {
    return {
      ok: false,
      payload,
      message: error instanceof Error ? error.message : "Gemini analysis failed.",
    };
  }
}

export function parseDecisionAnalysis(text) {
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("Gemini returned an empty analysis.");
  }
  const fenced = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const parsed = JSON.parse(fenced?.[1] ?? text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Gemini returned an invalid analysis.");
  }
  if (typeof parsed.summary !== "string") {
    throw new Error("Gemini analysis is missing a summary.");
  }
  return {
    summary: parsed.summary,
    journeyInsights: readInsightObjects(parsed.journeyInsights, ["title", "observation"]),
    attentionInsights: readInsightObjects(parsed.attentionInsights, ["productId", "observation"]),
    potentialInfluences: readInsightObjects(parsed.potentialInfluences, ["persuasionType", "observation"]),
    reflection: readStrings(parsed.reflection),
    uncertainty: readStrings(parsed.uncertainty),
  };
}

function readStrings(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

function readInsightObjects(value, requiredFields) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object")
    .filter((item) => requiredFields.every((field) => typeof item[field] === "string"))
    .map((item) => ({
      ...(typeof item.productId === "string" ? { productId: item.productId } : {}),
      ...(typeof item.persuasionType === "string" ? { persuasionType: item.persuasionType } : {}),
      ...(typeof item.title === "string" ? { title: item.title } : {}),
      observation: item.observation,
    }));
}