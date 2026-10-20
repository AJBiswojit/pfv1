/** Existing durable HOME_HERO editor, extended to the existing placement DTO.
 * MEDIA and TEXT are UI views over the same marketing row, never new row types.
 * Uses the existing admin-scoped marketing APIs and shared catalog refresh.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAdminAuth } from '../../context/AdminAuthContext';
import AdminPanel from './AdminPanel';
import { employeeHeroAccess } from '../../services/api/homepageApi';
import RegisteredMediaPicker from './homepage/RegisteredMediaPicker';
import { homepageAccess, entryDraft, isSafeMediaUrl } from '../../services/homepage/homepageContentModel';
import {
  loadHomepagePlacement, saveHomepageEntry, setHomepageEntryActive,
  removeHomepageEntry, reorderHomepageEntries,
} from '../../services/homepage/homepageContentService';
import { hydrateCatalog } from '../../services/catalog/catalogStore';
import { resolveMediaUrl } from '../../services/media/mediaPaths';

const fields = [
  ['title', 'Title'], ['subtitle', 'Subtitle'], ['ctaLabel', 'CTA label'],
  ['ctaHref', 'CTA destination'], ['altText', 'Media alt text'],
];
const button = 'border border-pf-border bg-pf-card px-3 py-2 text-xs disabled:opacity-40';

export default function BackendHomeHeroPanel({ placement = 'HOME_HERO', contentType = 'MEDIA', onDirtyChange, actor }) {
  const { admin: sessionAdmin } = useAdminAuth();
  const { pathname } = useLocation();
  const admin = pathname.startsWith('/employee') ? (actor?.employee ? actor : null) : sessionAdmin;
  const access = admin?.employee ? employeeHeroAccess(admin) : homepageAccess({ admin });
  const [state, setState] = useState({ status: 'loading', items: [] });
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(entryDraft());
  const [asset, setAsset] = useState(null);
  const [mobileAsset, setMobileAsset] = useState(null);
  const [mobileAssetTouched, setMobileAssetTouched] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const busyRef = useRef(false);
  const generation = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; generation.current += 1; };
  }, []);
  useEffect(() => { onDirtyChange?.(dirty || busy); }, [dirty, busy, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const load = useCallback(async ({ refreshPublic = true } = {}) => {
    if (!access.view) return;
    const request = ++generation.current;
    setState({ status: 'loading', items: [] });
    const result = await loadHomepagePlacement(admin, placement);
    if (!mounted.current || request !== generation.current) return;
    setState(result.ok ? { status: 'ready', items: [...result.items].sort((a, b) => a.sortOrder - b.sortOrder) } :
      { status: 'error', items: [], error: result.error });
    if (result.ok && refreshPublic) hydrateCatalog({ force: true }).catch(() => {});
  }, [admin, placement, access.view]);
  useEffect(() => { load(); }, [load]);

  const resetForm = () => { setEditing(null); setAsset(null); setMobileAsset(null); setMobileAssetTouched(false); setDraft(entryDraft()); setDirty(false); };
  const discard = () => !dirty || window.confirm('Discard unsaved changes to this entry?');
  const beginEdit = (item = {}) => {
    if (busyRef.current || !discard()) return;
    setEditing(item); setDraft(entryDraft(item)); setAsset(null); setMobileAsset(null); setMobileAssetTouched(false); setDirty(false); setMessage(null);
  };
  const run = async (operation) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setMessage(null);
    try {
      const result = await operation();
      if (!mounted.current) return;
      if (!result.ok) { setMessage({ type: 'error', text: result.error || 'The backend rejected this change. Nothing was saved.' }); return; }
      resetForm();
      setMessage({ type: 'success', text: 'Saved to backend. Reloading authoritative placement; public refresh requested.' });
      hydrateCatalog({ force: true }).catch(() => {});
      await load({ refreshPublic: false });
    } catch (error) {
      if (mounted.current) setMessage({ type: 'error', text: `Could not confirm save: ${error.message}. Refresh before retrying.` });
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const handleSave = (event) => {
    event.preventDefault();
    if (!(editing?.id ? access.edit : access.create)) return;
    run(() => saveHomepageEntry(admin, { placement, id: editing?.id, draft, asset, mobileAsset, mobileAssetTouched, sortOrder: Math.max(-1, ...state.items.map((item) => Number(item.sortOrder) || 0)) + 1 }));
  };
  const handleMove = (index, direction) => {
    if (!access.edit || dirty) return;
    const ids = state.items.map((item) => item.id);
    const target = index + direction;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    run(() => reorderHomepageEntries(admin, placement, ids));
  };

  if (!access.view) return <p role="alert">Administrative media access required. Employee tokens cannot use the existing marketing-media API.</p>;
  return <AdminPanel title={placement === 'HOME_HERO' ? 'HOME_HERO — Hero carousel' : `${placement} — durable marketing entries`}
    eyebrow={contentType === 'TEXT' ? 'TEXT · media-backed copy' : 'MEDIA · registered assets'}
    action={<div className="flex flex-wrap gap-2">
      <button type="button" className={button} disabled={busy} onClick={() => { if (discard()) { resetForm(); load(); } }}>Refresh placement</button>
      {access.create && contentType === 'MEDIA' && <button type="button" className={button} disabled={busy} onClick={() => beginEdit()}>Add registered media</button>}
    </div>}>
    <p className="mb-4 text-xs text-pf-muted">Changes save to the existing marketing-media backend. New entries start inactive. Text belongs to a media entry, not a standalone section. {placement === 'HOME_HERO' ? 'Blank title/CTA fields use existing backend defaults. Public /home does not expose altText.' : 'Saved here does not mean displayed on the customer storefront; this section does not consume these placement rows yet.'}</p>
    {message && <p role={message.type === 'error' ? 'alert' : 'status'} className={`mb-4 border p-3 text-sm ${message.type === 'error' ? 'border-amber-300 bg-amber-50' : 'border-green-300 bg-green-50'}`}>{message.text}</p>}
    {state.status === 'loading' ? <p role="status">Loading {placement} from backend…</p> : state.status === 'error' ?
      <div role="alert"><p>Placement reload failed: {state.error}</p><p>No fallback content or saved state is inferred from this error.</p><button type="button" className={button} onClick={load} disabled={busy}>Retry placement</button></div> :
      <>
        <p className="mb-3 text-xs">{state.items.length} saved entries · {state.items.filter((item) => item.isActive).length} active</p>
        {!state.items.length && <p className="mb-4 border border-dashed border-pf-border p-6 text-sm">No saved entries. {placement === 'HOME_HERO' ? 'With no hero rows, the backend may return its canonical fallback. All-inactive configured rows intentionally hide the hero.' : 'No client content is substituted.'}</p>}
        <ul className="grid gap-3 lg:grid-cols-2">
          {state.items.map((item, index) => {
            const rawUrl = item.url || '';
            const url = isSafeMediaUrl(rawUrl) ? resolveMediaUrl(rawUrl) : '';
            return <li key={item.id} className="min-w-0 border border-pf-border bg-pf-card p-3">
              {contentType === 'MEDIA' && url && <img src={url} alt={item.altText || ''} className="mb-3 h-32 w-full object-cover" loading="lazy" />}
              {!url && <p className="text-xs text-amber-900">No safe media preview available.</p>}
              <p className="font-display text-lg">{item.title || 'Untitled entry'}</p>
              <p className="text-sm">{item.subtitle}</p>
              <p className="break-all text-xs text-pf-muted">{item.objectKey} · {item.isActive ? 'Active' : 'Inactive'} · saved</p>
              <p className="break-all text-xs">CTA: {item.ctaLabel || '—'} → {item.ctaHref || '—'}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {access.edit && <>
                  <button type="button" className={button} disabled={busy} onClick={() => beginEdit(item)}>Edit {contentType === 'TEXT' ? 'text' : 'entry'}</button>
                  <button type="button" className={button} disabled={busy || dirty || index === 0} onClick={() => handleMove(index, -1)}>Move up</button>
                  <button type="button" className={button} disabled={busy || dirty || index === state.items.length - 1} onClick={() => handleMove(index, 1)}>Move down</button>
                  <button type="button" className={button} disabled={busy || dirty} onClick={() => run(() => setHomepageEntryActive(admin, item.id, !item.isActive))}>{item.isActive ? 'Deactivate' : 'Activate'}</button>
                </>}
                {access.delete && <button type="button" className={button} disabled={busy || dirty} onClick={() => {
                  if (window.confirm('Remove this placement entry? This does not delete the media object or any product.')) run(() => removeHomepageEntry(admin, item.id));
                }}>Remove entry</button>}
              </div>
            </li>;
          })}
        </ul>
      </>}
    {editing && <form onSubmit={handleSave} className="mt-5 space-y-4 border border-pf-gold-deep bg-pf-card p-4">
      <h3 className="font-display text-xl">{editing.id ? 'Edit saved entry' : 'New inactive media entry'}</h3>
      <p role="status" className="text-xs">{dirty ? 'Pending — unsaved changes' : 'No pending changes'} · {placement}</p>
      {contentType === 'MEDIA' && <RegisteredMediaPicker admin={admin} value={asset} disabled={busy} onChange={(value) => { setAsset(value); setDirty(true); }} />}
      {placement === 'HOME_HERO' && contentType === 'MEDIA' && <div className="space-y-2">
        <p className="text-xs">Mobile image (optional) · current asset: {editing?.mobileMediaAssetId || 'none'}</p>
        <RegisteredMediaPicker admin={admin} value={mobileAsset} disabled={busy} onChange={(value) => { setMobileAsset(value); setMobileAssetTouched(true); setDirty(true); }} />
        <button type="button" className={button} disabled={busy || (!mobileAsset && !editing?.mobileMediaAssetId)} onClick={() => { setMobileAsset(null); setMobileAssetTouched(true); setDirty(true); }}>Clear mobile image</button>
      </div>}
      <fieldset disabled={busy} className="grid gap-3 md:grid-cols-2">
        {fields.map(([key, label]) => <label key={key} className="text-xs">{label}
          <input className="mt-1 block w-full border border-pf-border bg-pf-ivory p-2 text-sm" value={draft[key]} onChange={(e) => { setDraft((old) => ({ ...old, [key]: e.target.value })); setDirty(true); }} />
        </label>)}
      </fieldset>
      <div className="flex gap-3">
        <button type="submit" className={button} disabled={busy || !dirty || (!editing.id && !asset)}>{busy ? 'Saving…' : 'Save to backend'}</button>
        <button type="button" className={button} disabled={busy} onClick={() => { if (discard()) resetForm(); }}>Cancel</button>
      </div>
    </form>}
    {!access.edit && <p className="mt-4 text-xs">Read-only: media.assign is required to edit, activate or reorder; media.delete is required to remove entries.</p>}
  </AdminPanel>;
}
