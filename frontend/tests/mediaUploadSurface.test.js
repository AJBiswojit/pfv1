/**
 * PRATIKSHYA FASHION — the upload surface itself.
 *
 * Server-rendered through the project's own Vite pipeline (the pattern the
 * existing JSX suites use), so what is asserted here is markup that really
 * comes out of these components — not a promise in a comment.
 *
 * Covers the surface-level fixes:
 *   · the queue collects only what the server can store (no caption field) and
 *     freezes a row once the bytes have left the browser;
 *   · "awaiting confirmation" is visually and textually different from "failed";
 *   · the dropzone's file input is the control its label names;
 *   · the picker renders an accessible combobox, and an archived product is
 *     called out before anything is added to it;
 *   · the page refuses the first registration for a legacy-only product,
 *     guards in-flight work on leave, and never calls the removed second
 *     `/media/register` step from this page.
 */

import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { PRODUCT_MEDIA_STAGES } from "../src/services/media/productMediaService.js";

let vite;
let MediaUploadForm;
let MEDIA_SCOPES;
let MediaUploadQueue;
let MediaUploadDropzone;
let MediaProductSelector;

before(async () => {
  const { createServer } = await import("vite");
  vite = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "silent",
  });
  MediaUploadForm = (await vite.ssrLoadModule("/src/components/media/MediaUploadForm.jsx")).default;
  MEDIA_SCOPES = (await vite.ssrLoadModule("/src/config/mediaTypes.js")).MEDIA_SCOPES;
  MediaUploadQueue = (await vite.ssrLoadModule("/src/components/media/MediaUploadQueue.jsx")).default;
  MediaUploadDropzone = (await vite.ssrLoadModule("/src/components/media/MediaUploadDropzone.jsx")).default;
  MediaProductSelector = (await vite.ssrLoadModule("/src/components/media/MediaProductSelector.jsx")).default;
});

after(async () => {
  await vite?.close();
});

const FORM = readFileSync(
  new URL("../src/components/media/MediaUploadForm.jsx", import.meta.url),
  "utf8",
);

const queueItem = (overrides = {}) => ({
  key: `key-${overrides.name ?? "a"}`,
  file: { name: "plate-one.png", size: 2048 },
  type: "IMAGE",
  title: "Cover plate",
  alt: "Cream handloom sari on a wooden rail",
  role: "GALLERY",
  previewUrl: "/images/products/plate-one.png",
  stage: PRODUCT_MEDIA_STAGES.SELECTED,
  progress: 0,
  ...overrides,
});

const noop = () => {};

// ===========================================================================
// 1. The queue
// ===========================================================================

test("the queue has no caption field — the backend has no caption column", () => {
  const html = renderToStaticMarkup(
    React.createElement(MediaUploadQueue, { queue: [queueItem()], onRemoveItem: noop, onUpdateItem: noop, onClearQueue: noop })
  );
  assert.ok(!/caption/i.test(html), "no caption label, input or placeholder");
  assert.match(html, /Title/);
  assert.match(html, /Alt text/);
  assert.match(html, /Media role/);
});

test("every queue label is bound to its own control", () => {
  const html = renderToStaticMarkup(
    React.createElement(MediaUploadQueue, { queue: [queueItem()], onRemoveItem: noop, onUpdateItem: noop, onClearQueue: noop })
  );
  const htmlFor = [...html.matchAll(/<label[^>]*for="([^"]+)"/g)].map((match) => match[1]);
  const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(htmlFor.length >= 3, "title, alt text and role labels all carry a for=");
  for (const target of htmlFor) {
    assert.ok(ids.includes(target), `label points at a real control (${target})`);
  }
});

test("an unconfirmed request is not rendered as a failure", () => {
  const html = renderToStaticMarkup(
    React.createElement(MediaUploadQueue, {
      queue: [queueItem({ stage: PRODUCT_MEDIA_STAGES.UNCONFIRMED, stageMessage: "No server answer — verifying" })],
      onRemoveItem: noop,
      onUpdateItem: noop,
      onClearQueue: noop,
    })
  );
  assert.match(html, /Not confirmed — verifying/);
  assert.ok(!/Failed/.test(html), "an unanswered write must never be shown as failed");
  assert.match(html, /locked until the product&#x27;s media has been read back|locked until the product's media has been read back/);
});

test("a real failure carries the server's message", () => {
  const html = renderToStaticMarkup(
    React.createElement(MediaUploadQueue, {
      queue: [queueItem({ stage: PRODUCT_MEDIA_STAGES.FAILED, stageMessage: "Only image files are accepted." })],
      onRemoveItem: noop,
      onUpdateItem: noop,
      onClearQueue: noop,
    })
  );
  assert.match(html, /Failed — Only image files are accepted\./);
});

test("a stored row is read-only and explains why", () => {
  const html = renderToStaticMarkup(
    React.createElement(MediaUploadQueue, {
      queue: [queueItem({ stage: PRODUCT_MEDIA_STAGES.ASSIGNED, mediaId: "media-42", progress: 100 })],
      onRemoveItem: noop,
      onUpdateItem: noop,
      onClearQueue: noop,
    })
  );
  assert.match(html, /Registered &amp; assigned|Registered & assigned/);
  assert.match(html, /can no longer be edited here/);
  assert.match(html, /<input[^>]*disabled=""[^>]*id="title-key-a"|<input[^>]*id="title-key-a"[^>]*disabled=""/);
  assert.match(html, /role="progressbar"/);
});

// ===========================================================================
// 2. The dropzone
// ===========================================================================

test("the dropzone exposes the file input its page label points at", () => {
  const html = renderToStaticMarkup(
    React.createElement(MediaUploadDropzone, { onFilesSelected: noop })
  );
  assert.match(html, /id="media-file-input"/);
  assert.match(html, /type="file"/);
  assert.match(html, /multiple=""/);
  assert.match(html, /Up to 24 files per upload/);
  assert.match(html, /Browse Files/);
  assert.ok(!/video/i.test(html), "video is not offered as an upload format here");
});

test("the compact dropzone keeps drag-and-drop available after files are queued", () => {
  const html = renderToStaticMarkup(
    React.createElement(MediaUploadDropzone, { onFilesSelected: noop, compact: true })
  );
  assert.match(html, /Add more files/);
  assert.match(html, /id="media-file-input"/);
});

// ===========================================================================
// 3. The picker
// ===========================================================================

test("the picker renders an accessible combobox with an announced state", () => {
  const html = renderToStaticMarkup(
    React.createElement(MediaProductSelector, { selectedProductId: null, onSelectProduct: noop })
  );
  assert.match(html, /role="combobox"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /aria-autocomplete="list"/);
  assert.match(html, /Search product name or SKU/);
  assert.match(html, /Assigned Product/);
  assert.match(html, /aria-live="polite"/);
});

test("a selected archived product is called out before media is added", () => {
  const html = renderToStaticMarkup(
    React.createElement(MediaProductSelector, {
      selectedProductId: "PF-W-0042",
      selectedRecord: {
        id: "PF-W-0042",
        name: "Archived Sari",
        sku: "PF-W-0042",
        category: "saree",
        status: "ARCHIVED",
        image: null,
      },
      onSelectProduct: noop,
    })
  );
  assert.match(html, /Archived Sari/);
  assert.match(html, /will not appear on the storefront/);
  assert.match(html, /Change Product/);
});

test("a product without a SKU says so instead of showing a made-up one", () => {
  const html = renderToStaticMarkup(
    React.createElement(MediaProductSelector, {
      selectedProductId: "PF-W-0007",
      selectedRecord: { id: "PF-W-0007", name: "Unsaved Draft", sku: null, category: null, status: "DRAFT", image: null },
      onSelectProduct: noop,
    })
  );
  assert.match(html, /SKU unavailable/);
});

// ===========================================================================
// 4. The form (source contracts for the behaviour SSR cannot reach)
// ===========================================================================

test("the page writes once: no second /media/register step from this form", () => {
  assert.match(FORM, /uploadAndRegisterProductImages/);
  assert.ok(!/apiRegisterMediaObject/.test(FORM), "the redundant register call is gone");
  assert.ok(!/navigate\(-1\)/.test(FORM), "Cancel no longer walks the browser history");
  assert.match(FORM, /navigate\(`\$\{workspacePrefix\}\/media`\)/);
});

test("the page refuses the first registration for a legacy-only product", () => {
  assert.match(FORM, /legacyCatalogueOnly/);
  assert.match(FORM, /First registration is paused for this product/);
  assert.match(FORM, /Nothing has been modified/);
  assert.match(FORM, /Open product/);
  assert.ok(!/product_service/.test(FORM), "no backend contract talk in the UI");
});

test("an unreadable product blocks the write and offers a retry", () => {
  assert.match(FORM, /Existing media unverified/);
  assert.match(FORM, /Retry product read/);
  assert.match(FORM, /legacyCatalogueOnly\(context\.product, registeredItems\)/);
});

test("the page never asks for primacy from an employee session", () => {
  assert.match(FORM, /isEmployee: isEmployeeSession/);
  assert.match(FORM, /Employee uploads are added as gallery media/);
});

test("the page guards work in flight and cancels honestly", () => {
  assert.match(FORM, /addEventListener\("beforeunload"/);
  assert.match(FORM, /<ConfirmDialog/);
  assert.match(FORM, /abortRef\.current\?\.abort\(\)/);
  assert.match(FORM, /Stop upload/);
  assert.match(FORM, /may still (be stored|have been stored)/);
});

test("the page's file label is bound to the real input and the batch cap is stated", () => {
  assert.match(FORM, /htmlFor="media-file-input"/);
  assert.match(FORM, /UPLOAD_LIMITS\.MAX_FILES_PER_BATCH/);
  assert.match(FORM, /MEDIA_UPLOAD_TIMEOUT_MS/);
});

test("the page keeps its marketing branch untouched and honest", () => {
  assert.match(FORM, /MARKETING_MEDIA_BLOCKER/);
  assert.match(FORM, /never promoted automatically/);
});

test("the page does not persist anything in the browser", () => {
  assert.ok(!/localStorage/.test(FORM));
  assert.ok(!/sessionStorage/.test(FORM));
});

// ===========================================================================
// 5. Whole-form render
// ===========================================================================

const renderForm = (props = {}) =>
  renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(MediaUploadForm, {
        portalType: "admin",
        initialScope: MEDIA_SCOPES.PRODUCT,
        allowScopeChange: false,
        ...props,
      })
    )
  );

test("the admin upload page renders as one coherent form", () => {
  const html = renderForm();
  assert.match(html, /Select Files/);
  assert.match(html, /for="media-file-input"/);
  assert.match(html, /Search product name or SKU/);
  assert.match(html, /Upload &amp; Register Media|Upload & Register Media/);
  assert.match(html, /Cancel/);
  assert.ok(!/caption/i.test(html), "the caption field is gone from the rendered page");
  assert.ok(!/Preparing assets/i.test(html), "the unreachable preparing state is gone");
});

test("with a product in context the page says it is reading that product's media", () => {
  const html = renderForm({ initialProductId: "PF-W-0042" });
  assert.match(html, /Reading this product&#x27;s existing media from the server|Reading this product's existing media from the server/);
});

test("the employee portal states the catalogue gap instead of faking a search", () => {
  const html = renderForm({ portalType: "employee" });
  assert.match(html, /Employee sessions cannot search the full catalogue/);
  assert.match(html, /there is no employee product list/);
});

test("the employee portal never offers a cover decision", () => {
  const html = renderForm({ portalType: "employee", initialProductId: "PF-W-0042" });
  assert.match(html, /Employee uploads are added as gallery media/);
  assert.ok(!/Replace the product&#x27;s current cover|Replace the product's current cover/.test(html));
});
