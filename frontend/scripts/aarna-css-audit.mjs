/**
 * PHASE 2D — evidence tool (not part of the application).
 *
 * Static ownership audit: walks the application's real module graph from
 * `src/main.jsx`, collects the stylesheets the port does not own, extracts their
 * class tokens, and compares them with the ones the design's sheets use — then
 * checks whether any application rule can reach a collided class inside the
 * port's scope.
 *
 *   cd frontend && node scripts/aarna-css-audit.mjs
 */
import { readFileSync, existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/** The entry graph's stylesheets: main.jsx → imports → (recursively) .css. */
const visit = (file, seen = new Set(), css = new Set()) => {
  if (seen.has(file) || !existsSync(file)) return { seen, css };
  seen.add(file);
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(/import\s+(?:[^'"]*from\s+)?["']([^"']+)["']/g)) {
    const spec = match[1];
    if (spec.startsWith("@")) continue;
    const base = resolve(dirname(file), spec.split("?")[0]);
    const target = [base, `${base}.js`, `${base}.jsx`, `${base}.css`, `${base}/index.js`].find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
    if (!target) continue;
    if (target.endsWith(".css")) {
      const relative = target.slice(process.cwd().length + 1);
      /* The ported page is what we are comparing AGAINST: never part of the host set. */
      if (!relative.startsWith("src/components/aarna/")) css.add(relative);
      continue;
    }
    visit(target, seen, css);
  }
  return { seen, css };
};
const entry = resolve("src/main.jsx");
const { seen, css } = visit(entry);
console.log("entry graph:", seen.size, "modules ·", css.size, "stylesheets the port does not own:");
for (const sheet of css) console.log("   ·", sheet);

/* Tailwind's utilities are generated from the source; its own preflight and the
   app's component rules are what can collide. Compare CLASS TOKENS. */
const tokensIn = (text) => new Set([...text.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]));
const designCss = ["tokens", "base", "layout", "sections", "product", "shopping", "pages"]
  .map((name) => readFileSync(`../home-page/src/styles/${name}.css`, "utf8")).join("\n");
const designTokens = tokensIn(designCss);
const appText = [...css].map((file) => readFileSync(file, "utf8")).join("\n");
const appTokens = tokensIn(appText);
const lowered = new Map([...designTokens].map((token) => [token.toLowerCase(), token]));
const collisions = [...appTokens].filter((token) => lowered.has(token.toLowerCase()) && !/^pf-/.test(token));
console.log("\ndesign class tokens:", designTokens.size, "| tokens in the app's own global CSS:", appTokens.size);
console.log("class tokens used on BOTH sides (excluding the port's .pf-* shell):", collisions.length);
console.log("   ", collisions.sort().join(", ") || "none");
console.log("\nreach check — do any app rules target those tokens from outside a .pf- scope?");
let reachable = 0;
for (const token of collisions.sort()) {
  const rules = [...appText.matchAll(new RegExp(`[^{}]*\\.${token}(?![\\w-])[^{}]*\\{[^}]*\\}`, "g"))].map((m) => m[0].replace(/\s+/g, " ").slice(0, 90));
  const unscoped = rules.filter((rule) => !/\.pf-/.test(rule) && !rule.includes("@"));
  reachable += unscoped.length;
  if (unscoped.length) console.log(`   ${token}: ${unscoped.length} rule(s) outside .pf- scope —`, unscoped[0]);
}
console.log(
  reachable
    ? `   ${reachable} rule(s) can reach a collided class inside .aan-root — the port must be scoped further.`
    : "   none — every rule that names one of them is inside a .pf- scope, so none can reach .aan-root.",
);
process.exitCode = reachable ? 1 : 0;
