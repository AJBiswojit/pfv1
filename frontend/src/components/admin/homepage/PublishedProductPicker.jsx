import { useEffect, useState } from 'react';
import { loadPublishedHomepageProducts } from '../../../services/homepage/homepageContentService';
import { eligibleHomepageProduct } from '../../../services/homepage/homepageContentModel';
import { resolveMediaUrl } from '../../../services/media/mediaPaths';

/** Inspection/selection only: the backend has no section-product write DTO. */
export default function PublishedProductPicker({ actor, onSelect, selectedId, disabled = false }) {
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState([]);
  const [state, setState] = useState({ status: 'loading', items: [], total: 0 });
  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading', items: [], total: 0 });
    // Fail closed on refresh: a product removed/unpublished by the backend
    // must not remain selected from the old page. No catalogue shadow cache.
    setSelected([]);
    if (onSelect && selectedId) onSelect(null);
    loadPublishedHomepageProducts(actor, page).then((result) => {
      if (!cancelled) setState({ ...result, status: result.ok ? 'ready' : 'error' });
    });
    return () => { cancelled = true; };
  }, [actor, page, attempt]);
  const items = (state.items ?? []).filter(eligibleHomepageProduct)
    .filter((p) => `${p.id} ${p.name}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="space-y-4">
    {!onSelect && <div className="border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
      <strong>PRODUCT assignment is not supported by the current backend.</strong>
      <p className="mt-1">Select published products for inspection only. Selections are unsaved, clear on refresh, and never change the storefront. No local publishing or automatic product creation.</p>
    </div>}
    <div className="flex flex-wrap items-center gap-3">
      <label className="text-xs">Search this page <input value={query} onChange={(e) => setQuery(e.target.value)} className="ml-2 border border-pf-border bg-pf-card p-2" /></label>
      <button type="button" onClick={() => setAttempt((v) => v + 1)} className="border border-pf-border p-2 text-xs">Refresh published catalogue</button>
    </div>
    {state.status === 'loading' ? <p role="status">Loading published products…</p> : state.status === 'error' ?
      <div role="alert"><p>{state.error}</p><button type="button" onClick={() => setAttempt((v) => v + 1)}>Retry products</button></div> :
      <>
        {!items.length && <p>No eligible published products on this page. Drafts, review items and unpublished records cannot be selected.</p>}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((product) => <label key={product.id} className="flex gap-3 border border-pf-border p-3">
            <input type="checkbox" disabled={disabled} checked={onSelect ? selectedId === product.id : selected.includes(product.id)} onChange={(e) => onSelect ? onSelect(e.target.checked ? product : null) : setSelected((ids) => e.target.checked ? [...ids, product.id] : ids.filter((id) => id !== product.id))} />
            {product.image && <img src={resolveMediaUrl(product.image)} alt="" className="h-16 w-12 object-cover" />}
            <span className="min-w-0"><span className="block text-sm">{product.name}</span><span className="block break-all text-xs text-pf-muted">{product.id} · Published</span></span>
          </label>)}
        </div>
        <div className="flex items-center gap-4 text-xs">
          <button type="button" disabled={page === 1} onClick={() => setPage((v) => v - 1)}>Previous products</button>
          <span>Page {page}</span>
          <button type="button" disabled={page * 24 >= state.total} onClick={() => setPage((v) => v + 1)}>Next products</button>
        </div>
      </>}
    {!onSelect && <><p role="status" className="text-xs">{selected.length} selected · not saved · no product-assignment endpoint</p>
    <button type="button" disabled className="border border-pf-border p-2 text-xs opacity-60">Product assignment unavailable</button></>}
  </div>;
}
