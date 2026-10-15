/**
 * PRATIKSHYA FASHION — AI assistant session persistence (Phase 21.1).
 *
 * Lightweight demo persistence for assistant conversations, scoped per
 * customer or admin id. Follows the house pattern (namespaced localStorage
 * keys, storage-event refresh) and keeps only what the conversation needs:
 * message roles, text, envelope types and product ids — never full product
 * records, never media, never camera frames, never business internals on
 * the customer side.
 */

import { readStorage, writeStorage } from "../../utils/shopping";

const SHOPPING_PREFIX = "pratikshya_ai_shopping_session_";
const BUSINESS_PREFIX = "pratikshya_ai_business_session_";
const MAX_MESSAGES = 80;

const scopeKey = (prefix, scopeId) => `${prefix}${String(scopeId || "guest")}`;

const cleanIdList = (ids) =>
  Array.isArray(ids)
    ? ids.map((id) => (id == null ? "" : String(id).trim())).filter(Boolean)
    : [];

const cleanSingleId = (id) => {
  if (id == null) return null;
  const value = String(id).trim();
  return value || null;
};

/** Reduces a message to its persistable essence. */
const sanitizeMessage = (message) => {
  if (!message || typeof message !== "object") return null;

  const resolvedProductIds = Array.isArray(message.products)
    ? message.products
        .map((entry) => String(entry?.product?.id ?? entry?.id ?? "").trim())
        .filter(Boolean)
    : [];
  const storedProductIds = cleanIdList(message.productIds);

  const resolvedOutfitMainId = cleanSingleId(message.outfit?.main?.id);
  const storedOutfitMainId = cleanSingleId(message.outfitMainId);

  const resolvedOutfitPieceIds = Array.isArray(message.outfit?.pieces)
    ? message.outfit.pieces.map((product) => String(product?.id ?? "").trim()).filter(Boolean)
    : [];
  const storedOutfitPieceIds = cleanIdList(message.outfitPieceIds);

  const resolvedSingleProductId = cleanSingleId(message.product?.id);
  const storedSingleProductId = cleanSingleId(message.singleProductId);

  const resolvedComparisonIds = Array.isArray(message.comparison?.products)
    ? message.comparison.products.map((product) => String(product?.id ?? "").trim()).filter(Boolean)
    : [];
  const storedComparisonIds = cleanIdList(message.comparisonIds);

  return {
    id: String(message.id || ""),
    role: message.role === "user" ? "user" : "assistant",
    assistant: message.assistant || null,
    type: message.type || "TEXT",
    text: String(message.text || ""),
    createdAt: message.createdAt || new Date().toISOString(),
    /* Products are referenced by id only and re-resolved from the live
       catalogue on restore, so a persisted session can never carry stale
       prices or availability. Persisted ids are retained when a session is
       loaded or saved before catalogue hydration has resolved its products. */
    productIds:
      storedProductIds.length > resolvedProductIds.length ? storedProductIds : resolvedProductIds,
    outfitMainId: resolvedOutfitMainId ?? storedOutfitMainId,
    outfitPieceIds:
      storedOutfitPieceIds.length > resolvedOutfitPieceIds.length
        ? storedOutfitPieceIds
        : resolvedOutfitPieceIds,
    singleProductId: resolvedSingleProductId ?? storedSingleProductId,
    comparisonIds:
      storedComparisonIds.length > resolvedComparisonIds.length
        ? storedComparisonIds
        : resolvedComparisonIds,
    suggestions: Array.isArray(message.suggestions) ? message.suggestions.slice(0, 4) : [],
    source: message.source || "",
    periodLabel: message.periodLabel || "",
    headline: message.headline || "",
    metrics: Array.isArray(message.metrics) ? message.metrics : [],
    rows: Array.isArray(message.rows) ? message.rows : [],
    actions: Array.isArray(message.actions) ? message.actions : [],
  };
};

export const saveAiSession = (prefix, scopeId, messages) => {
  const clean = (Array.isArray(messages) ? messages : [])
    .map(sanitizeMessage)
    .filter(Boolean)
    .slice(-MAX_MESSAGES);
  writeStorage(scopeKey(prefix, scopeId), { version: 1, messages: clean, savedAt: new Date().toISOString() });
  return clean;
};

export const loadAiSession = (prefix, scopeId) => {
  const stored = readStorage(scopeKey(prefix, scopeId), null);
  if (!stored || typeof stored !== "object" || !Array.isArray(stored.messages)) return [];
  return stored.messages.map(sanitizeMessage).filter(Boolean);
};

export const clearAiSession = (prefix, scopeId) => {
  writeStorage(scopeKey(prefix, scopeId), { version: 1, messages: [], savedAt: new Date().toISOString() });
};

export const AI_SESSION_SCOPES = {
  SHOPPING: SHOPPING_PREFIX,
  BUSINESS: BUSINESS_PREFIX,
};

export default { saveAiSession, loadAiSession, clearAiSession, AI_SESSION_SCOPES };
