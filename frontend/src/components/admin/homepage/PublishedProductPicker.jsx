import { useEffect, useState } from 'react';
import { loadPublishedHomepageProducts } from '../../../services/homepage/homepageContentService';
import { eligibleHomepageProduct } from '../../../services/homepage/homepageContentModel';
import { staffHomepageAccess } from '../../../services/api/homepageApi';
import { resolveMediaUrl } from '../../../services/media/mediaPaths';

/* Batch 2 (B-10): the banner is permission-aware — product assignment DOES
   exist (the section editor saves productId server-side); what can be
   missing is the actor's marketing.manage capability or an editing context.
   The selection survives paging; search is a server-side `q`, not a filter
   of the 24 loaded rows. */
const SEARCH_DEBOUNCE_MS = 250;

export default function PublishedProductPicker({ actor, onSelect, selectedId, disabled = false }) {
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selected, setSelected] = useState([]);
  const [state, setState] = useState({ status: 'loading', items: [], total: 0 });

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery]);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading', items: [], total: 0 });
    // Note the selection is deliberately NOT cleared here: paging through the
    // catalogue must preserve it (B-10). No catalogue shadow cache.
    loadPublishedHomepageProducts(actor, page, { q: debouncedQuery }).then((result) => {
      if (!cancelled) setState({ ...result, status: result.ok ? 'ready' : 'error' });
    });
    return () => { cancelled = true; };
  }, [actor, page, attempt, debouncedQuery]);

  const items = (state.items ?? []).filter(eligibleHomepageProduct);
  const access = staffHomepageAccess(actor);
  return <div className="space-y-4">
    {!onSelect && <div className="border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
      {access.write ? <>
        <strong>Inspection only.</strong>
        <p className="mt-1">Products are assigned to homepage sections from the section editor, which saves server-side. Selections made on this panel are not saved and never change the storefront.</p>
      </> : <>
        <strong>Your account needs the marketing.manage capability to assign products to homepage sections.</strong>
        <p className="mt-1">You can inspect the published catalogue here. If you need to change section products, ask an administrator holding marketing.manage; no publishing or product creation happens from this panel.</p>
      </>}
    </div>}
    <div className="flex flex-wrap items-center gap-3">
      <label className="text-xs">Search published catalogue (server-side) <input value={query} onChange={(e) => setQuery(e.target.value)} className="ml-2 border border-pf-border bg-pf-card p-2" /></label>
      <button type="button" onClick={() => setAttempt((v) => v + 1)} className="border border-pf-border p-2 text-xs">Refresh published catalogue</button>
    </div>
    {state.status === 'loading' ? <p role="status">Loading published products…</p> : state.status === 'error' ?
      <div role="alert"><p>{state.error}</p><button type="button" onClick={() => setAttempt((v) => v + 1)}>Retry products</button></div> :
      <>
        {!items.length && <p>No eligible published products match. Drafts, review items and unpublished records cannot be selected.</p>}
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
    {!onSelect && <p role="status" className="text-xs">{selected.length} selected · not saved from this panel</p>}
  </div>;
}
