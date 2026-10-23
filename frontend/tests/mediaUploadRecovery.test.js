/**
 * PRATIKSHYA FASHION — Phase 4 regressions F1 (replacement wording) and
 * F2 (drag-and-drop highlight).
 *
 * F1 — WHAT WAS WRONG
 * -------------------
 * The 409 recovery panel told the operator that replacing the stored object
 * "would change what that record points at". That is not what the server does:
 * a replacement is written to a NEW content-addressed key and registered as a
 * NEW media entry, while the existing entry stays attached to the product
 * (verified live: associations went 1 → 2 after a replacement). The copy is now
 * the exported `collisionCopy` contract and states the real consequence.
 *
 * F2 — WHAT WAS WRONG
 * -------------------
 * `dragleave` fires on the dropzone container every time the pointer crosses
 * into one of its children, because the child's `dragleave` bubbles. Clearing
 * the highlight on those events made it flicker (MEDIA-UPLOAD-027). The
 * container handler now ignores a leave whose `relatedTarget` is still inside
 * the dropzone; a real exit still clears it.
 *
 * These tests drive the REAL components (no mocks of the behaviour): the copy
 * is imported from the form module, and the drag handlers are invoked on the
 * real dropzone's rendered container through react-test-renderer (already a
 * devDependency — no new package).
 */

import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React, { act } from "react";
import { create } from "react-test-renderer";
import { createServer } from "vite";

const original = {
  act: globalThis.IS_REACT_ACT_ENVIRONMENT,
};

let vite;
let MediaUploadDropzone;
let collisionCopy;

before(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vite = await createServer({
    root: new URL("..", import.meta.url).pathname,
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "silent",
  });
  MediaUploadDropzone = (await vite.ssrLoadModule("/src/components/media/MediaUploadDropzone.jsx"))
    .default;
  ({ collisionCopy } = await vite.ssrLoadModule("/src/components/media/MediaUploadForm.jsx"));
});

after(async () => {
  await vite?.close();
  globalThis.IS_REACT_ACT_ENVIRONMENT = original.act;
});

const FORM_SOURCE = readFileSync(
  new URL("../src/components/media/MediaUploadForm.jsx", import.meta.url),
  "utf8",
);

/* ------------------------------------------------------------------------- */
/* F1 — replacement wording                                                  */
/* ------------------------------------------------------------------------- */

test("F1: the collision headline names the file and says an object already exists", () => {
  assert.equal(collisionCopy.headline("saree.png"), "An object already exists for saree.png.");
});

test("F1: the admin recovery copy says the retry creates a NEW media entry", () => {
  const copy = collisionCopy.admin();
  assert.match(copy, /adds a new media entry/i);
  assert.match(copy, /Nothing was overwritten/i);
});

test("F1: the employee recovery copy says the retry creates a NEW media entry", () => {
  const copy = collisionCopy.employee();
  assert.match(copy, /replacement adds a new media entry/i);
  assert.match(copy, /Nothing was overwritten/i);
});

test("F1: both recovery copies say the existing entry stays attached", () => {
  for (const [who, copy] of [
    ["admin", collisionCopy.admin()],
    ["employee", collisionCopy.employee()],
  ]) {
    assert.match(copy, /existing entry stays attached/i, `${who}: existing entry must stay attached`);
  }
});

test("F1: both recovery copies point at the product media manager for a later detach", () => {
  for (const [who, copy] of [
    ["admin", collisionCopy.admin()],
    ["employee", collisionCopy.employee()],
  ]) {
    assert.match(copy, /detached (later )?in the product media\s+manager/i, who);
  }
});

test("F1: the confirmation copy repeats the new-entry / stays-attached consequence", () => {
  const copy = collisionCopy.confirm("saree.png");
  assert.match(copy, /new media entry for saree\.png/);
  assert.match(copy, /alongside the existing entry, which stays attached/i);
  assert.match(copy, /detached later in the product media manager/i);
  assert.match(copy, /Submit again to confirm/i);
});

test("F1: the corrected claim replaced the old 'would change what that record points at' text", () => {
  assert.doesNotMatch(FORM_SOURCE, /would change what that record points at/i);
});

test("F1: both recovery panels and the confirm button read the exported copy", () => {
  const uses = FORM_SOURCE.match(/collisionCopy\./g) || [];
  assert.ok(uses.length >= 4, `expected the copy contract to be used at least 4 times, saw ${uses.length}`);
  assert.match(FORM_SOURCE, /setFormError\(collisionCopy\.confirm\(/);
});

test("F1: nothing in the collision path auto-detaches or deletes media", () => {
  // The decision was explicit: correct the words, never remove the old entry.
  assert.doesNotMatch(FORM_SOURCE, /detachProductMedia|removeProductMedia|deleteProductMedia|deleteMedia/i);
  assert.doesNotMatch(FORM_SOURCE, /\.delete\(/);
});

/* ------------------------------------------------------------------------- */
/* F2 — drag-and-drop highlight containment                                  */
/* ------------------------------------------------------------------------- */

const HIGHLIGHT = "border-accent";

function renderDropzone() {
  let renderer;
  act(() => {
    renderer = create(React.createElement(MediaUploadDropzone, { onFilesSelected: () => {} }));
  });
  return renderer;
}

function containerOf(renderer) {
  const node = renderer.root
    .findAllByType("div")
    .find((candidate) => typeof candidate.props.onDragLeave === "function");
  assert.ok(node, "the dropzone container must own the drag handlers");
  return node;
}

function classNameOf(renderer) {
  return containerOf(renderer).props.className;
}

function dragOver(renderer) {
  const node = containerOf(renderer);
  act(() => node.props.onDragOver({ preventDefault() {} }));
}

function dragLeave(renderer, relatedTarget, inner) {
  const node = containerOf(renderer);
  act(() =>
    node.props.onDragLeave({
      preventDefault() {},
      relatedTarget,
      // Mirrors DOM `Node.contains`: only nodes inside the container match.
      currentTarget: { contains: (candidate) => candidate === inner },
    }),
  );
}

test("F2: dragging over the dropzone raises the highlight", () => {
  const renderer = renderDropzone();
  assert.doesNotMatch(classNameOf(renderer), new RegExp(HIGHLIGHT));
  dragOver(renderer);
  assert.match(classNameOf(renderer), new RegExp(HIGHLIGHT));
});

test("F2: a dragleave whose destination is inside the dropzone keeps the highlight", () => {
  const renderer = renderDropzone();
  dragOver(renderer);
  const inner = { tagName: "H3" };
  dragLeave(renderer, inner, inner);
  assert.match(
    classNameOf(renderer),
    new RegExp(HIGHLIGHT),
    "a child-to-child move must not clear the highlight (MEDIA-UPLOAD-027)",
  );
});

test("F2: a dragleave that leaves the dropzone entirely clears the highlight", () => {
  const renderer = renderDropzone();
  dragOver(renderer);
  dragLeave(renderer, null, { tagName: "H3" });
  assert.doesNotMatch(classNameOf(renderer), new RegExp(HIGHLIGHT));
});

test("F2: a drop still clears the highlight", () => {
  const renderer = renderDropzone();
  dragOver(renderer);
  const node = containerOf(renderer);
  act(() => node.props.onDrop({ preventDefault() {}, dataTransfer: { files: [] } }));
  assert.doesNotMatch(classNameOf(renderer), new RegExp(HIGHLIGHT));
});

test("F2: the guard reads containment from the real event target", () => {
  const source = readFileSync(
    new URL("../src/components/media/MediaUploadDropzone.jsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /event\.currentTarget\.contains\(event\.relatedTarget\)/);
});
