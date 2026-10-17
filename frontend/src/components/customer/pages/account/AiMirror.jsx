/**
 * PRATIKSHYA FASHION — PHASE 11 · STAGE 2.5 — the AI Mirror, as a page of the
 * design.
 *
 * The production screen is `pages/account/AiMirror.jsx`. Everything it decides,
 * this page decides the same way and from the same sources:
 *
 *   · the edit is `getVirtualTryOnProducts()` — the live storefront catalogue
 *     filtered through `isVirtualTryOnEligibleProduct` and
 *     `hasVirtualTryOnUsableMedia` — refreshed on the products and taxonomy
 *     change events, and covered by `useProductCovers` exactly as production
 *     covers it;
 *   · the state machine is production's, moved across whole: the deep link
 *     (`?product=`), its three route notices, the search/category/visible-count
 *     filter, the camera (`getUserMedia`, the request-id guard on every async
 *     camera and try-on answer, the track teardown on unmount), the abortable
 *     try-on request with its three progress stages and its four error codes,
 *     the recent-try-on history, the wishlist toggle, the 4800 ms feedback
 *     timer, and `apiTrackProductInteraction(id, "VIEW")` for a signed-in
 *     customer;
 *   · the two side effects are the real ones: `defaultSelection` + the cart
 *     context's own `addToCart` (and a refusal is stated, never swallowed), and
 *     `wishlist.add` / `wishlist.remove`.
 *
 * WHAT IS REUSED AND NOT REDRAWN: `AiMirrorStage`, `AiMirrorProductSelector` and
 * `AiMirrorSelectedLook` are the production components, imported from
 * `components/aiMirror/` exactly as the production page imports them. They
 * carry the behaviour — the live video element and its teardown, the
 * comparison toggle, the search field, the category chips, the load-more
 * control, and the selected look's own actions and feedback. The port draws the
 * page around them in the design's register.
 *
 * WHAT IS MOCK-BACKED, SAID PLAINLY: the active try-on provider is
 * `virtualTryOnService`'s mock (`VIRTUAL_TRY_ON_PROVIDER = "mock"`). It performs
 * no image analysis, uploads nothing, persists no camera frame, and — because
 * `aiMirrorMockData` seeds no presentation looks (`getMockTryOnResult()` returns
 * null) — it ends every request with `MOCK_PREVIEW_UNAVAILABLE`. The page keeps
 * production's own words for exactly that outcome ("A demo preview is
 * unavailable for this piece. Choose another look or try again.") and does not
 * claim a result it cannot produce.
 *
 * WHAT THE DESIGN'S PROTOTYPE HAD: nothing — its `/account` was a form and this
 * screen did not exist, so there is behaviour to copy from production alone and
 * only the register comes from the design: the frame, the label/lead type
 * scale, the hairline bands, the paper insert, the `.empty` block and the
 * buttons.
 *
 * WHAT IS DELIBERATELY NOT CARRIED OVER FROM PRODUCTION:
 *   · its dark hero band. Every account screen in the port states its own
 *     heading through the shared frame, so the hero's own words move into the
 *     frame's slots instead of a second heading block: production's eyebrow
 *     ("PRATIKSHYA AI MIRROR") becomes the frame's label, its `h1` becomes the
 *     frame's title, and its description becomes the design's lead line. The
 *     design's `/account` has no hero, so neither has this page.
 *   · the hero's "Ready in moments" note. The demo provider ends every request
 *     with `MOCK_PREVIEW_UNAVAILABLE`, so a claim about a preview arriving would
 *     be false. The band states instead what the source supports — "No photos
 *     are stored", "Demo preview module", "Frames stay in your browser" — and
 *     the closing band says which image the mirror actually composes from.
 *   · production's breadcrumb label ("My PRATIKSHYA"): the port's frame names
 *     the same destination "Account" on every screen in the family.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, ShieldCheck, Sparkles } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import AccountFrame from './AccountFrame.jsx';
import Button from '../../components/ui/Button.jsx';
import PratikshyaImage from '../../../../components/PratikshyaImage.jsx';
import RecommendationSections from '../../../../components/product/RecommendationSections.jsx';
import AiMirrorProductSelector from '../../../../components/aiMirror/AiMirrorProductSelector.jsx';
import AiMirrorSelectedLook from '../../../../components/aiMirror/AiMirrorSelectedLook.jsx';
import AiMirrorStage from '../../../../components/aiMirror/AiMirrorStage.jsx';
import { useAuth } from '../../../../context/AuthContext.jsx';
import { useCart } from '../../../../context/CartContext.jsx';
import { useWishlist } from '../../../../context/WishlistContext.jsx';
import { getProductByIdentifier } from '../../../../data/products/index.js';
import { useProductCovers } from '../../../../hooks/useMedia.js';
import { apiTrackProductInteraction } from '../../../../services/api/recommendationsApi.js';
import { PRODUCTS_CHANGED_EVENT } from '../../../../services/catalogRepository.js';
import { TAXONOMY_CHANGED_EVENT } from '../../../../services/taxonomyRepository.js';
import {
  getRecentTryOns,
  getVirtualTryOnProducts,
  hasVirtualTryOnUsableMedia,
  recordRecentTryOn,
} from '../../../../services/aiMirror/aiMirrorService.js';
import { getMockPreviewTemplate } from '../../../../services/aiMirror/aiMirrorMockData.js';
import { generateTryOnPreview } from '../../../../services/aiMirror/virtualTryOnService.js';
import { defaultSelection } from '../../../../utils/shopping.js';

const MIRROR_TITLE = 'PRATIKSHYA AI Mirror — PRATIKSHYA FASHION';
const INITIAL_PRODUCT_COUNT = 8;

/* The three notes production states above the mirror, in the same order. The
   third is the source's own privacy fact rather than a delivery promise: the
   demo provider answers `MOCK_PREVIEW_UNAVAILABLE`, so "ready in moments" is
   not something this page can honour. */
const MIRROR_NOTES = [
  { icon: ShieldCheck, label: 'No photos are stored' },
  { icon: Sparkles, label: 'Demo preview module' },
  { icon: Clock, label: 'Frames stay in your browser' },
];

/* Production's own closing band, with its middle fact corrected to what the
   demo provider actually does: it composes no image of its own. */
const MIRROR_FACTS = [
  ['Private by design', 'Camera frames stay in your browser and are never saved by this demo.'],
  [
    'Drawn from the catalogue',
    'The mirror works from the live catalogue’s own product media. The demo provider composes no new image.',
  ],
  ['Your next step', 'View the product, save it to your wishlist or add it to your existing bag.'],
];

const stopTracks = (stream) => {
  try {
    stream?.getTracks?.().forEach((track) => track.stop());
  } catch {
    // A stopped or unavailable track should never interrupt navigation.
  }
};

const cameraErrorState = (error) => {
  const name = String(error?.name || '');
  return ['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(name)
    ? 'denied'
    : 'unavailable';
};

const readyProducts = () => getVirtualTryOnProducts();

/* The recent-look rail production draws inside its own file. Nothing about it
   is part of the try-on machine — it is a list of the ids this browser
   remembers — so it is redrawn here in the design's register, from the same
   records and the same resolved covers the selector uses. */
function RecentTryOns({ products, onSelect }) {
  if (!products.length) return null;

  return (
    <section className="pf-ai__recent" aria-labelledby="pf-ai-recent-heading">
      <div className="pf-ai__recent-head">
        <div>
          <p className="label">Your edit</p>
          <h2 id="pf-ai-recent-heading" className="display pf-ai__recent-title">
            Recently tried
          </h2>
        </div>
        <p className="pf-ai__recent-note">Demo history · up to 8 looks</p>
      </div>
      <ul className="pf-ai__recent-list">
        {products.map(({ product, triedAt }) => (
          <li key={product.id}>
            <button type="button" className="pf-ai__recent-card" onClick={() => onSelect(product)}>
              <span className="pf-ai__recent-media">
                <PratikshyaImage
                  image={product.image}
                  alt={product.name}
                  className="pf-ai__recent-img"
                  loading="lazy"
                  sizes="160px"
                />
                <span className="pf-ai__recent-badge">Demo</span>
              </span>
              <span className="pf-ai__recent-name">{product.name}</span>
              <span className="pf-ai__recent-when">
                {new Date(triedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function AiMirror() {
  const { user } = useAuth();
  const cart = useCart();
  const wishlist = useWishlist();
  const [searchParams, setSearchParams] = useSearchParams();
  const [catalogueRevision, setCatalogueRevision] = useState(0);
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    if (user?.id && selectedId) void apiTrackProductInteraction(selectedId, 'VIEW');
  }, [user?.id, selectedId]);

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [visibleCount, setVisibleCount] = useState(INITIAL_PRODUCT_COUNT);
  const [cameraStatus, setCameraStatus] = useState('idle');
  const [cameraStream, setCameraStream] = useState(null);
  const [result, setResult] = useState(null);
  const [comparison, setComparison] = useState('original');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingState, setProcessingState] = useState(null);
  const [feedback, setFeedback] = useState({ message: '', kind: 'success' });
  const [routeNotice, setRouteNotice] = useState('');
  const [recentRecords, setRecentRecords] = useState(() => getRecentTryOns(user?.id));

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const cameraRequestRef = useRef(0);
  const tryOnRequestRef = useRef(0);
  const tryOnAbortRef = useRef(null);
  const selectorRef = useRef(null);

  const catalogueProducts = useMemo(() => readyProducts(), [catalogueRevision]);
  const products = useProductCovers(catalogueProducts);
  const productKey = products.map((product) => product.id).join('|');
  const requestedProductId = searchParams.get('product');

  const cancelTryOn = useCallback(() => {
    tryOnRequestRef.current += 1;
    tryOnAbortRef.current?.abort();
    tryOnAbortRef.current = null;
  }, []);

  /** Catalogue and taxonomy updates flow into the mirror without a second data store. */
  useEffect(() => {
    const refresh = () => setCatalogueRevision((revision) => revision + 1);
    window.addEventListener(PRODUCTS_CHANGED_EVENT, refresh);
    window.addEventListener(TAXONOMY_CHANGED_EVENT, refresh);
    return () => {
      window.removeEventListener(PRODUCTS_CHANGED_EVENT, refresh);
      window.removeEventListener(TAXONOMY_CHANGED_EVENT, refresh);
    };
  }, []);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = MIRROR_TITLE;
    return () => {
      document.title = previousTitle;
    };
  }, []);

  /** Camera tracks and mock requests always stop when the page is left. */
  useEffect(
    () => () => {
      cameraRequestRef.current += 1;
      cancelTryOn();
      stopTracks(streamRef.current);
      streamRef.current = null;
    },
    [cancelTryOn],
  );

  useEffect(() => {
    setRecentRecords(getRecentTryOns(user?.id));
  }, [user?.id]);

  useEffect(() => {
    if (!feedback.message) return undefined;
    const timer = window.setTimeout(() => setFeedback({ message: '', kind: 'success' }), 4800);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  /** Attach the stream only after the live video element has rendered. */
  useEffect(() => {
    if (cameraStatus !== 'active' || !cameraStream || !videoRef.current) return undefined;
    const video = videoRef.current;
    video.srcObject = cameraStream;
    video.play?.().catch(() => {
      // The stream remains attached; a browser can still begin playback after an interaction.
    });
    return () => {
      if (video.srcObject === cameraStream) video.srcObject = null;
    };
  }, [cameraStatus, cameraStream]);

  /** Honor a product-detail deep link, while giving an invalid link a graceful next step. */
  useEffect(() => {
    if (!products.length) {
      setSelectedId(null);
      return;
    }

    const requested = requestedProductId
      ? products.find(
          (product) =>
            String(product.id) === String(requestedProductId) || product.slug === requestedProductId,
        )
      : null;

    if (requested) {
      if (requested.id !== selectedId) {
        cancelTryOn();
        setSelectedId(requested.id);
        setResult(null);
        setComparison('original');
        setIsProcessing(false);
        setProcessingState(null);
      }
      setRouteNotice('');
      return;
    }

    if (requestedProductId) {
      const requestedProduct = getProductByIdentifier(requestedProductId);
      setRouteNotice(
        requestedProduct
          ? !hasVirtualTryOnUsableMedia(requestedProduct)
            ? `${requestedProduct.name} needs a usable active product image before it can be previewed. Choose another apparel look from the edit instead.`
            : `${requestedProduct.name} is not eligible for the AI Mirror. Choose an apparel look from the edit instead.`
          : 'The requested product is unavailable. Choose an apparel look from the edit instead.',
      );
    }

    if (!selectedId || !products.some((product) => product.id === selectedId)) {
      setSelectedId(products[0].id);
    }
  }, [requestedProductId, productKey, products, selectedId, cancelTryOn]);

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedId) ?? null,
    [products, selectedId],
  );

  const previewTemplate = useMemo(() => getMockPreviewTemplate(selectedProduct), [selectedProduct]);

  const categories = useMemo(() => {
    const byKey = new Map();
    products.forEach((product) => {
      if (!byKey.has(product.mirrorCategoryKey)) {
        byKey.set(product.mirrorCategoryKey, {
          key: product.mirrorCategoryKey,
          label: product.mirrorCategoryLabel,
        });
      }
    });
    return [...byKey.values()];
  }, [products]);

  useEffect(() => {
    if (category !== 'all' && !categories.some((entry) => entry.key === category)) setCategory('all');
  }, [category, categories]);

  const filteredProducts = useMemo(() => {
    const term = query.trim().toLowerCase();
    return products.filter((product) => {
      if (category !== 'all' && product.mirrorCategoryKey !== category) return false;
      if (!term) return true;
      return [
        product.name,
        product.mirrorCategoryLabel,
        product.subcategory,
        product.fabric,
        product.material,
        ...(product.colors ?? []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [products, query, category]);

  useEffect(() => {
    setVisibleCount(INITIAL_PRODUCT_COUNT);
  }, [query, category]);

  const visibleProducts = useMemo(
    () => filteredProducts.slice(0, visibleCount),
    [filteredProducts, visibleCount],
  );

  const recentProducts = useMemo(() => {
    const byId = new Map(products.map((product) => [product.id, product]));
    return recentRecords
      .map((record) => ({ ...record, product: byId.get(record.productId) }))
      .filter((entry) => entry.product);
  }, [recentRecords, products]);

  const stopCamera = useCallback((nextStatus = 'preview') => {
    cameraRequestRef.current += 1;
    stopTracks(streamRef.current);
    streamRef.current = null;
    setCameraStream(null);
    setCameraStatus(nextStatus);
  }, []);

  const enableCamera = useCallback(async () => {
    if (cameraStatus === 'requesting' || cameraStatus === 'active') return;

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setCameraStatus('unavailable');
      return;
    }

    const requestId = ++cameraRequestRef.current;
    setCameraStatus('requesting');

    try {
      /** Camera only. The mirror never requests microphone permission. */
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      if (cameraRequestRef.current !== requestId) {
        stopTracks(stream);
        return;
      }
      streamRef.current = stream;
      setCameraStream(stream);
      setCameraStatus('active');
    } catch (error) {
      if (cameraRequestRef.current !== requestId) return;
      setCameraStream(null);
      setCameraStatus(cameraErrorState(error));
    }
  }, [cameraStatus]);

  const selectProduct = useCallback(
    (product) => {
      if (!product?.id) return;
      cancelTryOn();
      setSelectedId(product.id);
      setResult(null);
      setComparison('original');
      setIsProcessing(false);
      setProcessingState(null);
      setFeedback({ message: '', kind: 'success' });
      setRouteNotice('');

      const next = new URLSearchParams(searchParams);
      next.set('product', product.id);
      setSearchParams(next, { replace: true });
    },
    [cancelTryOn, searchParams, setSearchParams],
  );

  const createPreview = useCallback(async () => {
    if (!selectedProduct) {
      setFeedback({ message: 'Choose an apparel look before creating a preview.', kind: 'error' });
      return;
    }

    cancelTryOn();
    const requestId = ++tryOnRequestRef.current;
    const controller = new AbortController();
    tryOnAbortRef.current = controller;

    setIsProcessing(true);
    setProcessingState({
      message: 'Preparing your look',
      detail: 'Setting up the curated demo preview…',
    });
    setResult(null);
    setComparison('original');
    setFeedback({ message: '', kind: 'success' });

    try {
      const preview = await generateTryOnPreview({
        product: selectedProduct,
        signal: controller.signal,
        onProgress: (nextState) => {
          if (tryOnRequestRef.current === requestId) setProcessingState(nextState);
        },
      });

      if (tryOnRequestRef.current !== requestId) return;
      setResult(preview);
      setComparison('try-on');
      const records = recordRecentTryOn(user?.id, selectedProduct.id);
      setRecentRecords(records);
      setFeedback({ message: 'Your curated demo preview is ready.', kind: 'success' });
    } catch (error) {
      if (error?.name === 'AbortError' || tryOnRequestRef.current !== requestId) return;
      const message =
        error?.code === 'PRODUCT_MEDIA_UNAVAILABLE'
          ? 'This piece needs a usable product image before it can be previewed. Choose another look.'
          : error?.code === 'INELIGIBLE_PRODUCT'
            ? 'This piece is not available for the AI Mirror preview. Choose another apparel look.'
            : error?.code === 'MOCK_PREVIEW_UNAVAILABLE'
              ? 'A demo preview is unavailable for this piece. Choose another look or try again.'
              : 'We could not prepare this demo preview. Please try again or choose another look.';
      setFeedback({ message, kind: 'error' });
    } finally {
      if (tryOnRequestRef.current === requestId) {
        setIsProcessing(false);
        setProcessingState(null);
        tryOnAbortRef.current = null;
      }
    }
  }, [selectedProduct, cancelTryOn, user?.id]);

  const addToBag = useCallback(() => {
    if (!selectedProduct) return;
    const defaults = defaultSelection(selectedProduct);
    const selection = {
      color:
        (selectedProduct.colors ?? []).find(
          (colour) => !selectedProduct.unavailableColors?.includes(colour),
        ) ?? defaults.color,
      size:
        (selectedProduct.sizes ?? []).find(
          (size) => !selectedProduct.unavailableSizes?.includes(size),
        ) ?? defaults.size,
      quantity: 1,
    };
    const added = cart.addToCart(selectedProduct, selection);
    setFeedback({
      message: added.ok
        ? `${added.message}${
            selection.size && selection.size !== 'Free Size'
              ? ` Size ${selection.size} is selected; you can adjust it in your bag.`
              : ''
          }`
        : added.message,
      kind: added.ok ? 'success' : 'error',
    });
  }, [cart, selectedProduct]);

  const saveLook = useCallback(() => {
    if (!selectedProduct) return;
    const saved = wishlist.isSaved(selectedProduct);
    if (saved) wishlist.remove(selectedProduct);
    else wishlist.add(selectedProduct);
    setFeedback({
      message: saved ? 'Removed from your wishlist.' : 'Look saved to your wishlist.',
      kind: 'success',
    });
  }, [selectedProduct, wishlist]);

  const tryAnother = useCallback(() => {
    cancelTryOn();
    setResult(null);
    setComparison('original');
    setIsProcessing(false);
    setProcessingState(null);
    selectorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [cancelTryOn]);

  return (
    <AccountFrame
      breadcrumbItems={[{ label: 'Account', to: '/account' }, { label: 'AI Mirror' }]}
      label="PRATIKSHYA AI MIRROR"
      title="See yourself in the look before you make it yours."
    >
      <p className="info__lead pf-account__lead">
        Choose a look, step into the mirror, and discover how it could feel on you.
      </p>

      <ul className="pf-ai__notes">
        {MIRROR_NOTES.map(({ icon: Icon, label }) => (
          <li className="pf-ai__note" key={label}>
            <Icon size={14} strokeWidth={1.5} aria-hidden="true" />
            {label}
          </li>
        ))}
      </ul>

      {routeNotice ? (
        <div className="pf-ai__notice" role="status" aria-live="polite">
          <AlertCircle size={16} strokeWidth={1.5} aria-hidden="true" />
          <p>{routeNotice}</p>
        </div>
      ) : null}

      {!products.length ? (
        <section className="empty">
          <p className="empty__title">No apparel looks are available right now.</p>
          <p>
            The AI Mirror only shows eligible apparel with usable active product media. Explore the
            current collection while the edit is refreshed.
          </p>
          <Button to="/shop">Explore the Collection</Button>
        </section>
      ) : (
        <div className="pf-ai__grid">
          <div className="pf-ai__stage">
            <AiMirrorStage
              cameraStatus={cameraStatus}
              videoRef={videoRef}
              selectedProduct={selectedProduct}
              previewTemplate={previewTemplate}
              result={result}
              comparison={comparison}
              onComparisonChange={setComparison}
              onEnableCamera={enableCamera}
              onUsePreviewMode={() => stopCamera('preview')}
              onStopCamera={() => stopCamera('preview')}
              isProcessing={isProcessing}
              processingState={processingState}
            />
          </div>

          <aside className="pf-ai__aside">
            <section className="pf-ai__panel" ref={selectorRef} aria-label="The mirror edit">
              <AiMirrorProductSelector
                products={visibleProducts}
                categories={categories}
                query={query}
                category={category}
                selectedId={selectedProduct?.id}
                onQueryChange={setQuery}
                onCategoryChange={setCategory}
                onSelect={selectProduct}
                canLoadMore={visibleProducts.length < filteredProducts.length}
                onLoadMore={() => setVisibleCount((count) => count + INITIAL_PRODUCT_COUNT)}
              />
            </section>
            <section className="pf-ai__panel" aria-label="The selected look">
              <AiMirrorSelectedLook
                product={selectedProduct}
                isProcessing={isProcessing}
                isSaved={wishlist.isSaved(selectedProduct)}
                onTryLook={createPreview}
                onAddToBag={addToBag}
                onSaveLook={saveLook}
                onTryAnother={tryAnother}
                feedback={feedback}
              />
            </section>
          </aside>
        </div>
      )}

      <RecommendationSections placement="mirror" productId={selectedProduct?.id} />

      <RecentTryOns products={recentProducts} onSelect={selectProduct} />

      <section className="pf-ai__facts" aria-label="How the mirror works">
        {MIRROR_FACTS.map(([title, copy]) => (
          <div className="pf-ai__fact" key={title}>
            <CheckCircle2 size={17} strokeWidth={1.4} aria-hidden="true" />
            <h2 className="pf-ai__fact-title">{title}</h2>
            <p>{copy}</p>
          </div>
        ))}
      </section>
    </AccountFrame>
  );
}
