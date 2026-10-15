/**
 * Phase 1.5 — hero preview harness.
 *
 * Pins the harness's isolation (it cannot become a production page, it is not
 * in the application's graph, it adds nothing to the production stylesheet)
 * and its data honesty (fixtures are labelled, addressed through the real
 * media seam, and feed the real hero model).
 */

import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { normalizeHeroSlides } from "../../home/heroModel.js";
import { PREVIEW_FIXTURE_SLIDES, PREVIEW_FIXTURE_LABEL } from "../previewFixtures.js";

/** Walk up until the frontend `package.json` — the Vite project root. */
function projectRoot() {
  let directory = new URL(".", import.meta.url);
  for (let step = 0; step < 10; step += 1) {
    if (existsSync(new URL("package.json", directory))) return fileURLToPath(directory);
    directory = new URL("../", directory);
  }
  throw new Error("frontend root not found");
}

const ROOT = projectRoot();
const read = (relativePath) => readFileSync(`${ROOT}/${relativePath}`, "utf8");
/** Assembled so this suite never writes a legacy public image prefix itself. */
const LEGACY_PREFIX = `/${"images"}/`;

let vite;
let HeroPreview;

before(async () => {
  const { createServer } = await import("vite");
  vite = await createServer({
    root: ROOT,
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "silent",
  });
  HeroPreview = (await vite.ssrLoadModule("/src/components/storefront/preview/HeroPreview.jsx"))
    .default;
});

after(async () => {
  await vite?.close();
});

/* ------------------------------------------------------------------ */
/* Fixture data                                                        */
/* ------------------------------------------------------------------ */

test("fixtures are labelled preview-only and never claim to be backend data", () => {
  assert.match(PREVIEW_FIXTURE_LABEL, /^Preview fixture/);
  assert.match(PREVIEW_FIXTURE_LABEL, /NOT live backend data/);
  const source = read("src/components/storefront/preview/previewFixtures.js");
  assert.match(source, /NOT PRODUCTION DATA/);
});

test("fixture plates go through the canonical media seam, never an authored path", () => {
  const source = read("src/components/storefront/preview/previewFixtures.js");
  assert.equal(source.includes(LEGACY_PREFIX), false);
  /* Both plate helpers take object keys / bare asset names — no path literals. */
  assert.match(source, /mediaObjectUrl\("hero\/hero00/);
  assert.match(source, /previewAssetUrl\("hero-jewellery-tall\.webp"\)/);
  const literalPaths = [...source.matchAll(/"(\/[^"]*)"/g)].map((match) => match[1]);
  /* No literal may look like a file… */
  assert.deepEqual(
    literalPaths.filter((value) => /\.[a-z0-9]{2,5}$/i.test(value)),
    [],
    "fixtures must not contain an authored asset path"
  );
  /* …and every one that remains is an app route used as a CTA destination. */
  assert.deepEqual([...new Set(literalPaths)].sort(), ["/bridal", "/shop", "/women/sarees"]);
});

test("fixtures feed the real hero model with all five layouts", () => {
  const model = normalizeHeroSlides(PREVIEW_FIXTURE_SLIDES, []);
  assert.equal(model.length, 5);
  assert.deepEqual(
    model.map((slide) => slide.layout),
    ["left", "panel", "right", "split", "top"]
  );
  assert.ok(model.every((slide) => slide.image.src.startsWith("/api/v1/media/objects/hero/")));
  /* The split layout keeps its portrait art direction in the fixture. */
  assert.equal(model[3].portrait.src, "/__preview-assets/hero-jewellery-tall.webp");
  assert.ok(model.every((slide) => slide.cta && slide.cta.href));
});

/* ------------------------------------------------------------------ */
/* Isolation                                                           */
/* ------------------------------------------------------------------ */

test("the harness refuses to render outside a development build", () => {
  const source = read("src/components/storefront/preview/HeroPreview.jsx");
  assert.match(source, /if \(!import\.meta\.env\.DEV\) return null;/);
});

test("nothing in the application imports the harness", () => {
  const offenders = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "__tests__") continue;
        walk(path);
      } else if ([".js", ".jsx"].includes(extname(entry.name))) {
        if (path.includes(join("storefront", "preview"))) continue;
        if (/from\s+["'][^"']*storefront\/preview|import\s*\(\s*["'][^"']*storefront\/preview/.test(readFileSync(path, "utf8"))) {
          offenders.push(path);
        }
      }
    }
  };
  walk(join(ROOT, "src"));
  assert.deepEqual(offenders, []);

  /* The app entry and the build config stay untouched. */
  assert.equal(read("src/main.jsx").includes("preview"), false);
  assert.equal(read("src/App.jsx").includes("preview"), false);
  assert.equal(read("index.html").includes("preview"), false);
  assert.equal(read("vite.config.js").includes("preview"), false);
});

test("the preview entry point is a separate dev document, not a build input", () => {
  const html = read("preview.html");
  assert.match(html, /src\/components\/storefront\/preview\/main\.jsx/);
  assert.match(html, /noindex/);
  const config = read("vite.preview.config.js");
  assert.match(config, /--config vite\.preview\.config\.js/);
  assert.equal(config.includes("rollupOptions"), false);
  /* The preview config is the only place the middleware is registered. */
  assert.match(config, /previewHarnessServer/);
  assert.equal(read("vite.config.js").includes("preview"), false);
});

test("the preview server serves the harness at its root, not the application", () => {
  const middleware = read("preview/vite-preview-server.mjs");
  assert.match(middleware, /export const PREVIEW_DOCUMENT = "\/preview\.html";/);
  assert.match(middleware, /export const APPLICATION_DOCUMENT = "\/index\.html";/);
  assert.match(middleware, /if \(pathname === "\/"\) \{\s*req\.url = `\$\{PREVIEW_DOCUMENT\}\$\{query\}`;/);
  assert.match(middleware, /if \(pathname === "\/app"\) \{\s*req\.url = `\$\{APPLICATION_DOCUMENT\}\$\{query\}`;/);
  /* Nothing in the application's own config rewrites anything. */
  assert.equal(read("vite.config.js").includes("req.url"), false);
});

test("served documents: / is the harness, /app and /index.html are the application", async () => {
  const { createServer: createHttpServer } = await import("node:http");
  const { createServer } = await import("vite");

  const preview = await createServer({
    root: ROOT,
    configFile: `${ROOT}/vite.preview.config.js`,
    server: { middlewareMode: true, host: "127.0.0.1" },
    logLevel: "silent",
  });
  const httpServer = createHttpServer(preview.middlewares);

  try {
    await new Promise((resolve, reject) => {
      httpServer.once("error", reject);
      httpServer.listen(0, "127.0.0.1", resolve);
    });
    const { port } = httpServer.address();
    const get = async (path) => {
      const response = await fetch(`http://127.0.0.1:${port}${path}`);
      return { status: response.status, body: await response.text() };
    };

    /* The root is what a live preview panel opens — it must be the harness. */
    const root = await get("/");
    assert.equal(root.status, 200);
    assert.match(root.body, /id="preview-root"/);
    assert.match(root.body, /src\/components\/storefront\/preview\/main\.jsx/);
    assert.equal(root.body.includes("/src/main.jsx"), false);
    /* A query string survives the rewrite (the harness reads embed/active/data). */
    assert.match((await get("/?data=fixture")).body, /id="preview-root"/);

    /* The same harness document is still reachable by name… */
    const named = await get("/preview.html");
    assert.match(named.body, /id="preview-root"/);
    assert.match(named.body, /src\/components\/storefront\/preview\/main\.jsx/);

    /* …while the untouched application is served beside it. */
    for (const path of ["/index.html", "/app"]) {
      const app = await get(path);
      assert.equal(app.status, 200, `${path} must serve the application`);
      assert.match(app.body, /id="root"/);
      assert.match(app.body, /src\/main\.jsx/);
      assert.equal(app.body.includes("preview-root"), false);
    }
  } finally {
    await new Promise((resolve) => httpServer.close(resolve));
    await preview.close();
  }
});

test("preview chrome adds no Tailwind class to the production stylesheet", () => {
  const source = read("src/components/storefront/preview/HeroPreview.jsx");
  assert.equal(/(^|[^A-Za-z-])className=/.test(source), false);
  assert.match(source, /inline styles/);
});

/* ------------------------------------------------------------------ */
/* The harness renders                                                 */
/* ------------------------------------------------------------------ */

test("the harness renders the real hero with labelled fixtures when no backend answers", () => {
  const html = renderToStaticMarkup(React.createElement(HeroPreview));
  assert.match(html, /Editorial hero — Phase 1\.5 preview/);
  assert.match(html, /Preview fixture — canonical hero content/);
  assert.match(html, /data-active-slide="hero-1"/);
  assert.match(html, /data-slide-layout="left"/);
  /* Harness chrome only — the hero itself still has one action and no controls. */
  assert.equal((html.match(/data-hero-cta=/g) ?? []).length, 1);
});

test("the fixture badge disappears once real backend slides exist", () => {
  const source = read("src/components/storefront/preview/HeroPreview.jsx");
  assert.match(source, /LIVE backend data/);
  assert.match(source, /dataMode === "auto" && !hasLive/);
});

test("the harness offers every layout and every breakpoint without touching the hero", () => {
  const source = read("src/components/storefront/preview/HeroPreview.jsx");
  for (const layout of ["left", "panel", "right", "split", "top"]) {
    assert.match(source, new RegExp(`"${layout}"`));
  }
  for (const width of ["1280", "834", "390"]) {
    assert.match(source, new RegExp(width));
  }
  /* Device frames are real iframes so media queries see a real viewport. */
  assert.match(source, /<iframe/);
});

/* ------------------------------------------------------------------ */
/* Dev-server self-heal (the "white blank page" the reviewer reported) */
/* ------------------------------------------------------------------ */

/**
 * The harness entry imports React/ReactDOM/ReactRouter from
 * `/node_modules/.vite/deps/*.js?v=<hash>` URLs. When the Vite dependency
 * optimizer re-runs, every previous hash answers `504 Outdated Optimize Dep`
 * (empty body, nothing in the terminal), the entry never executes and the page
 * stays blank. The harness document carries a guard for exactly that. This runs
 * the guard for real, against a stub document.
 */
const guardSource = () => {
  const html = read("preview.html");
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
  const guard = inline.find((code) => code.includes("preview-root"));
  assert.ok(guard, "preview.html carries the self-heal guard");
  return guard;
};

const stubEnvironment = ({ container, entrySrc = "/src/components/storefront/preview/main.jsx?t=1", storedAt = 0 }) => {
  const listeners = {};
  const calls = { reload: 0, timeouts: [], errors: [], warnings: [] };
  const entry = {
    type: "module",
    src: entrySrc,
    addEventListener: (type, handler) => {
      listeners[type] = handler;
    },
  };
  const document = {
    getElementById: () => container,
    scripts: [entry],
  };
  const window = {
    location: { reload: () => { calls.reload += 1; } },
    setTimeout: (fn) => { calls.timeouts.push(fn); return calls.timeouts.length; },
    sessionStorage: {
      getItem: () => (storedAt ? String(storedAt) : null),
      setItem: () => {},
    },
  };
  const console = {
    error: (message) => calls.errors.push(String(message)),
    warn: (message) => calls.warnings.push(String(message)),
  };
  return { listener: (type) => listeners[type], calls, document, window, console };
};

test("the harness reloads once when a module URL goes stale, and never masks a code error", () => {
  const guard = guardSource();
  const run = (env) => new Function("document", "window", "console", guard)(env.document, env.window, env.console);

  /* 1. Not the harness document: say so, never reload. */
  const wrongDocument = stubEnvironment({ container: null });
  run(wrongDocument);
  assert.equal(wrongDocument.calls.reload, 0);
  assert.match(wrongDocument.calls.errors.join("\n"), /no #preview-root element/);

  /* 2. A module that fails to load (the 504 case): warn with the diagnosis, reload once. */
  const stale = stubEnvironment({ container: { childElementCount: 0 } });
  run(stale);
  stale.listener("error")();
  assert.equal(stale.calls.reload, 1);
  assert.match(stale.calls.warnings.join("\n"), /504 Outdated Optimize Dep/);

  /* 3. A second failure inside the window: report, do not reload again. */
  const again = stubEnvironment({ container: { childElementCount: 0 }, storedAt: Date.now() });
  run(again);
  again.listener("error")();
  assert.equal(again.calls.reload, 0);
  assert.match(again.calls.errors.join("\n"), /already reloaded within the last 20s/);

  /* 4. The graph loaded but nothing mounted: that is a code error — report it, do not reload. */
  const empty = stubEnvironment({ container: { childElementCount: 0 } });
  run(empty);
  empty.listener("load")();
  assert.equal(empty.calls.timeouts.length, 1);
  empty.calls.timeouts[0]();
  assert.equal(empty.calls.reload, 0);
  assert.match(empty.calls.errors.join("\n"), /code error/);

  /* 5. The graph loaded and mounted: silence. */
  const healthy = stubEnvironment({ container: { childElementCount: 3 } });
  run(healthy);
  healthy.listener("load")();
  healthy.calls.timeouts[0]();
  assert.equal(healthy.calls.reload, 0);
  assert.deepEqual(healthy.calls.errors, []);
  assert.deepEqual(healthy.calls.warnings, []);
});
