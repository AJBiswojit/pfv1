/**
 * PRATIKSHYA FASHION — PHASE 11 · STAGE 2.5 — AI Shopping, as a page of the
 * design.
 *
 * The production screen is `pages/account/AiShoppingAssistant.jsx`. Everything
 * it decides, this page decides the same way and from the same sources:
 *
 *   · the request is production's own: `aiService.askShoppingAssistant` with the
 *     live storefront catalogue, the product this page was opened from, the
 *     wishlist ids, the recently-viewed ids, the purchased ids read out of the
 *     order context, the saved style preferences and the customer's first name
 *     — and `onStage` progress, so the indicator shows the assistant's own
 *     staging rather than an invented one;
 *   · the two side effects are the real ones: a `CART_ACTION` goes through the
 *     cart context's own `addToCart`, and a refusal becomes an honest sentence
 *     rather than a quiet success; a `WISHLIST_ACTION` goes through
 *     `wishlist.add`;
 *   · the conversation persists through `loadAiSession` / `saveAiSession` /
 *     `clearAiSession` with `AI_SESSION_SCOPES.SHOPPING` — customer-scoped, and
 *     product ids only: `rehydrateMessage` re-resolves every id against the live
 *     catalogue, so a restored message can never carry a stale price, a stale
 *     image or a product that has since been unpublished;
 *   · the greeting, the quick prompts, the product prompts and the brand line
 *     are `aiShoppingMockData`'s own copy, and the greeting is seeded through
 *     `buildShoppingResponse` exactly as production seeds it;
 *   · the session-start and per-question diary lines go through the same
 *     `recordActivity` + `describeActor` calls production makes;
 *   · `useSearchParams` carries the `?product=` context, the quick prompts
 *     switch with it, and clearing it is production's own `delete` + `replace`.
 *
 * WHAT IS REUSED AND NOT REDRAWN: `AiComposer`, `AiConversationLog` +
 * `AiUserBubble`, `AiQuickPrompts`, `AiShoppingMessage` and
 * `AiThinkingIndicator` are the production components, imported from
 * `components/aiAssistants/` exactly as the production page imports them. They
 * carry the behaviour — the composer's submit contract, the live log region,
 * the streaming stage copy, and every product action inside an answer (view,
 * add to bag, save to wishlist, follow-up suggestions). The port draws the page
 * around them in the design's register.
 *
 * WHAT IS MOCK-BACKED, SAID PLAINLY: the active provider is `mockAiProvider`
 * (`isMockAiProvider()`), a deterministic engine with no model behind it and no
 * network call of its own — every product fact it speaks is read from the
 * catalogue repository. The page therefore keeps production's demo chip
 * ("Demo assistant · deterministic") and ends the composer with
 * `AI_SHOPPING_BRAND.demoNote` ("Demo assistant · grounded in the live
 * catalogue") while the provider is the demo one, falling back to the
 * the active shopping provider's own `AI_SHOPPING_PROVIDER_LABEL` only if a real provider is ever configured — never the business label.
 * Production's own words for exactly this state are the ones used — nothing here
 * claims a trained model, and the closing note repeats the two facts that
 * matter: the conversation is deterministic, and it stays on this device.
 *
 * WHAT THE DESIGN'S PROTOTYPE HAD: nothing — its `/account` was a form and this
 * screen did not exist, so only the register comes from the design: the frame,
 * the label/lead type scale, the hairline bands, the paper insert, the chip, the
 * empty state and the buttons.
 *
 * WHAT IS DELIBERATELY NOT CARRIED OVER FROM PRODUCTION:
 *   · its `Rule` / `AtelierButton` furniture, and its hero block: the frame
 *     states the page's eyebrow and title (production's own "PRATIKSHYA AI" and
 *     "Your personal fashion companion.") and the design's lead line carries its
 *     description, so the page has one heading, not two;
 *   · production's breadcrumb label ("My PRATIKSHYA"): the port's frame names
 *     the same destination "Account" on every screen in the family;
 *   · production's composer footnote, which prints `AI_PROVIDER_LABEL` — the
 *     label of the BUSINESS assistant ("live business data") — under a customer
 *     surface answered by the demo provider. The port prints the demo note while
 *     the provider is the demo one, and the provider's own label otherwise.
 *   · production's fixed 520px / 560px conversation height is kept (see
 *     `customer.ai.css`), because the log has to scroll rather than grow.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, RotateCcw, Sparkles, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import AccountFrame from './AccountFrame.jsx';
import Button from '../../components/ui/Button.jsx';
import { Link } from '../../router/index.jsx';
import PratikshyaImage from '../../../../components/PratikshyaImage.jsx';
import AiComposer from '../../../../components/aiAssistants/AiComposer.jsx';
import AiConversationLog, {
  AiUserBubble,
} from '../../../../components/aiAssistants/AiConversationLog.jsx';
import AiQuickPrompts from '../../../../components/aiAssistants/AiQuickPrompts.jsx';
import AiShoppingMessage from '../../../../components/aiAssistants/AiShoppingMessage.jsx';
import AiThinkingIndicator from '../../../../components/aiAssistants/AiThinkingIndicator.jsx';
import { useAuth } from '../../../../context/AuthContext.jsx';
import { useCart } from '../../../../context/CartContext.jsx';
import { useOrder } from '../../../../context/OrderContext.jsx';
import { useWishlist } from '../../../../context/WishlistContext.jsx';
import {
  getLiveStorefrontProducts,
  getProductById,
  getProductByIdentifier,
} from '../../../../data/products/index.js';
import { useRecentlyViewed } from '../../../../hooks/useRecentlyViewed.js';
import aiService, { AI_SHOPPING_PROVIDER_LABEL, isMockAiProvider } from '../../../../services/ai/aiService.js';
import {
  AI_SESSION_SCOPES,
  clearAiSession,
  loadAiSession,
  saveAiSession,
} from '../../../../services/ai/aiSessionStore.js';
import { buildShoppingResponse } from '../../../../services/ai/shared/aiResponseBuilder.js';
import {
  AI_SHOPPING_BRAND,
  AI_SHOPPING_GREETING,
  AI_SHOPPING_PRODUCT_PROMPTS,
  AI_SHOPPING_QUICK_PROMPTS,
} from '../../../../services/ai/shopping/aiShoppingMockData.js';
import { CATALOG_CHANGED_EVENT } from '../../../../services/catalog/catalogStore.js';
import { PRODUCTS_CHANGED_EVENT } from '../../../../services/catalogRepository.js';
import { MEDIA_CHANGED_EVENT } from '../../../../services/media/mediaRepository.js';
import { TAXONOMY_CHANGED_EVENT } from '../../../../services/taxonomyRepository.js';
import { getStylePreferences } from '../../../../services/customer/stylePreferences.js';
import {
  ACTIVITY_ACTIONS,
  describeActor,
  loadActivity,
  recordActivity,
} from '../../../../services/employees/activityService.js';

const SHOPPING_TITLE = 'AI Shopping — My PRATIKSHYA';
const OPENING_SUGGESTIONS = ['Find my wedding look', 'Show silk sarees', "What's trending?"];

const timeLabel = (iso) => {
  try {
    return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

/** Restores persisted product references from the live catalogue. */
const rehydrateProducts = (ids) => (ids ?? []).map((id) => getProductById(id)).filter(Boolean);

const rehydrateMessage = (message) => {
  const next = { ...message };
  if (message.productIds?.length) {
    next.products = rehydrateProducts(message.productIds).map((product) => ({ product, reason: '' }));
  }
  if (message.outfitMainId) {
    const main = getProductById(message.outfitMainId);
    if (main) next.outfit = { main, pieces: rehydrateProducts(message.outfitPieceIds) };
  }
  if (message.singleProductId) {
    const single = getProductById(message.singleProductId);
    if (single) next.product = single;
  }
  if (message.comparisonIds?.length) {
    const compared = rehydrateProducts(message.comparisonIds);
    if (compared.length >= 2) {
      next.comparison = next.comparison ?? { products: compared, rows: [], verdict: '' };
      next.comparison.products = compared;
    }
  }
  return next;
};

const hasResolvedProductsChanged = (previous, next) => {
  const prevProducts = previous.products ?? [];
  const nextProducts = next.products ?? [];
  if (prevProducts.length !== nextProducts.length) return true;
  if (nextProducts.some((entry, index) => entry?.product !== prevProducts[index]?.product)) {
    return true;
  }
  if ((previous.outfit?.main ?? null) !== (next.outfit?.main ?? null)) return true;
  const prevPieces = previous.outfit?.pieces ?? [];
  const nextPieces = next.outfit?.pieces ?? [];
  if (prevPieces.length !== nextPieces.length) return true;
  if (nextPieces.some((piece, index) => piece !== prevPieces[index])) return true;
  if ((previous.product ?? null) !== (next.product ?? null)) return true;
  const prevCompared = previous.comparison?.products ?? [];
  const nextCompared = next.comparison?.products ?? [];
  if (prevCompared.length !== nextCompared.length) return true;
  if (nextCompared.some((product, index) => product !== prevCompared[index])) return true;
  return false;
};

const rehydrateMessages = (list) => {
  let changed = false;
  const nextList = list.map((message) => {
    const next = rehydrateMessage(message);
    if (hasResolvedProductsChanged(message, next)) {
      changed = true;
      return next;
    }
    return message;
  });
  return changed ? nextList : list;
};

export default function AiShopping() {
  const { user } = useAuth();
  const cart = useCart();
  const wishlist = useWishlist();
  const { orders } = useOrder();
  const recently = useRecentlyViewed(8);
  const [searchParams, setSearchParams] = useSearchParams();

  const [catalogueRevision, setCatalogueRevision] = useState(0);
  const [messages, setMessages] = useState(() =>
    loadAiSession(AI_SESSION_SCOPES.SHOPPING, user?.id).map(rehydrateMessage),
  );
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);
  const [stage, setStage] = useState('');
  const [error, setError] = useState('');
  const logRef = useRef(null);
  const sessionLogged = useRef(false);
  const scopeRef = useRef(user?.id);

  const products = useMemo(() => getLiveStorefrontProducts(), [catalogueRevision]);

  const contextProduct = useMemo(() => {
    const ref = searchParams.get('product');
    if (!ref) return null;
    return getProductByIdentifier(ref) ?? getProductById(ref) ?? null;
  }, [searchParams, catalogueRevision]);

  const preferences = useMemo(() => getStylePreferences(user?.id), [user?.id]);

  const purchasedIds = useMemo(() => {
    const ids = new Set();
    orders.forEach((order) =>
      (order.items ?? []).forEach((item) => item.productId && ids.add(String(item.productId))),
    );
    return [...ids];
  }, [orders]);

  /* Keep the rail honest if the catalogue, the taxonomy or the media change. */
  useEffect(() => {
    const sync = () => {
      setCatalogueRevision((value) => value + 1);
      setMessages((current) => rehydrateMessages(current));
    };
    window.addEventListener(CATALOG_CHANGED_EVENT, sync);
    window.addEventListener(PRODUCTS_CHANGED_EVENT, sync);
    window.addEventListener(TAXONOMY_CHANGED_EVENT, sync);
    window.addEventListener(MEDIA_CHANGED_EVENT, sync);
    return () => {
      window.removeEventListener(CATALOG_CHANGED_EVENT, sync);
      window.removeEventListener(PRODUCTS_CHANGED_EVENT, sync);
      window.removeEventListener(TAXONOMY_CHANGED_EVENT, sync);
      window.removeEventListener(MEDIA_CHANGED_EVENT, sync);
    };
  }, []);

  useEffect(() => {
    const previous = document.title;
    document.title = SHOPPING_TITLE;
    return () => {
      document.title = previous;
    };
  }, []);

  /* Demo persistence — customer-scoped, product ids only. */
  useEffect(() => {
    if (scopeRef.current !== user?.id) {
      scopeRef.current = user?.id;
      const restored = loadAiSession(AI_SESSION_SCOPES.SHOPPING, user?.id).map(rehydrateMessage);
      if (restored.length) {
        setMessages(restored);
        return;
      }
    }
    saveAiSession(AI_SESSION_SCOPES.SHOPPING, user?.id, messages);
  }, [messages, user?.id]);

  /* Session-start diary note, once per mount. */
  useEffect(() => {
    if (sessionLogged.current) return;
    sessionLogged.current = true;
    recordActivity(loadActivity(), {
      ...describeActor({ label: user?.firstName ? `Customer · ${user.firstName}` : 'Customer' }),
      action: ACTIVITY_ACTIONS.AI_SHOPPING_SESSION_STARTED,
      summary: 'Opened the AI Shopping Assistant',
    });
  }, [user?.firstName]);

  /* Greeting when the conversation is empty. */
  useEffect(() => {
    setMessages((current) => {
      if (current.length) return current;
      return [
        buildShoppingResponse({
          type: 'TEXT',
          text: AI_SHOPPING_GREETING(user?.firstName),
          suggestions: OPENING_SUGGESTIONS,
        }),
      ];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  /* Keep the newest message in view. */
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, thinking]);

  const applySideEffects = useCallback(
    (response) => {
      if (response?.type === 'CART_ACTION' && response.product) {
        const result = cart.addToCart(response.product, { quantity: 1 });
        if (!result?.ok) {
          return {
            ...response,
            type: 'TEXT',
            text: `${response.product.name} could not be added — it may need a size choice on its page.`,
          };
        }
      }
      if (response?.type === 'WISHLIST_ACTION' && response.product) {
        wishlist.add(response.product);
      }
      return response;
    },
    [cart, wishlist],
  );

  const send = useCallback(
    async (rawQuestion) => {
      const question = String(rawQuestion || '').trim();
      if (!question || thinking) return;
      setError('');
      setDraft('');
      setMessages((current) => [
        ...current,
        {
          id: `user-${Date.now().toString(36)}`,
          role: 'user',
          assistant: 'shopping',
          text: question,
          createdAt: new Date().toISOString(),
        },
      ]);
      setThinking(true);
      setStage('Understanding your request');

      recordActivity(loadActivity(), {
        ...describeActor({ label: user?.firstName ? `Customer · ${user.firstName}` : 'Customer' }),
        action: ACTIVITY_ACTIONS.AI_SHOPPING_QUERY,
        summary: 'Asked the AI Shopping Assistant',
      });

      try {
        const response = await aiService.askShoppingAssistant({
          question,
          products,
          productContext: contextProduct,
          wishlistIds: [...wishlist.saved],
          recentIds: recently.ids.map(String),
          purchasedIds,
          preferences,
          customerName: user?.firstName ?? null,
          onStage: (progress) => setStage(progress?.message || ''),
        });
        const finalResponse = applySideEffects(response);
        setMessages((current) => [...current, finalResponse]);
      } catch (progress) {
        if (progress?.name === 'AbortError') return;
        setError('The assistant lost its train of thought. Please ask again.');
      } finally {
        setThinking(false);
        setStage('');
      }
    },
    [
      thinking,
      products,
      contextProduct,
      wishlist.saved,
      recently.ids,
      purchasedIds,
      preferences,
      user?.firstName,
      applySideEffects,
    ],
  );

  const startNewConversation = useCallback(() => {
    clearAiSession(AI_SESSION_SCOPES.SHOPPING, user?.id);
    setMessages([
      buildShoppingResponse({
        type: 'TEXT',
        text: AI_SHOPPING_GREETING(user?.firstName),
        suggestions: OPENING_SUGGESTIONS,
      }),
    ]);
  }, [user?.firstName, user?.id]);

  const clearProductContext = useCallback(() => {
    searchParams.delete('product');
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const quickPrompts = contextProduct ? AI_SHOPPING_PRODUCT_PROMPTS : AI_SHOPPING_QUICK_PROMPTS;
  const demoProvider = isMockAiProvider();

  return (
    <AccountFrame
      breadcrumbItems={[{ label: 'Account', to: '/account' }, { label: 'AI Shopping' }]}
      label={AI_SHOPPING_BRAND.name}
      title="Your personal fashion companion."
    >
      <p className="info__lead pf-account__lead">
        Tell me the occasion, the colour, the cloth or the budget — I will walk you through the
        current atelier edit.
      </p>

      <div className="pf-ai__head-actions">
        <p className="pf-ai__demo">
          {demoProvider ? 'Demo assistant · deterministic' : AI_SHOPPING_PROVIDER_LABEL}
        </p>
        <Button variant="ghost" onClick={startNewConversation}>
          <RotateCcw size={11} aria-hidden="true" /> New conversation
        </Button>
      </div>

      {contextProduct ? (
        <div className="pf-ai__context">
          <span className="pf-ai__context-media">
            <PratikshyaImage
              image={contextProduct.image}
              alt={contextProduct.name}
              className="pf-ai__context-img"
              loading="lazy"
              sizes="48px"
            />
          </span>
          <div className="pf-ai__context-body">
            <p className="label">Discussing this piece</p>
            <p className="pf-ai__context-name">{contextProduct.name}</p>
            <p className="pf-ai__context-note">Ask for similar pieces, pairings or alternatives.</p>
          </div>
          <div className="pf-ai__context-actions">
            <Button to={`/product/${contextProduct.slug}`} variant="ghost">
              View
            </Button>
            <button
              type="button"
              className="pf-ai__context-clear"
              onClick={clearProductContext}
              aria-label="Stop discussing this piece"
            >
              <X size={13} aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}

      <div className="pf-ai__chat">
        <div className="pf-ai__chat-main">
          <AiConversationLog ref={logRef} ariaLabel="AI shopping conversation" className="pf-ai__log">
            {messages.map((message) =>
              message.role === 'user' ? (
                <AiUserBubble key={message.id} text={message.text} at={timeLabel(message.createdAt)} />
              ) : (
                <AiShoppingMessage
                  key={message.id}
                  message={message}
                  bag={cart}
                  wishlist={wishlist}
                  onSuggestion={send}
                />
              ),
            )}
            {thinking ? (
              <AiThinkingIndicator stage={stage} label="PRATIKSHYA AI is preparing recommendations" />
            ) : null}
            {error ? (
              <p role="alert" className="pf-ai__error">
                {error}
              </p>
            ) : null}
          </AiConversationLog>

          <div className="pf-ai__composer">
            <AiComposer
              value={draft}
              onChange={setDraft}
              onSubmit={send}
              busy={thinking}
              label="Ask PRATIKSHYA AI about a piece, occasion or budget"
              placeholder={
                contextProduct
                  ? `Ask about ${contextProduct.name}…`
                  : "I need something for my sister's wedding…"
              }
              hint="Press Enter to send"
            />
            <p className="pf-ai__footnote">
              {demoProvider
                ? AI_SHOPPING_BRAND.demoNote
                : `${AI_SHOPPING_PROVIDER_LABEL} · answers from the live catalogue`}
            </p>
          </div>
        </div>

        <aside className="pf-ai__aside" aria-label="Assistant context">
          <section className="pf-ai__panel">
            <p className="label">
              <Sparkles size={13} strokeWidth={1.5} aria-hidden="true" /> Suggested
            </p>
            <h2 className="pf-ai__panel-title">Begin anywhere</h2>
            <AiQuickPrompts
              prompts={quickPrompts}
              onPick={send}
              disabled={thinking}
              ariaLabel="Suggested shopping prompts"
            />
          </section>

          <section className="pf-ai__panel">
            <p className="label">The house</p>
            <h2 className="pf-ai__panel-title">Also in your account</h2>
            <ul className="pf-ai__links">
              <li>
                <Link to="/account/ai-mirror">
                  <Camera size={13} aria-hidden="true" /> Try apparel on with AI Mirror
                </Link>
              </li>
              <li>
                <Link to="/account/wishlist">Your wishlist · {wishlist.count} saved</Link>
              </li>
              <li>
                <Link to="/account/preferences">Tune your style profile</Link>
              </li>
            </ul>
          </section>

          <p className="pf-ai__footnote">
            A demo experience grounded in the live catalogue — deterministic, not a trained model.
            Conversations stay on this device and never store images.
          </p>
        </aside>
      </div>
    </AccountFrame>
  );
}
