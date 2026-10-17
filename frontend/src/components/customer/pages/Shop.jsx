import { useMemo, useState } from 'react';
import { useLocation, useParams, useSearchParams } from 'react-router-dom';
import { Link } from '../router/index.jsx';
import { AnimatePresence, motion } from 'framer-motion';
import { getTitleFor } from '../services/catalog.js';
import ProductCard from '../components/product/ProductCard.jsx';
import Button from '../components/ui/Button.jsx';
import { cx } from '../utils/format.js';
import { hideBrokenMedia } from '../utils/mediaFallback.js';
/* ── this application's own listing engine, reused rather than re-written ─── */
import useCatalogueQuery from '../../../hooks/useCatalogueQuery.js';
import { useCatalog } from '../../../hooks/useCatalog.js';
import { useProductCovers } from '../../../hooks/useMedia.js';
import { useInventory } from '../../../context/InventoryContext.jsx';
import { buildFacets } from '../../../data/products/facets.js';
import { sortOptions } from '../../../data/products/taxonomy.js';
import { searchSuggestions } from '../../../config/navigationConfig.js';
import { EXPLORE_PAGE_SIZE, buildExploreStream, getExploreOffers } from '../../../data/products/explore.js';
import offerRepository, { formatOfferDiscount } from '../../../services/offers/offerRepository.js';
import { resolveExploreEditorialMedia, resolveExplorePromoMedia } from '../../../services/explore/explorePlacements.js';
import { deriveTabs } from '../../../components/storefront/CategoryTabs.jsx';
import { normalizeMediaReference } from '../../../services/media/mediaPaths.js';
import { listingBreadcrumb, resolveListingScope } from '../components/shop/listingScope.js';
import ListingControls from '../components/shop/ListingControls.jsx';
import { toDesignProduct, useCatalogueRevision } from '../mock/data/products.js';
import NotFound from './NotFound.jsx';

/* The design offers four comparators. This application's register declares
   eight (`sortOptions`), and its listings have always honoured all of them, so
   the select below is the design's markup carrying the register's list. */
const SORT_OPTIONS = sortOptions.map((option) => ({ key: option.id, label: option.label }));

export default function Shop({ mode = 'category' }) {
  const route = useParams();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const q = params.get('q') || '';

  /* The taxonomy arrives with the catalogue, so the page has to re-render when
     it does — the same subscription every production listing takes. */
  useCatalog();

  /* Categories and collections arrive with the catalogue, so the scope has to
     be resolved again when it does: without the revision in the dependencies a
     `/category/:slug` visited before hydration keeps the answer the empty
     registers gave it — which is the 404 — for the life of the page. (A browser
     run caught exactly that; the unit harness seeds the store first and could
     not.) */
  const catalogueRevision = useCatalogueRevision();
  const scope = useMemo(
    () => resolveListingScope({ mode, slug: route.slug ?? '', pathname }),
    [mode, route.slug, pathname, catalogueRevision],
  );

  const {
    filters,
    sort,
    activeChips,
    activeCount,
    visible,
    total,
    scoped,
    isFetching,
    error,
    retry,
    toggleFilter,
    removeFilter,
    clearFilters,
    setSort,
    setSearch,
    loadMore,
    hasMore,
    remaining,
  } = useCatalogueQuery({
    scopeFilters: scope?.filters ?? {},
    searchFromUrl: mode === 'search' || mode === 'explore',
    pageSize: mode === 'explore' ? EXPLORE_PAGE_SIZE : undefined,
  });

  /* Facets are counted against what this route contains, never the whole
     catalogue — a category page never offers a filter that would empty it. */
  const facets = useMemo(
    () => buildFacets(scoped, filters, scope?.filters ?? {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scoped, JSON.stringify(filters), JSON.stringify(scope?.filters)],
  );

  /* The production grid resolves each card's plates from the canonical product
     media set, and asks the inventory and the offer register what the card may
     say; the port renders the design's card, so the two views of one record are
     joined here rather than derived twice. */
  const inventory = useInventory();
  const covered = useProductCovers(visible);
  const cards = useMemo(
    () => covered
      .map((row) => {
        const product = toDesignProduct(row);
        if (!product) return null;
        const availability = inventory.getAvailability(row);
        /* `useProductCovers` answers with the canonical media records
           (`{ id, src, … }`); the design's card draws URL strings. The
           conversion is this application's own single resolver — the same
           one every production image goes through — never a second one. */
        const plates = [row.image, row.hoverImage]
          .map((plate) => normalizeMediaReference(plate))
          .filter(Boolean);
        return {
          ...product,
          ...(plates.length ? { images: plates } : {}),
          inStock: availability.tracked ? availability.available > 0 : product.inStock,
          availabilityText: !availability.tracked
            ? ''
            : availability.status === 'LOW_STOCK'
              ? 'Only a few left'
              : availability.available <= 0
                ? 'Currently unavailable'
                : '',
          offerBadge: offerRepository.getProductOfferBadge(row)?.label ?? null,
        };
      })
      .filter(Boolean),
    [covered, inventory],
  );

  /* Explore keeps its own page size and its own stream: an offer banner and an
     editorial frame, placed by this application's own `buildExploreStream` and
     resolved from the placement register, never from a product plate. */
  const offers = useMemo(
    () => (mode === 'explore' ? getExploreOffers() : []),
    [mode, catalogueRevision],
  );
  const inserts = useMemo(() => {
    const used = new Set();
    const lead = (offers || []).find((offer) => offer.type === 'PERCENTAGE') || offers?.[0];
    return {
      promo: {
        image: resolveExplorePromoMedia(used),
        eyebrow: 'House offer',
        title: lead ? lead.name : 'The season\u2019s edit',
        description: lead
          ? `${lead.description} \u00b7 ${formatOfferDiscount(lead)} with ${lead.code}`
          : 'Selected pieces from the atelier, gathered in one place.',
        to: lead?.includedCollections?.[0]
          ? `/explore?collection=${encodeURIComponent(
              lead.includedCollections[0] === 'festive-edit' ? 'Festive Edit' : lead.includedCollections[0],
            )}`
          : '/explore?merch=sale',
        cta: 'Shop offers',
      },
      editorial: {
        image: resolveExploreEditorialMedia(used),
        eyebrow: 'Editorial',
        title: 'Heritage weaves',
        description: 'Sarees, lehengas and ceremonial pieces drawn from the house collections.',
        to: '/explore?category=sarees',
        cta: 'Explore sarees',
      },
    };
  }, [offers]);
  const stream = useMemo(
    () => (mode === 'explore' ? buildExploreStream(cards) : cards.map((card) => ({ type: 'product', product: card, key: `product-${card.id}` }))),
    [mode, cards],
  );

  const tabs = useMemo(() => deriveTabs(scope?.filters ?? {}), [scope?.filters]);
  const [draft, setDraft] = useState(q);
  const submitSearch = (event) => { event.preventDefault(); setSearch(draft); };
  const isCurrent = (to) => String(to ?? '').replace(/\/$/, '') === pathname.replace(/\/$/, '');

  /* The design titled a search by its term. The application's own search page
     names an empty search (`Find your piece`), so the port keeps both. */
  const title = mode === 'search'
    ? (q ? `“${q}”` : 'Find your piece')
    : scope?.title ?? getTitleFor('all');
  const eyebrow = mode === 'search' ? 'Search results' : scope?.eyebrow ?? 'Shop';
  const crumbs = mode === 'search' ? [{ label: 'Search' }] : listingBreadcrumb(scope, mode);
  const firstFetch = isFetching && visible.length === 0;

  /* A path this application serves no listing on has no edit to draw: the
     production page answers those with its own 404, and so does this one. */
  if (!scope) return <NotFound />;

  return (
    <div className="shop container">
      <header className="shop__head">
        <p className="label">{eyebrow}</p>
        <h1 className="display shop__title">{title}</h1>
        {/* The count is the backend's own filtered total, not the length of the
            page on screen — the two differ as soon as a listing pages. */}
        <p className="shop__count">{firstFetch ? 'Loading…' : `${total} ${total === 1 ? 'piece' : 'pieces'}`}</p>
      </header>

      {/* Search, on the two surfaces this application searches from: `/search`
          itself and Explore, whose query has always read `?q=` too. The design
          draws no search field on its shop — the application's own overlay does
          that on every other page — so the field is the design's `.search__form`
          (its overlay's), and the suggestions are the shell's own. */}
      {(mode === 'search' || mode === 'explore') && (
        <div className="listing-search">
          <form className="search__form" role="search" onSubmit={submitSearch}>
            <input
              type="search"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Search the catalogue…"
              aria-label="Search the catalogue"
            />
            <button type="submit" className="listing-search__submit">Search</button>
          </form>
          {!q && mode === 'search' && (
            <div className="listing-search__suggestions">
              {searchSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="chip chip--sm"
                  onClick={() => { setDraft(suggestion); setSearch(suggestion); }}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Explore's house offers, from the offer register, in the design's chip. */}
      {mode === 'explore' && offers.length > 0 && (
        <div className="shop__types" role="group" aria-label="House offers">
          {offers.map((offer) => (
            <Link key={offer.id} to={`/explore?q=${encodeURIComponent(offer.code)}`} className="chip">
              {offer.code} · {formatOfferDiscount(offer)}
            </Link>
          ))}
        </div>
      )}

      {/* The design's type chips were a local view of one array. This
          application's sibling levels are links (`deriveTabs`, the same
          derivation the production header uses), so the row is the design's
          chip carrying the taxonomy's own destinations. */}
      {tabs.tabs.length > 0 && (
        <div className="shop__bar">
          <div className="shop__types" role="group" aria-label="Categories">
            <Link to={tabs.parentPath} className={cx('chip', isCurrent(tabs.parentPath) && 'is-active')}>{tabs.allLabel}</Link>
            {tabs.tabs.map((tab) => (
              <Link key={tab.id} to={tab.to} className={cx('chip', isCurrent(tab.to) && 'is-active')}>{tab.label}</Link>
            ))}
          </div>
        </div>
      )}

      <div className="shop__bar">
        <ListingControls
          facets={facets}
          filters={filters}
          activeChips={activeChips}
          activeCount={activeCount}
          onToggle={toggleFilter}
          onRemove={removeFilter}
          onClear={clearFilters}
          resultCount={total}
        />
        <label className="shop__sort">
          <span>Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            {SORT_OPTIONS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </label>
      </div>

      {error ? (
        <ListingUnavailable onRetry={retry} />
      ) : firstFetch ? (
        <ListingLoading />
      ) : total === 0 ? (
        <div className="empty">
          {/* The design's own empty copy, and one case the design never had: a
              listing the shopper's own filters emptied (that one offers the
              engine's `clearFilters` rather than prose about photographs). */}
          <p className="empty__title">
            {mode === 'search'
              ? 'Nothing matched that search.'
              : activeCount > 0
                ? 'Nothing matches these filters.'
                : 'This edit is being photographed.'}
          </p>
          <p>
            {mode === 'search'
              ? 'Try “silk”, “bridal”, “kurta” or “jhumka”.'
              : activeCount > 0
                ? 'Clear a filter to see more of this edit.'
                : 'Pieces for this collection arrive soon. Meanwhile, explore the full catalogue.'}
          </p>
          {activeCount > 0 ? <Button onClick={clearFilters}>Clear filters</Button> : null}
          <Button to="/shop/all">Browse all pieces</Button>
        </div>
      ) : (
        <>
          <motion.div className="grid-4" layout>
            <AnimatePresence mode="popLayout" initial={false}>
              {stream.map((entry) => (
                <motion.div key={entry.key} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                  {entry.type === 'product'
                    ? <ProductCard product={entry.product} />
                    : <ListingInsert {...(entry.type === 'promo' ? inserts.promo : inserts.editorial)} />}
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>

          {/* The backend pages server-side, so the listing says how much of the
              result set is on screen — the production listing's own wording. */}
          {hasMore ? (
            <div className="listing-more">
              <Button variant="solid" onClick={loadMore}>Load more</Button>
              <p className="listing-more__note">{`Showing ${visible.length} of ${total} · ${remaining} more`}</p>
            </div>
          ) : total > 12 ? (
            <p className="listing-tail">{`That is all ${total} ${total === 1 ? 'piece' : 'pieces'} in this edit.`}</p>
          ) : null}
        </>
      )}
    </div>
  );
}

/* ── the states a fetched catalogue has, in the design's own vocabulary ───── */

/* The design's catalogue was an array it shipped with: it had no first fetch and
   no failure, so its shop drew neither. Both are written here out of the
   design's own blocks — its grid for the plates that are coming, its `.empty`
   for the edit that would not load — and neither invents a product, a price or a
   stock figure. The retry is this application's own (`useCatalogueQuery.retry`). */

function ListingLoading() {
  return (
    <div className="listing-skeleton" aria-busy="true" aria-label="Loading this edit">
      {[0, 1, 2, 3, 4, 5, 6, 7].map((index) => (
        <div key={index}>
          <div className="listing-skeleton__plate" />
          <div className="listing-skeleton__line" />
        </div>
      ))}
    </div>
  );
}

function ListingUnavailable({ onRetry }) {
  return (
    <div className="empty">
      <p className="empty__title">We couldn&rsquo;t load this edit.</p>
      <p>The catalogue is unreachable from here. Try again in a moment.</p>
      <Button onClick={onRetry}>Try again</Button>
      <Button to="/shop/all">Browse all pieces</Button>
    </div>
  );
}

/* An Explore insert: an advertisement or an editorial frame from the placement
   register, spanning the design's grid. It carries no product and no price, and
   a placement the register holds no live media for renders nothing at all —
   which is what the production Explore grid does with the same resolver. */
function ListingInsert({ image, eyebrow, title, description, to, cta }) {
  if (!image?.src) return null;
  return (
    <Link to={to} className="listing-insert">
      <img className="listing-insert__media" src={image.src} alt={image.alt ?? ''} loading="lazy" decoding="async" onError={hideBrokenMedia} />
      <div>
        <p className="label">{eyebrow}</p>
        <p className="listing-insert__title">{title}</p>
        <p className="listing-insert__body">{description}</p>
        <span className="listing-insert__cta">{cta}</span>
      </div>
    </Link>
  );
}
