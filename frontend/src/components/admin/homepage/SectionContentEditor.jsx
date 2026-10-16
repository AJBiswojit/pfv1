import { useCallback, useEffect, useRef, useState } from 'react';
import { readHomepageSection, writeHomepageSection, staffHomepageAccess } from '../../../services/api/homepageApi';
import { hydrateCatalog } from '../../../services/catalog/catalogStore';
import RegisteredMediaPicker from './RegisteredMediaPicker';
import PublishedProductPicker from './PublishedProductPicker';

const fields = ['eyebrow', 'title', 'subtitle', 'ctaLabel', 'ctaHref', 'altText'];
const empty = () => Object.fromEntries(fields.map((k) => [k, '']));
const button = 'border border-mist px-3 py-2 text-xs disabled:opacity-40';

export default function SectionContentEditor({ actor, sectionKey, contentType, onDirtyChange }) {
  const access = staffHomepageAccess(actor);
  const [section, setSection] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [needsReload, setNeedsReload] = useState(false);
  const [slot, setSlot] = useState('');
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(empty);
  const [asset, setAsset] = useState(null);
  const [product, setProduct] = useState(null);
  const locked = useRef(false);
  const alive = useRef(true);
  const reset = () => { setEditing(null); setDraft(empty()); setAsset(null); setProduct(null); setDirty(false); };
  const load = useCallback(async () => {
    if (!access.view) return;
    const result = await readHomepageSection(actor, sectionKey);
    if (!alive.current) return;
    if (result.ok) { setSection(result.section); setError(''); setNeedsReload(false); }
    else { setError(result.error || 'Content unavailable.'); setNeedsReload(true); }
    return result;
  }, [actor, sectionKey, access.view]);
  useEffect(() => { alive.current = true; load(); return () => { alive.current = false; }; }, [load]);
  useEffect(() => { onDirtyChange?.(dirty || busy); return () => onDirtyChange?.(false); }, [dirty, busy, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const allowed = (section?.allowedSlots ?? []).filter((s) => s.contentType === contentType);
  const currentSlot = slot || allowed[0]?.slotKey || '';
  const entries = (section?.items ?? []).filter((r) => r.contentType === contentType);
  const canWrite = access.write && (contentType !== 'MEDIA' || access.mediaAssign);
  const revision = section?.revision ?? 0;

  const run = async (suffix, method, body, { deleting = false, configuring = false } = {}) => {
    if (locked.current || !access.write || needsReload || (!configuring && !(deleting ? contentType !== 'MEDIA' || access.mediaDelete : canWrite))) return;
    locked.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const result = await writeHomepageSection(actor, sectionKey, suffix, method, body);
      if (!alive.current) return;
      if (!result.ok) {
        setError(result.error || 'Change rejected.');
        if (!result.status || result.status === 409) setNeedsReload(true);
        return;
      }
      setSection(result.section); reset();
      setMessage('Saved to backend. Refreshing authoritative content…');
      // Request public hydration even if the subsequent staff reload fails.
      const publicRefresh = hydrateCatalog({ force: true });
      const fresh = await load();
      const snapshot = await publicRefresh;
      if (!alive.current) return;
      setMessage(!fresh?.ok ? 'Saved; staff reload failed. Retry reload before editing.' : snapshot.homeStatus === 'error' || !snapshot.home?.homepageContent || snapshot.home.homepageContent.status !== 'ready' ? 'Saved; public refresh failed. Retry refresh.' : 'Saved; authoritative content reloaded and public refresh completed.');
    } catch (failure) {
      if (alive.current) { setError(`Could not confirm save/refresh: ${failure.message}. Reload before retrying.`); setNeedsReload(true); }
    } finally { locked.current = false; if (alive.current) setBusy(false); }
  };
  const reload = async () => {
    if (busy || (dirty && !window.confirm('Discard unsaved edits and reload?'))) return;
    reset(); await load();
    hydrateCatalog({ force: true }).catch(() => {});
  };
  if (!access.view) return <p>Section persistence requires marketing.view. Existing media-only access is unchanged.</p>;
  if (!section) return <div>{error ? <p role="alert">{error}</p> : <p role="status">Loading section content…</p>}<button type="button" onClick={reload}>Retry section</button></div>;
  return <div className="space-y-4 border border-mist p-4">
    <p role="status">{section.configured ? `Backend controlled · ${section.state} · revision ${revision}` : 'Not configured · existing storefront content remains in use.'}</p>
    <button type="button" className={button} disabled={busy} onClick={reload}>Reload section and public content</button>
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
    {needsReload && <p>Reload and reconcile before another write; no automatic retry is performed.</p>}
    {!section.configured ? access.write && <button type="button" className={button} disabled={busy || needsReload} onClick={() => {
      if (window.confirm('Switch this section to backend control? The first save is inactive and hides its existing fallback until you activate it.')) run('', 'put', { expectedRevision: 0, isActive: false }, { configuring: true });
    }}>Configure section (initially hidden)</button> : <>
      {access.write && <button type="button" className={button} disabled={busy || dirty || needsReload || (!section.isActive && section.items.some((r) => r.contentType === 'MEDIA' && r.isActive) && !access.mediaAssign)} onClick={() => run('', 'put', { expectedRevision: revision, isActive: !section.isActive }, { configuring: true })}>{section.isActive ? 'Deactivate section' : 'Activate section'}</button>}
      {!allowed.length ? <p>No {contentType} slot is registered for this section.</p> : <>
        <ul className="space-y-2">{entries.map((row) => <li key={row.id} className="border border-mist p-3">
          <p>{row.slotKey} · {row.title || row.product?.name || row.productId || row.mediaAssetId} · {row.isActive ? 'Active' : 'Inactive'}</p>
          {row.warning && <p role="status">Not publicly eligible: {row.warning}</p>}
          {canWrite && <>
            <button type="button" className={button} disabled={busy || dirty || needsReload} onClick={() => { setEditing(row); setSlot(row.slotKey); setDraft(Object.fromEntries(fields.map((k) => [k, row[k] || '']))); setAsset(null); setProduct(null); }}>Edit entry</button>
            <button type="button" className={button} disabled={busy || dirty || needsReload} onClick={() => run(`/items/${encodeURIComponent(row.id)}`, 'patch', { expectedRevision: revision, isActive: !row.isActive })}>{row.isActive ? 'Deactivate entry' : 'Activate entry'}</button>
          </>}
          {access.write && (contentType !== 'MEDIA' || access.mediaDelete) && <button type="button" className={button} disabled={busy || dirty || needsReload} onClick={() => { if (window.confirm('Remove only this homepage entry? Its product/media object is not deleted.')) run(`/items/${encodeURIComponent(row.id)}?expectedRevision=${revision}`, 'delete', undefined, { deleting: true }); }}>Remove entry</button>}
          {canWrite && (() => {
            const group = sectionKey === 'trust' ? 'trust-items' : sectionKey === 'sarees' && contentType === 'MEDIA' ? 'lookbook' : row.slotKey;
            const members = entries.filter((r) => group === 'trust-items' || group === 'lookbook' || r.slotKey === row.slotKey);
            const index = members.findIndex((r) => r.id === row.id);
            if (contentType !== 'PRODUCT' && !['trust-items', 'lookbook'].includes(group)) return null;
            return <button type="button" className={button} disabled={busy || dirty || needsReload || index === 0} onClick={() => {
              const ids = members.map((r) => r.id); [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
              run('/reorder', 'put', { expectedRevision: revision, slotKey: group, contentType, itemIds: ids });
            }}>Move entry up</button>;
          })()}
        </li>)}</ul>
        {canWrite && <form className="space-y-3" onSubmit={(event) => {
          event.preventDefault();
          const body = { expectedRevision: revision };
          if (!editing) Object.assign(body, { contentType, slotKey: currentSlot, isActive: false });
          if (contentType !== 'PRODUCT') for (const key of fields) body[key] = draft[key] || null;
          if (asset) body.mediaAssetId = asset.id;
          if (product) body.productId = product.id;
          run(editing ? `/items/${encodeURIComponent(editing.id)}` : '/items', editing ? 'patch' : 'post', body);
        }}>
          <h3>{editing ? 'Edit saved entry' : 'New inactive entry'}</h3>
          <label>Slot <select value={editing?.slotKey || currentSlot} disabled={busy || Boolean(editing)} onChange={(event) => { setSlot(event.target.value); setDirty(true); }}>{allowed.map((s) => <option key={s.slotKey} value={s.slotKey}>{s.slotKey} (max {s.capacity})</option>)}</select></label>
          {contentType !== 'PRODUCT' && fields.map((field) => <label key={field} className="block text-xs">{field}<input className="ml-2 border border-mist p-2" value={draft[field]} disabled={busy} onChange={(event) => { setDraft((v) => ({ ...v, [field]: event.target.value })); setDirty(true); }} /></label>)}
          {contentType === 'MEDIA' && <RegisteredMediaPicker admin={actor.employee ? actor : actor.admin} disabled={busy || !access.mediaView} value={asset} onChange={(value) => { setAsset(value); setDirty(true); }} />}
          {contentType === 'PRODUCT' && <PublishedProductPicker actor={actor} selectedId={product?.id} disabled={busy} onSelect={(value) => { setProduct(value); setDirty(true); }} />}
          <button type="submit" className={button} disabled={busy || needsReload || (!dirty && !editing) || (!editing && contentType === 'MEDIA' && !asset) || (!editing && contentType === 'PRODUCT' && !product)}>{busy ? 'Saving…' : 'Save section entry'}</button>
          <button type="button" className={button} disabled={busy} onClick={reset}>Cancel entry changes</button>
          <p role="status">{dirty ? 'Pending changes — not saved.' : 'No unsaved entry changes.'}</p>
        </form>}
      </>}
    </>}
    {sectionKey === 'newsletter' && <p>Content only. Newsletter subscription is unavailable; no sign-up is simulated.</p>}
    {sectionKey === 'promotion' && <p>Editorial banner only. This editor cannot create/apply discounts, codes or expiry dates.</p>}
  </div>;
}
