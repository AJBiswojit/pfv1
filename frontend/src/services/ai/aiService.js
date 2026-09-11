/**
 * PRATIKSHYA FASHON — central AI service (Phase 21.1, consolidation).
 *
 * Two doors:
 *   • SHOPPING assistant (customer portal) — provider contract in
 *     `aiProvider.js`; currently the deterministic demo provider.
 *   • BUSINESS assistant (admin portal) — REAL: one authenticated backend
 *     endpoint (POST /ai/business/ask) answers from the database through
 *     bounded read-only queries. The browser sends only the question and
 *     the period; it never ships business data to a client-side engine and
 *     the mock provider is not in the admin production path.
 */

import { apiClient } from "../api/apiClient.js";
import { buildBusinessResponse } from "./shared/aiResponseBuilder.js";
import { validateAiProvider } from "./aiProvider.js";
import { mockAiProvider } from "./mockAiProvider.js";

const activeProvider = mockAiProvider; // shopping assistant provider

const problems = validateAiProvider(activeProvider);
if (problems.length && typeof console !== "undefined") {
  console.warn(`PRATIKSHYA AI provider misconfigured: ${problems.join(" ")}`);
}

export const AI_PROVIDER_ID = activeProvider.id;
export const AI_PROVIDER_LABEL = "PRATIKSHYA AI (live business data)";

/** True for the demo provider — the SHOPPING UI surfaces an honest demo footnote. */
export const isMockAiProvider = () => activeProvider.id === "mock";

/** Ask the shopping assistant. Resolves a shopping response envelope. */
export const askShoppingAssistant = (request) => activeProvider.respondShopping(request);

/**
 * Ask the BUSINESS assistant — authenticated backend endpoint.
 * Sends { question, preset } only; the backend reads the database itself.
 * Resolves a business response envelope; throws an Error with an honest
 * message when the answer cannot be prepared (401/403/network).
 */
export const askBusinessAssistant = async ({ question, preset, signal } = {}) => {
  const data = await apiClient.post(
    "/ai/business/ask",
    { question, preset: preset || "LAST_30" },
    { scope: "admin", signal }
  );
  const answer = data?.response ?? data;
  return buildBusinessResponse({
    type: answer.type,
    headline: answer.headline || "",
    text: answer.text,
    metrics: answer.metrics ?? [],
    rows: answer.rows ?? [],
    actions: answer.actions ?? [],
    suggestions: answer.suggestions ?? [],
    periodLabel: answer.periodLabel ?? "",
    source: answer.source ?? "Live business data",
  });
};

export const aiService = {
  provider: AI_PROVIDER_ID,
  providerLabel: AI_PROVIDER_LABEL,
  isMockAiProvider,
  askShoppingAssistant,
  askBusinessAssistant,
};

export default aiService;
