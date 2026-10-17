/**
 * PRATIKSHYA FASHION · the premium footer, as a unit.
 *
 * `customerShellIntegrity` asks whether the footer the customer receives is the
 * one the shell mounts. This file asks the two questions about the footer
 * itself that the shell cannot answer:
 *
 *   1. THE COMPOSITION — the reference's three bands, its 24 navigation labels
 *      in its order, the five service items, the house's own sentences, and an
 *      anchor only where a route this application registers exists.
 *   2. THE CASCADE — `customer.css` is byte-for-byte the design's stylesheet and
 *      may not be edited, so the retired compact footer's rules are alive beside
 *      this surface. Each one that would still paint must be answered by
 *      `customer.footer.css`, property by property. The sheet's scope, its
 *      breakpoints, its palette and the plate it paints are pinned here.
 *
 * The panel's behaviour is exercised through `react-test-renderer`: an
 * incomplete address is refused before anything is attempted, and a complete one
 * is kept on the device with a status line that says so — never a success the
 * house cannot honour.
 *
 * WHAT THIS CANNOT PROVE: there is no browser in this tree, so computed
 * geometry — column widths at 1440px, the panel's radius, where the silk band
 * lands at 390px — is asserted nowhere. Pixels still need a viewport.
 */

import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create as renderTree } from "react-test-renderer";
import { createServer } from "vite";
import { MemoryRouter } from "react-router-dom";

import { parseCssRules } from "../../../../scripts/customer-port.js";
import { isRegisteredPath } from "../router/routes.js";
import { PAYMENT_METHODS } from "../../../config/checkoutConfig.js";

function projectRoot() {
  let directory = new URL(".", import.meta.url);
  for (let step = 0; step < 10; step += 1) {
    if (existsSync(new URL("package.json", directory))) return fileURLToPath(directory);
    directory = new URL("../", directory);
  }
  throw new Error("frontend root not found");
}

const ROOT = projectRoot();
const PLATE = join(ROOT, "public/design/pratikshya-footer-background.webp");
const read = (relative) => readFileSync(join(ROOT, relative), "utf8");
const esc = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* ── the rendered footer, and the panel as an interactive tree ─────────────── */

let markup = "";
let premium = null;
let site = null;
let newsletter = null;
let Newsletter = null;
let validateAddress = null;
let vite = null;

before(async () => {
  vite = await createServer({ root: ROOT, logLevel: "error", server: { middlewareMode: true }, appType: "custom" });
  const [Footer, panelModule, footerPremium, data, service] = await Promise.all([
    vite.ssrLoadModule("/src/components/customer/components/layout/Footer.jsx"),
    vite.ssrLoadModule("/src/components/customer/components/footer/FooterNewsletter.jsx"),
    vite.ssrLoadModule("/src/components/customer/mock/data/footerPremium.js"),
    vite.ssrLoadModule("/src/components/customer/data/index.js"),
    vite.ssrLoadModule("/src/components/customer/services/newsletter.js"),
  ]);
  Newsletter = panelModule.default;
  validateAddress = panelModule.validateAddress;
  premium = footerPremium;
  site = data.site;
  newsletter = service;
  markup = renderToStaticMarkup(
    React.createElement(MemoryRouter, { initialEntries: ["/account/orders"] }, React.createElement(Footer.default)),
  );
});

after(async () => {
  await vite?.close();
});

const count = (needle) => markup.split(needle).length - 1;
const at = (needle) => markup.indexOf(needle);
const anchors = (html) => [...html.matchAll(/<a[^>]*href="([^"]*)"/g)].map((match) => match[1]);

test("the reference's three bands, once each, in its order", () => {
  assert.equal(count('<footer class="footer">'), 1, "the footer is not exactly one element");
  const bands = ['class="fnews"', 'class="footer__main"', 'class="footer__brand"', 'class="footer__groups"', 'class="footer__care"', 'class="container footer__bottom"'];
  for (const band of bands) assert.ok(at(band) > -1, `${band} is missing`);
  const positions = bands.map(at);
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b), "the bands are out of order");
  assert.equal(count('class="footer__rule"'), 2, "the two hairline dividers are not both drawn");
  assert.equal(/<section/.test(markup), false, "the footer added a section landmark to the page");
});

test("the four columns carry the reference's 24 labels, in its order", () => {
  const titles = [...markup.matchAll(/<h2 class="fgroup__title"[^>]*>([^<]+)<\/h2>/g)].map((match) => match[1]);
  assert.deepEqual(titles, ["Shop", "Edits", "Client Care", "The House"], "the columns are not the reference's");
  const expected = {
    Shop: ["Women", "Men", "Kids", "Essentials", "New Arrivals", "Gift Cards"],
    Edits: ["Sarees", "Bridal", "Jewellery", "Kurtis", "Festive Collection", "Wedding Looks"],
    "Client Care": ["Shipping & Delivery", "Returns & Exchanges", "Track Your Order", "Size Guide", "Care Instructions", "Contact Us"],
    "The House": ["Our Story", "Artisans & Craft", "Sustainability", "Authenticity", "Privacy Policy", "Terms of Use"],
  };
  assert.deepEqual(
    [...markup.matchAll(/<nav class="fgroup" aria-labelledby="([^"]+)"/g)].map((match) => match[1]),
    titles.map((title) => `footer-${title.toLowerCase().replace(/\s+/g, "-")}`),
    "a column's links are not labelled by its own heading",
  );
  for (const [title, labels] of Object.entries(expected)) {
    const column = premium.footerColumns.find((entry) => entry.title === title);
    assert.ok(column, `${title} is not in the footer's data`);
    assert.deepEqual(column.links.map((link) => link.label), labels, `${title}: the labels moved or went missing`);
    const block = markup.slice(at(`id="footer-${title.toLowerCase().replace(/\s+/g, "-")}"`));
    for (const label of labels) {
      assert.ok(block.includes(`>${esc(label)}</a>`), `${title} → ${label} is not rendered`);
    }
  }
  assert.equal(premium.footerLinkCount, 24, "the four columns carry 24 links");
  /* A label the house cannot place is dropped by the builder — never linked to
     `#`. Counting the labels is what keeps that rule from hiding a gap. */
  assert.equal(
    premium.footerColumns.every((column) => column.links.length === 6),
    true,
    "a column lost a link to an unresolved destination",
  );
});

test("every footer destination is a route this application registers", () => {
  const hrefs = anchors(markup);
  /* 24 navigation links, the lockup's home, and the support desk. */
  assert.equal(hrefs.length, 26, `the footer offered ${hrefs.length} destinations`);
  for (const href of hrefs) {
    assert.ok(isRegisteredPath(href), `the footer links to ${href}, which is not registered`);
    assert.notEqual(href, "#", "the footer offers an unfinished link");
  }
  assert.equal(hrefs.includes("/collections/new-arrivals"), true, "New Arrivals does not reach the house's own collection");
  assert.equal(hrefs.filter((href) => href === "/").length, 1, "the lockup is the only link home");
});

test("the brand block speaks with the house's own voice", () => {
  assert.ok(markup.includes('<img class="footer__mark-logo"'), "the official mark is not on the footer");
  assert.ok(markup.includes("An Indian wardrobe, <em>composed slowly.</em>"), "the lede lost its italic");
  assert.ok(markup.includes(esc(site.description)), "the description is not the record's");
  assert.ok(markup.includes('<span class="footer__word">PRATIKSHYA</span>'), "the wordmark is missing");
  assert.ok(markup.includes('<span class="footer__sub">Fashion</span>'), "the secondary label is missing");
  assert.match(markup, /© \d{4} PRATIKSHYA FASHION\. All rights reserved\./, "the copyright row is not the house's");
  assert.ok(markup.includes("Rooted in Tradition") && markup.includes("Woven for Today"), "the tagline left the legal bar");
  assert.ok(markup.includes(`>${esc(site.contact.city)}</span>`), "the city left the legal bar");
  assert.equal(/prototype|sample catalogue/i.test(markup), false, "prototype copy reached the customer's footer");
});

test("the social rail draws the record's profiles and anchors only published ones", () => {
  const rail = markup.slice(at('class="footer__social"'));
  const items = rail.slice(0, rail.indexOf("</ul>"));
  assert.equal(items.split("<li").length - 1, site.social.length, "the rail is not the record's list");
  assert.equal((items.match(/<a /g) ?? []).length, site.social.filter((profile) => profile.href).length, "an unpublished profile became a link");
  for (const profile of site.social) {
    const name = profile.href ? profile.label : `${profile.label} — the house has not published this profile yet`;
    assert.ok(items.includes(esc(name)), `${profile.label} does not say what it is`);
  }
  assert.equal(items.includes("mailto:") || items.includes("tel:"), Boolean(site.contact.email), "the footer published an address the record does not hold");
});

test("the care rail states the store's rules, not the reference's", () => {
  /* `readShippingRules()` has no browser storage in Node, so the footer renders
     the store's authored default — which is what this line must agree with. */
  const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
  assert.ok(
    markup.includes(esc(`Normal always · standard free at ${inr.format(5000)}+`)),
    "the delivery line is not the store's own",
  );
  assert.equal(/prepaid/i.test(markup), false, "the footer repeats a shipping claim this checkout does not have");
  assert.ok(markup.includes('class="fcare__link" href="/contact"'), "the support item does not reach the contact desk");
  assert.equal((markup.match(/class="fcare"/g) ?? []).length, 3, "the care rail is not the three items the record supports");
  /* A store with shipping switched off is not promised a delivery. */
  assert.deepEqual(
    premium.careHighlights({ shippingEnabled: false, freeShippingThreshold: 5000 }).map((item) => item.id),
    ["support", "payments"],
    "shipping was promised while shipping is off",
  );
});

test("the payment marks are the checkout's own instruments", () => {
  assert.equal(premium.paymentMarks.length, 5, "the reference's five marks, all of them verified");
  const rail = markup.slice(at('class="footer__payments"'));
  const items = rail.slice(0, rail.indexOf("</ul>"));
  assert.equal(items.split("<li").length - 1, 5, "the bar drew a different number of marks");
  for (const mark of premium.paymentMarks) {
    assert.ok(items.includes(esc(mark.label)), `${mark.label} has no accessible name`);
    const method = PAYMENT_METHODS.find((entry) => entry.id === mark.method);
    assert.ok(method, `${mark.label} names a method the checkout does not have`);
    assert.equal(mark.verified, true, `${mark.label} is rendered without the checkout vouching for it`);
    assert.ok(
      [method.label, method.description].join(' · ').includes(mark.label),
      `${mark.label} is not named by ${method.label}`,
    );
  }
  /* The instrument the house does not offer must be absent, not greyed out. */
  assert.equal(premium.paymentMarks.some((mark) => /american express|paypal/i.test(mark.label)), false, "an unoffered instrument is on the footer");
});

/* ── the panel, interactively ──────────────────────────────────────────────── */

const textOf = (node) => {
  if (node === null || node === undefined) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (node.type === "svg") return "";
  return textOf(node.children);
};
const findByProps = (root, match) => {
  const found = root.findAll((instance) => {
    const props = instance.props ?? {};
    return match(props, typeof instance.type === "string" ? instance.type : "");
  });
  return found[0] ?? null;
};

const mountPanel = async () => {
  let tree = null;
  await act(async () => {
    tree = renderTree(React.createElement(Newsletter));
  });
  return { tree, root: tree.root };
};
/* A submit handler is async: every step that touches state runs inside `act`,
   and `act` is awaited, or the update lands after the assertions do. */
const step = async (fn) => { await act(async () => { fn(); }); };

test("the panel is a real field that says what it can and cannot do", async () => {
  const { tree, root } = await mountPanel();
  const input = findByProps(root, (props) => props.type === "email");
  const status = findByProps(root, (props) => props.id === "footer-news-message");
  assert.ok(input, "there is no email field");
  assert.equal(input.props.disabled, false, "the field is dead on arrival");
  assert.equal(input.props["aria-invalid"], false, "an idle field must not claim an error");
  assert.ok(findByProps(root, (props) => props.htmlFor === "footer-news-email"), "the field has no label");
  assert.equal(textOf(status).includes(newsletter.UNAVAILABLE_MESSAGE), true, "an unconnected service goes unstated");
  assert.equal(textOf(root).includes("Welcome to the Circle"), false, "the idle panel claims a subscription");
  await step(() => tree.unmount());
});

test("an incomplete address is refused, and the refusal is announced", async () => {
  const { tree, root } = await mountPanel();
  const form = findByProps(root, (props, type) => type === "form");
  const input = findByProps(root, (props) => props.type === "email");
  await step(() => input.props.onChange({ target: { value: "aisha at pratikshya.in" } }));
  await step(() => form.props.onSubmit({ preventDefault() {} }));
  const status = findByProps(root, (props) => props.id === "footer-news-message");
  const message = textOf(status);
  assert.equal(message.includes("looks incomplete"), true, `the panel said: ${message}`);
  assert.equal(findByProps(root, (props) => props.type === "email").props["aria-invalid"], true, "the field does not report itself invalid");
  assert.equal(input.props.value, "aisha at pratikshya.in", "a refused address was thrown away");
  assert.equal(/saved/i.test(message), false, "a refusal must not also claim a save");
  await step(() => tree.unmount());
});

test("a complete address is kept on the device — and the panel says exactly that", async () => {
  const { tree, root } = await mountPanel();
  const form = findByProps(root, (props, type) => type === "form");
  const input = findByProps(root, (props) => props.type === "email");
  await step(() => input.props.onChange({ target: { value: "  aisha@pratikshya.in " } }));
  await step(() => form.props.onSubmit({ preventDefault() {} }));
  const message = textOf(findByProps(root, (props) => props.id === "footer-news-message"));
  assert.equal(message.includes("Saved in this browser only"), true, `the panel said: ${message}`);
  assert.equal(message.includes("nothing has been sent to us"), true, "the limit is not stated: " + message);
  assert.equal(message.includes("Welcome to the Circle"), false, "the panel invented a subscription");
  assert.equal(findByProps(root, (props) => props.type === "email").props.value, "", "a kept address should clear the field");
  assert.equal(findByProps(root, (props) => props.className === "fnews__submit").props.disabled, false, "the button stayed busy");
  await step(() => tree.unmount());
});

test("the panel's gate accepts complete addresses and refuses the rest", () => {
  for (const good of ["aisha@pratikshya.in", "  aisha@pratikshya.in  ", "a.b+c@house.co.in"]) {
    assert.equal(validateAddress(good), null, `"${good}" was refused`);
  }
  for (const bad of ["", "   ", "aisha@", "@pratikshya.in", "aisha@pratikshya", "aisha at pratikshya.in"]) {
    assert.equal(typeof validateAddress(bad), "string", `"${bad}" was accepted`);
    assert.equal(validateAddress(bad).includes("Subscription"), false, "a refusal must name the address, not the service");
  }
  /* What the gate refuses, the panel reports — the two must never disagree. */
  assert.equal(validateAddress("aisha@pratikshya.in"), null);
});

/* ── the sheet ────────────────────────────────────────────────────────────── */

const sheet = () => read("src/components/customer/customer.footer.css");
const rules = () => parseCssRules(sheet());
/* A rule may carry a selector LIST; match any of its parts. */
const forSelector = (selector) => rules().filter((rule) => rule.selector.split(",").some((part) => part.trim() === selector));
const declares = (selector, declaration, condition = null) =>
  forSelector(selector)
    .filter((rule) => !condition || rule.conditions.some((entry) => entry.includes(condition)))
    .some((rule) => rule.declarations.replace(/\s+/g, " ").includes(declaration));

test("the sheet is scoped, self-contained and does not shout", () => {
  const offenders = [];
  for (const rule of rules()) {
    if (rule.type !== "rule") continue;
    for (const part of rule.selector.split(",")) {
      if (!part.trim().startsWith(".pf-root")) offenders.push(part.trim());
    }
  }
  assert.deepEqual(offenders, [], "a rule would apply outside the customer port");
  assert.equal(sheet().includes("!important"), false, "!important is not how two sheets settle a surface");
  assert.equal(/@import/.test(sheet()), false, "the sheet pulls another file in");
  assert.ok(rules().length > 80, `${rules().length} rules — thinner than the reference's surface`);
  const families = [...new Set([...sheet().matchAll(/font-family:[^;]+;/g)].map((match) => match[0].replace(/font-family:\s*/, "").replace(/;$/, "").trim()))];
  assert.deepEqual(families.sort(), ["var(--f-sans)", "var(--f-serif)"], "the sheet asks for a family the port does not load");
});

test("the silk band is staged, addressed, and not a placeholder", () => {
  assert.ok(existsSync(PLATE), "the footer's background plate is not staged");
  const bytes = statSync(PLATE).size;
  assert.ok(bytes > 8_000 && bytes < 400_000, `the plate weighs ${bytes} bytes — outside a sane band for a full-width backdrop`);
  assert.equal(readFileSync(PLATE).subarray(0, 4).toString("latin1"), "RIFF", "the plate is not a webp");
  assert.ok(readFileSync(PLATE).subarray(8, 12).toString("latin1") === "WEBP", "the plate is not a webp");
  assert.ok(
    forSelector(".pf-root .footer").some((rule) => rule.declarations.includes('url("/design/pratikshya-footer-background.webp")')),
    "the sheet does not paint the plate",
  );
  /* A background stack whose shorthands run short is silently REPEATED by the
     browser, so the plate would be sized by the veil's value. Every property
     below must carry exactly one entry per image layer. */
  const stack = (property) => {
    /* Read the declaration out of the rule's text rather than splitting on `;`:
       a comment sitting between two declarations belongs to neither. */
    const rule = forSelector(".pf-root .footer").find((entry) => new RegExp(`${property}:`).test(entry.declarations));
    assert.ok(rule, `the base .footer rule declares no ${property}`);
    const value = new RegExp(`${property}:\\s*([\\s\\S]*?);`).exec(rule.declarations)[1].trim();
    const parts = [];
    let depth = 0;
    let current = "";
    for (const char of value) {
      if (char === "(") depth += 1;
      if (char === ")") depth -= 1;
      if (char === "," && depth === 0) { parts.push(current.trim()); current = ""; continue; }
      current += char;
    }
    parts.push(current.trim());
    return parts;
  };
  const layers = stack("background-image");
  assert.ok(layers.length >= 4, "the footer's background stack is thinner than veil + lift + glows + plate");
  assert.match(
    layers.at(-1),
    /^url\("\/design\/pratikshya-footer-background\.webp"\)$/,
    "the artwork is not the bottom-most layer — the veil would be painted over nothing",
  );
  for (const property of ["background-size", "background-repeat", "background-position"]) {
    assert.equal(stack(property).length, layers.length, `${property} does not carry one entry per image layer`);
  }
  assert.ok(
    layers[0].startsWith("linear-gradient(") && /rgba\(\d+, \d+, \d+, 0\.\d+\) 100%/.test(layers[0]),
    "the topmost layer does not close on an opaque-enough veil for the legal bar",
  );
  assert.ok(declares(".pf-root .footer", "overflow: hidden"), "the artwork could escape the footer");
  assert.ok(declares(".pf-root .footer::before", "pointer-events: none"), "the contrast veil could eat a click");
});

test("every retired compact-footer rule that would still paint is answered", () => {
  assert.ok(declares(".pf-root .footer__groups", "border-left: 0"), "the design's left rule on the groups survives");
  assert.ok(declares(".pf-root .footer__groups", "padding-left: 0"), "the design's 40px pad on the groups survives");
  assert.ok(declares(".pf-root .footer__bottom", "border-top: 0"), "the legal bar gets a second hairline");
  assert.ok(declares(".pf-root .footer a", "text-decoration: none"), "every footer link stays underlined");
  assert.ok(declares(".pf-root .footer a:hover", "opacity: 1"), "the design's dimmed hover survives");
  assert.ok(declares(".pf-root .fgroup__list li", "margin-bottom: 0"), "the design's 5px link margin fights the gap");
  assert.ok(declares(".pf-root .footer a:focus-visible", "var(--ft-champagne)"), "links keep the design's ivory focus ring");
  /* And the classes the retired layout owned are not revived with a new meaning. */
  for (const dead of ["footer__top", "footer__news", "footer__signature", "footer__legal", "footer__opening"]) {
    assert.equal(sheet().includes(dead), false, `the sheet styles ${dead}, which this footer does not render`);
  }
});

test("the surface reflows instead of shrinking, and the artwork follows", () => {
  const conditions = [...new Set(rules().flatMap((rule) => rule.conditions))];
  for (const width of ["max-width: 1343px", "max-width: 1199px", "max-width: 899px", "max-width: 767px", "max-width: 479px", "min-width: 1700px"]) {
    assert.ok(conditions.some((entry) => entry.includes(width)), `@media (${width}) is missing`);
  }
  assert.ok(conditions.some((entry) => entry.includes("prefers-reduced-motion: reduce")), "transitions are not answered for reduced motion");
  assert.ok(forSelector(".pf-root .footer__main")[0].declarations.includes("auto"), "the dividers left the desktop grid");
  assert.ok(
    forSelector(".pf-root .footer__main").some((rule) => rule.conditions.some((entry) => entry.includes("max-width: 1199px"))),
    "the main grid does not reflow at tablet width",
  );
  assert.ok(
    rules().some((rule) => rule.selector === ".pf-root .fnews" && rule.conditions.some((entry) => entry.includes("max-width: 1199px"))),
    "the newsletter panel does not stack at tablet width",
  );
  assert.ok(
    rules().some((rule) => rule.conditions.some((entry) => entry.includes("max-width: 899px")) && rule.declarations.includes("background-position")),
    "the artwork is not repositioned for narrow viewports",
  );
  assert.ok(
    rules().some((rule) => rule.conditions.some((entry) => entry.includes("max-width: 767px")) && rule.declarations.includes("width: 100%")),
    "the Subscribe button does not go full width on mobile",
  );
});

test("the reference's palette is the sheet's own vocabulary", () => {
  const root = forSelector(".pf-root .footer")[0].declarations.replace(/\s+/g, " ");
  for (const token of [
    "--ft-wine: #26000d", "--ft-burgundy: #3b0616", "--ft-night: #1b0008",
    "--ft-gold: #b98a48", "--ft-champagne: #f1cc8e", "--ft-ivory: #f7eee7", "--ft-muted: #c6adb2",
    "--ft-gold-soft: rgba(205, 157, 91, 0.42)",
  ]) {
    assert.ok(root.includes(token), `${token} is not the reference's value`);
  }
});
