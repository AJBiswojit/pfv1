# AI provider contract — shopping assistant and AI Mirror

Status: **the shopping assistant and the AI Mirror run on DEMO providers.** Nothing in
this repository calls a real AI model, a real image-generation service, or a real
business-AI endpoint for a customer. This document describes what a real provider must
provide before it can replace a demo one. It is a contract, not a claim that any
provider has been approved, integrated or verified.

## 1. Where the seams are

| Surface | Seam file | Active provider today | Replaced by |
| --- | --- | --- | --- |
| Customer shopping assistant | `src/services/ai/aiService.js` (`activeProvider`) | `mockAiProvider` (`id: "mock"`) | one import, plus a provider that satisfies §2 |
| AI Mirror try-on | `src/services/aiMirror/virtualTryOnService.js` (`generateTryOnPreview`) | `generateMockVirtualTryOnPreview` (`VIRTUAL_TRY_ON_PROVIDER = "mock"`) | one import, plus a provider that satisfies §3 |
| Admin business assistant | `src/services/ai/aiService.js` (`askBusinessAssistant`) | **Not a demo.** Calls `POST /ai/business/ask` on the backend, which answers from the database | not part of this contract |

The UI never imports a provider directly. Screens call `aiService` or
`generateTryOnPreview`, so replacing a provider does not change a screen, a hook or a
route.

## 2. Shopping provider (`src/services/ai/aiProvider.js`)

A provider is an object with:

- `id` — stable identifier. `"mock"` marks the demo. The UI reads `isMockAiProvider()`
  (`id === "mock"`) to decide whether to show the demo chip and footnote.
- `label` — the human name shown to customers. For the demo it reads
  `PRATIKSHYA demo intelligence (deterministic)`. A real provider states what it is here.
- `respondShopping(request)` — async; resolves a shopping envelope.
- `respondBusiness(request)` — async; resolves a business envelope. The customer surface
  does not use it. It must still exist to satisfy `validateAiProvider`.

`validateAiProvider(provider)` returns a list of problems. An empty list means the
provider conforms. `aiService` logs a warning when a configured provider does not conform.

`respondShopping(request)` receives `question`, `products` (live storefront products from
the catalogue repository), `productContext`, `wishlistIds`, `recentIds`, `purchasedIds`,
`preferences` and an optional `onStage({ stage, message })` callback.

Rules a real shopping provider must meet:

1. **Grounding.** It may recommend only products in `products`. It must never invent a
   product, a price, stock, a discount or a delivery promise.
2. **Personal data.** `purchasedIds`, `wishlistIds` and `preferences` are personal data.
   They may be sent to a third party only under a documented, approved data-processing
   agreement, and only with the customer's consent where the law or policy requires it.
3. **Labelling.** Its `label` must say what answers the customer. It must never reuse the
   business assistant's label (`AI_PROVIDER_LABEL`, "live business data").
4. **Failure.** A failed or unavailable answer must be reported as a failure. It must not
   be dressed as an answer.

## 3. Try-on provider (AI Mirror)

`generateTryOnPreview({ product, onProgress, signal })` resolves a result, or rejects with
an `Error` whose `code` is one of:

| `code` | Meaning |
| --- | --- |
| `INELIGIBLE_PRODUCT` | The product is not eligible for a preview (`isVirtualTryOnEligibleProduct`). |
| `MOCK_PREVIEW_UNAVAILABLE` | The demo has no curated look for this piece. **The demo ends here, deliberately.** |
| `AbortError` (`name`) | The request was cancelled. |

The result, when a real provider produces one, carries the preview image and the
original image. The page shows an image only when both are present (`canCompare`).

Rules a real try-on provider must meet:

1. **Camera frames.** The AI Mirror's camera image is personal data. The current demo
   uploads nothing, stores nothing and saves no frame. A real provider may receive a frame
   only:
   - with explicit, per-session consent shown in the UI before the first upload;
   - with a stated retention period, and deletion of the frame after the result is made;
   - with no use for training unless the customer has separately agreed.
2. **Result honesty.** A preview must be labelled as an AI-generated preview. It must not
   be presented as a fitting, a measurement or a guarantee of fit.
3. **Cancellation.** The provider must honour `signal` and stop work when it is aborted.
4. **No fabricated result.** When it cannot produce a preview, it must reject with a code
   (as the demo does with `MOCK_PREVIEW_UNAVAILABLE`), never resolve with a stand-in image.

## 4. Labels and copy (what customers see today)

- The shopping chip reads `Demo assistant · deterministic`. The footnote reads
  `Demo assistant · grounded in the live catalogue`.
- The Mirror stage badge reads `DEMO PREVIEW`, and results are captioned `demo imagery`.
- The Mirror hero says a demo preview module, not a ready-in-moments result.
- No screen says a real AI operation completed while a demo provider produced the output.

## 5. What a real provider needs before it is switched on

- An approved provider, with a written data-processing agreement and a named owner.
- A backend endpoint that the **server** calls. Browser code must not hold a provider
  credential. Credentials are never added to the frontend bundle.
- The endpoint's contract agreed and documented, including timeouts, error codes and rate
  limits. None of these exist yet. This repository does not invent them.
- Consent and retention behaviour (§2 and §3) implemented and reviewed.
- Automated tests against the provider's sandbox, and a manual check in the live
  environment. Neither has been done.

## 6. Not verified

- No real AI provider has been integrated, called or tested.
- No endpoint for a shopping, try-on or new business provider exists in the backend. This
  contract does not create one.
- The demo's deterministic answers have not been reviewed for accuracy as shopping advice.
