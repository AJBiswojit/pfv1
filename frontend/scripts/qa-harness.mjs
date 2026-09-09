/**
 * Shared Node shims for QA scripts. Production never imports this file.
 *
 * Catalogue truth is backend-owned. These scripts seed the in-memory
 * workflow fixture (`setupCanonicalState`) and never restore a static
 * product seed or invent Banarasi / silk / bangle merchandise.
 */

export const ADMIN = Object.freeze({ adminId: "PF-ADM-00001", name: "House Admin" });

export function installQaShims() {
  if (typeof globalThis.window !== "undefined") return;
  const storage = new Map();
  const localStorage = {
    getItem: (key) => (storage.has(String(key)) ? storage.get(String(key)) : null),
    setItem: (key, value) => storage.set(String(key), String(value)),
    removeItem: (key) => storage.delete(String(key)),
    clear: () => storage.clear(),
  };
  const window = {
    localStorage,
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return true;
    },
  };
  globalThis.window = window;
  globalThis.localStorage = localStorage;
  if (typeof globalThis.document === "undefined") {
    globalThis.document = {
      documentElement: { lang: "en", style: {} },
      querySelector: () => null,
    };
  }
}

export function publishViaWorkflow(commands, productId) {
  const submit = commands.submitProduct(productId, ADMIN);
  if (!submit.ok) throw new Error(`submit ${productId}: ${submit.error ?? "failed"}`);
  const approve = commands.approveProduct(productId, ADMIN);
  if (!approve.ok) throw new Error(`approve ${productId}: ${approve.error ?? "failed"}`);
  const publish = commands.publishProduct(productId, ADMIN);
  if (!publish.ok) throw new Error(`publish ${productId}: ${publish.error ?? "failed"}`);
  return publish.product;
}
