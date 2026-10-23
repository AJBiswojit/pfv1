import { useEffect, useState } from 'react';
import { loadRegisteredImages } from '../../../services/homepage/homepageContentService';
import { registeredImageUrl } from '../../../services/homepage/homepageContentModel';

/* Batch 2 (B-11): the library grows past one page of 24, so the picker
   searches and scopes SERVER-side (key/filename + owning product name/SKU;
   product/hero/marketing). Typing is debounced; any filter change restarts
   at page 1; the page size (24) and the selection (held by the parent)
   are unchanged. */
const SEARCH_DEBOUNCE_MS = 250;
const SCOPE_FILTERS = [
  { value: '', label: 'All scopes' },
  { value: 'product', label: 'Product media' },
  { value: 'hero', label: 'Hero art' },
  { value: 'marketing', label: 'Marketing art' },
];

/* F-18 (Batch 3): `disabled` used to be applied to the <fieldset>, which also
   disabled the "Retry media library" button — with no media.view the picker
   could never recover. The fieldset now only groups; each interactive control
   is disabled individually and Retry stays reachable. */
export default function RegisteredMediaPicker({ admin, value, onChange, disabled = false, disabledReason = '' }) {
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [scopeFilter, setScopeFilter] = useState('');
  const [state, setState] = useState({ status: 'loading', items: [], total: 0 });

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, scopeFilter]);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading', items: [], total: 0 });
    loadRegisteredImages(admin, page, { q: debouncedQuery, scopeFilter }).then((result) => {
      if (!cancelled) setState({ ...result, status: result.ok ? 'ready' : 'error' });
    });
    return () => { cancelled = true; };
  }, [admin, page, attempt, debouncedQuery, scopeFilter]);

  /* No aria-disabled on the group: Retry inside stays operable by design, and a
     group announced as disabled while one child works is inconsistent. */
  return <fieldset className="space-y-3 border border-pf-border-strong p-3">
    <legend className="px-1 font-ui text-xs">Registered image library</legend>
    {disabled && disabledReason && <p role="status" className="text-xs">{disabledReason}</p>}
    {value && <p className="break-all text-xs" role="status">Selected: {value.objectKey} · not saved yet</p>}
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
      <label className="block text-xs">
        <span className="block">Search registered media (object key, file, product name or SKU)</span>
        <input
          type="search"
          value={query}
          disabled={disabled}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="e.g. Banarasi or PF-W-SAR-SIL-0001"
          className="mt-1 w-full border border-pf-border-strong bg-transparent px-2 py-1"
        />
      </label>
      <label className="block text-xs">
        <span className="block">Scope</span>
        <select
          value={scopeFilter}
          disabled={disabled}
          onChange={(event) => setScopeFilter(event.target.value)}
          className="mt-1 w-full border border-pf-border-strong bg-transparent px-2 py-1"
        >
          {SCOPE_FILTERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
    </div>
    {state.status === 'loading' ? <p role="status">Loading registered media…</p> : state.status === 'error' ?
      <div role="alert"><p>{state.error}</p><button type="button" onClick={() => setAttempt((v) => v + 1)}>Retry media library</button></div> :
      <>
        {!state.items.length && <p>No safe registered images match this page. Register media through the existing media library, adjust the search, or try another page.</p>}
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          {state.items.map((asset) => <button key={asset.id} type="button" aria-pressed={value?.id === asset.id} disabled={disabled}
            onClick={() => onChange(asset)} className={`min-w-0 border p-2 text-left disabled:opacity-40 ${value?.id === asset.id ? 'border-pf-gold-deep bg-pf-ivory' : 'border-pf-border-strong'}`}>
            <img src={registeredImageUrl(asset)} alt="" loading="lazy" className="h-24 w-full object-cover" />
            <span className="mt-2 block break-all text-[11px]">{asset.objectKey}</span>
            {asset.productName && <span className="block break-all text-[11px] text-pf-muted">{asset.productName}{asset.productSku ? ` · ${asset.productSku}` : ''}</span>}
          </button>)}
        </div>
        <div className="flex items-center gap-4 text-xs">
          <button type="button" disabled={disabled || page === 1} onClick={() => setPage((v) => v - 1)}>Previous media</button>
          <span>Page {page} · {state.total} registered assets</span>
          <button type="button" disabled={disabled || page * 24 >= state.total} onClick={() => setPage((v) => v + 1)}>Next media</button>
        </div>
      </>}
  </fieldset>;
}
