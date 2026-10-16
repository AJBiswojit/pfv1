/**
 * Shared harness for the Phase 12 account-screen suites.
 *
 * It renders the real Aarna account pages through Vite's SSR loader and
 * react-test-renderer, inside the REAL `AccountProvider` (so the account read,
 * `updatePreferences`, `changePassword` and `signOutOtherSessions` run their own
 * code), with a stubbed `fetch` at the network boundary only.
 *
 * A customer session is opened the way the application opens one: a customer token
 * is written through `setTokens`, never by hand. Storage and fetch are restored
 * after each suite.
 */
import React, { act } from "react";
import { create } from "react-test-renderer";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

export const CUSTOMER = { id: "cust-1", email: "asha@example.com", fullName: "Asha Patel" };

/** The account read the backend returns for `GET /customers/me`. */
export const ACCOUNT_PAYLOAD = {
  profile: { id: "cust-1", first_name: "Asha", last_name: "Patel", email: "asha@example.com", phone: "9876543210" },
  addresses: [],
  preferences: {
    email_notifications: false,
    sms_notifications: true,
    promotional_updates: false,
    order_updates: true,
    styling_invitations: false,
  },
  security: {
    activeSessions: [
      {
        id: "sess-1",
        user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        ip_address: "10.0.0.7",
        created_at: "2026-01-02T00:00:00Z",
        is_current: true,
      },
    ],
  },
};

export const json = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name) => (name.toLowerCase() === "content-type" ? "application/json" : null) },
  json: async () => body,
  text: async () => JSON.stringify(body),
});

/** Concatenated visible text of a react-test-renderer JSON tree. */
export const textOf = (node) => {
  if (node === null || node === undefined) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(textOf).join("");
  return textOf(node.children);
};

export const flush = () => act(async () => { await new Promise(setImmediate); });

/**
 * Starts the harness. Returns helpers bound to one Vite server and one set of
 * stubs. Call `teardown()` in `after()`.
 */
export async function startHarness() {
  const original = {
    fetch: globalThis.fetch,
    localStorage: globalThis.localStorage,
    document: globalThis.document,
    navigator: globalThis.navigator,
    IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT,
  };
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.document = { title: "" };

  const vite = await createServer({
    root: ROOT,
    appType: "custom",
    logLevel: "error",
    server: { middlewareMode: true },
    optimizeDeps: { noDiscovery: true, include: [] },
  });

  const { MemoryRouter, useLocation } = await import("react-router-dom");
  const React_ = React;
  const load = (path) => vite.ssrLoadModule(path);
  const [{ AuthContext }, { AccountProvider }, OrderContextModule, api, apiClient] = await Promise.all([
    load("/src/context/AuthContext.jsx"),
    load("/src/context/AccountContext.jsx"),
    load("/src/context/OrderContext.jsx"),
    load("/src/services/api/apiClient.js"),
    load("/src/services/api/apiClient.js"),
  ]);
  const OrderContext = OrderContextModule.default;

  /* ── storage, fetch and clipboard stubs ───────────────────────────────── */
  const auth = { signOutCalls: 0 };
  const location = { pathname: null };
  let store = new Map();
  let requests = [];
  let plan = () => json(200, {});
  let clipboard = { writeText: async () => {} };

  const installStubs = () => {
    auth.signOutCalls = 0;
    location.pathname = null;
    store = new Map();
    requests = [];
    plan = () => json(200, {});
    clipboard = { writeText: async () => {} };
    globalThis.localStorage = {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      clear: () => store.clear(),
    };
    globalThis.document = { title: "" };
    /* Node exposes `navigator` as a getter-only global, so it is redefined. */
    Object.defineProperty(globalThis, "navigator", {
      value: { get clipboard() { return clipboard; } },
      configurable: true,
      writable: true,
    });
    globalThis.fetch = async (input, options = {}) => {
      const url = String(input);
      const method = (options.method ?? "GET").toUpperCase();
      requests.push({ url, method, body: options.body ? JSON.parse(options.body) : undefined });
      return plan({ url, method, body: options.body ? JSON.parse(options.body) : undefined });
    };
    /* A customer session, opened through the application's own token writer. */
    api.setTokens({ accessToken: "customer-access", refreshToken: "customer-refresh" }, "customer");
  };

  /* The page tree is mounted under the real AccountProvider. The auth context is
     supplied as the customer's identity; sign-out is recorded, not performed. */
  const authValue = () => ({
    user: CUSTOMER,
    isAuthenticated: true,
    isLoading: false,
    updateUser: () => {},
    signOut: () => { auth.signOutCalls += 1; },
  });

  const LocationProbe = () => {
    location.pathname = useLocation().pathname;
    return null;
  };

  /** Mounts `Page` inside the real account + order providers and the router. */
  const render = async (Page, { path = "/account/test", order = { orders: [], isLoadingOrders: false }, signedIn = true } = {}) => {
    let tree;
    const authCtx = signedIn ? authValue() : { ...authValue(), user: null, isAuthenticated: false };
    await act(async () => {
      tree = create(
        React_.createElement(
          MemoryRouter,
          { initialEntries: [path] },
          React_.createElement(
            AuthContext.Provider,
            { value: authCtx },
            React_.createElement(
              AccountProvider,
              null,
              React_.createElement(
                OrderContext.Provider,
                { value: order },
                React_.createElement(React_.Fragment, null, React_.createElement(Page), React_.createElement(LocationProbe)),
              ),
            ),
          ),
        ),
      );
    });
    await flush();
    return tree;
  };

  const find = (tree, predicate) => tree.root.findAll(predicate);
  const byName = (tree, name) => find(tree, (n) => n.props && n.props.name === name && typeof n.type === "string");
  /* The Aarna Button wraps its label in a <span>, so the label is read from the
     rendered instance tree, not from the element's props. */
  const instanceText = (inst) => (typeof inst === "string" ? inst : (inst.children ?? []).map(instanceText).join(""));
  const buttonWith = (tree, text) =>
    find(tree, (n) => n.type === "button" && instanceText(n).includes(text))[0] ?? null;

  const click = (tree, text) =>
    act(async () => {
      const button = buttonWith(tree, text);
      if (!button) throw new Error(`no button containing "${text}"`);
      await button.props.onClick({ preventDefault() {} });
      await new Promise(setImmediate);
    });

  const submit = (tree) =>
    act(async () => {
      tree.root.findByType("form").props.onSubmit({ preventDefault() {} });
      await new Promise(setImmediate);
    });

  const change = (input, value) =>
    act(async () => {
      input.props.onChange({ target: { value, checked: value } });
    });

  const toggle = (input) =>
    act(async () => {
      input.props.onChange({ target: { checked: !input.props.checked } });
    });

  const teardown = async () => {
    await vite.close();
    globalThis.fetch = original.fetch;
    globalThis.localStorage = original.localStorage;
    globalThis.document = original.document;
    Object.defineProperty(globalThis, "navigator", { value: original.navigator, configurable: true, writable: true });
    globalThis.IS_REACT_ACT_ENVIRONMENT = original.IS_REACT_ACT_ENVIRONMENT;
  };

  return {
    vite,
    load,
    installStubs,
    api,
    apiClient,
    auth,
    location,
    render,
    find,
    byName,
    buttonWith,
    click,
    submit,
    change,
    toggle,
    flush,
    teardown,
    get requests() { return requests; },
    setPlan: (fn) => { plan = fn; },
    setClipboard: (c) => { clipboard = c; },
    storage: () => store,
  };
}

/**
 * Answers the account read and the account mutations from one stub table. A route
 * is `{ method, match, answer }`; `answer` may return a response or a promise.
 * Unmatched requests fail the test loudly rather than answering silently.
 */
export const routeFetch = (routes) => ({ url, method, body }) => {
  for (const route of routes) {
    if (route.method === method && route.match(url)) return route.answer({ url, method, body });
  }
  throw new Error(`unexpected ${method} ${url}`);
};

export const isAccountRead = (url) => /\/customers\/me(\?|$)/.test(url);
