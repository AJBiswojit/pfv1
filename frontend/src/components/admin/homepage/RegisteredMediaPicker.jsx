import { useEffect, useState } from 'react';
import { loadRegisteredImages } from '../../../services/homepage/homepageContentService';
import { registeredImageUrl } from '../../../services/homepage/homepageContentModel';

export default function RegisteredMediaPicker({ admin, value, onChange, disabled = false }) {
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ status: 'loading', items: [], total: 0 });
  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading', items: [], total: 0 });
    loadRegisteredImages(admin, page).then((result) => {
      if (!cancelled) setState({ ...result, status: result.ok ? 'ready' : 'error' });
    });
    return () => { cancelled = true; };
  }, [admin, page, attempt]);
  return <fieldset disabled={disabled} className="space-y-3 border border-mist p-3">
    <legend className="px-1 font-ui text-xs">Registered image library</legend>
    {value && <p className="break-all text-xs" role="status">Selected: {value.objectKey} · not saved yet</p>}
    {state.status === 'loading' ? <p role="status">Loading registered media…</p> : state.status === 'error' ?
      <div role="alert"><p>{state.error}</p><button type="button" onClick={() => setAttempt((v) => v + 1)}>Retry media library</button></div> :
      <>
        {!state.items.length && <p>No safe registered images on this page. Register media through the existing media library, or try another page.</p>}
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          {state.items.map((asset) => <button key={asset.id} type="button" aria-pressed={value?.id === asset.id}
            onClick={() => onChange(asset)} className={`min-w-0 border p-2 text-left ${value?.id === asset.id ? 'border-accent bg-canvas-deep' : 'border-mist'}`}>
            <img src={registeredImageUrl(asset)} alt="" loading="lazy" className="h-24 w-full object-cover" />
            <span className="mt-2 block break-all text-[11px]">{asset.objectKey}</span>
          </button>)}
        </div>
        <div className="flex items-center gap-4 text-xs">
          <button type="button" disabled={page === 1} onClick={() => setPage((v) => v - 1)}>Previous media</button>
          <span>Page {page} · {state.total} registered assets</span>
          <button type="button" disabled={page * 24 >= state.total} onClick={() => setPage((v) => v + 1)}>Next media</button>
        </div>
      </>}
  </fieldset>;
}
