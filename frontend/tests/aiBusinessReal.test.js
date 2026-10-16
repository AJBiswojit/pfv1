/**
 * Admin consolidation — the AI Business Assistant is REAL, not the mock.
 *
 * The mandate: authenticated backend endpoint → bounded read-only business
 * tools → existing services → DB; no direct SQL, no DB credentials in the
 * frontend, no fabricated data; the mock provider is out of the admin
 * production path. Rendered-component checks are STATIC source guards.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(root, p), "utf8");

test("STATIC: the business assistant calls the authenticated backend endpoint", () => {
  const service = read("src/services/ai/aiService.js");
  assert.match(service, /\/ai\/business\/ask/, "business path must hit POST /ai/business/ask");
  assert.match(service, /scope: "admin"/, "the call must ride the admin token");
  assert.doesNotMatch(
    service.match(/askBusinessAssistant[\s\S]*?};/)?.[0] ?? "",
    /mockAiProvider|respondBusiness/,
    "the business path must not route through the mock provider"
  );
});

test("STATIC: the browser never ships business data to the assistant", () => {
  const service = read("src/services/ai/aiService.js");
  const call = service.match(/const data = await apiClient\.post\([\s\S]*?\);/)?.[0] ?? "";
  assert.match(call, /question/, "sends the question");
  assert.match(call, /preset/, "sends the period preset");
  assert.doesNotMatch(call, /orders|snapshot|inventory/, "no business payload leaves the browser");
});

test("STATIC: the assistant screen no longer feeds client data to the engine", () => {
  const page = read("src/pages/admin/AiBusinessAssistant.jsx");
  assert.doesNotMatch(page, /useOrder|useInventory|useWorkforce/, "no snapshot contexts feed the assistant");
  assert.doesNotMatch(page, /orders: allOrders/, "the 100-order snapshot is not the input");
  assert.match(page, /askBusinessAssistant\(\{ question, preset \}\)/);
  assert.match(page, /never invented|never invents/, "the honesty promise stays visible");
});

test("STATIC: the mock provider remains only for the shopping surface", () => {
  const provider = read("src/services/ai/mockAiProvider.js");
  assert.match(provider, /respondBusiness/, "fixture retained for tests/employee demo surfaces");
  const assistantPage = read("src/pages/admin/AiBusinessAssistant.jsx");
  assert.doesNotMatch(assistantPage, /isMockAiProvider/, "no demo badge on the real admin assistant");
});

test("STATIC: the backend endpoint is authenticated + read-only by construction", () => {
  const endpoint = read("../backend/app/api/v1/ai_assistant.py");
  assert.match(endpoint, /get_current_admin/, "admin surface guard");
  assert.match(endpoint, /analytics\.view/, "permission gate");
  assert.match(endpoint, /extra="ignore"/, "client payload keys are ignored");
  assert.match(endpoint, /MAX_QUESTION_CHARS/, "bounded question length");
  assert.match(endpoint, /NO_DATA/, "truthful empty-register answers");
  assert.doesNotMatch(endpoint, /INSERT|UPDATE |DELETE |commit\(/, "read-only: no writes");
});
