/** Existing durable HOME_HERO editor, extended to the existing placement DTO.
 * MEDIA and TEXT are UI views over the same marketing row, never new row types.
 * Uses the existing admin-scoped marketing APIs and shared catalog refresh.
 */
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAdminAuth } from '../../context/AdminAuthContext';
import AdminPanel from './AdminPanel';
import { employeeHeroAccess } from '../../services/api/homepageApi';
import RegisteredMediaPicker from './homepage/RegisteredMediaPicker';
import PlacementAssetPanel from './media/PlacementAssetPanel';
import { CopyField, ErrorSummary, clearedErrors, copyFieldsFor } from './homepage/copyFields';
import EntryRow from './homepage/EntryRow';
import { SaveBar, buttonClass } from './homepage/SaveBar';
import PreviewErrorBoundary from './homepage/PreviewErrorBoundary';
import { homepageAccess, entryDraft, ctaErrors, isSafeMediaUrl, registeredImageUrl } from '../../services/homepage/homepageContentModel';
import {
  loadHomepagePlacement, saveHomepageEntry, setHomepageEntryActive,
  removeHomepageEntry, reorderHomepageEntries,
} from '../../services/homepage/homepageContentService';
import { hydrateCatalog } from '../../services/catalog/catalogStore';
import { resolveMediaUrl } from '../../services/media/mediaPaths';

/* F-07/F-08 (Batch 3): the same copy descriptors as the section editor. The
   hero row has no eyebrow field, so it asks for exactly the five it writes. */
const fields = copyFieldsFor(['title', 'subtitle', 'ctaLabel', 'ctaHref', 'altText']);
/* F-24: intent-specific variants instead of one border style for everything. */
const button = buttonClass('secondary');

/* F-04: the storefront Hero is loaded on demand, exactly like the non-hero
   preview, so the twelve section editors do not pull it into the page bundle. */
const HeroPreview = lazy(() => import('./homepage/HeroPreview'));

/* The entries the editor is holding in memory, with the open form overlaid.
   Nothing is written: this array never leaves the component. */
function previewRows(items, editing, draft, asset) {
  if (!editing) return items;
  const next = items.map((item) => ({ ...item }));
  const artwork = asset ? registeredImageUrl(asset) || asset.url || '' : '';
  if (editing.id) {
    const index = next.findIndex((item) => item.id === editing.id);
    if (index >= 0) next[index] = { ...next[index], ...draft, url: artwork || next[index].url };
    return next;
  }
  return [...next, {
    id: 'hero-preview-draft',
    ...draft,
    url: artwork,
    sortOrder: next.reduce((max, item) => Math.max(max, Number(item.sortOrder) || 0), -1) + 1,
    isActive: false,
  }];
}

export default function BackendHomeHeroPanel({ placement = 'HOME_HERO', contentType = 'MEDIA', onDirtyChange, onSaved, actor }) {
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
  /* F-13 (Batch 4): the hero row accepts an orphan CTA label and the storefront
     silently drops it, so the pair is validated here, before the write. */
  const [fieldErrors, setFieldErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [tab, setTab] = useState('edit');
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

  const resetForm = () => { setEditing(null); setAsset(null); setMobileAsset(null); setMobileAssetTouched(false); setDraft(entryDraft()); setDirty(false); setFieldErrors({}); };
  const discard = () => !dirty || window.confirm('Discard unsaved changes to this entry?');
  const beginEdit = (item = {}) => {
    if (busyRef.current || !discard()) return;
    setEditing(item); setDraft(entryDraft(item)); setAsset(null); setMobileAsset(null); setMobileAssetTouched(false); setDirty(false); setFieldErrors({}); setMessage(null);
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
      onSaved?.();
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
    /* F-13: a label without a destination (or the reverse) is refused locally —
       the existing contract is preserved, nothing is rewritten on the server,
       and an already-stored orphan label stays readable until it is edited. */
    const preflight = ctaErrors(draft);
    if (Object.keys(preflight).length) { setFieldErrors(preflight); setMessage(null); return; }
    setFieldErrors({});
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
    <p className="mb-4 text-xs text-pf-muted">Changes save to the existing marketing-media backend. New entries start inactive. Text belongs to a media entry, not a standalone section. {placement === 'HOME_HERO' ? 'Blank title/CTA fields use existing backend defaults. Alt text is shown on the storefront hero image.' : 'Saved here does not mean displayed on the customer storefront; this section does not consume these placement rows yet.'}</p>
    {/* F-03 (Batch 2): the real registration entry point lives in the MEDIA
       tab. Hero/marketing art must be uploaded AND registered before it can be
       attached, and `POST /media/objects` + `POST /media/register-placement`
       are admin-only, so this disclosure is hidden from employee sessions. The
       panel is the existing PlacementAssetPanel, unchanged. */}
    {contentType === 'MEDIA' && !admin?.employee && access.create && <details className="mb-4 border border-pf-border bg-pf-card-soft">
      <summary className="cursor-pointer px-3 py-2 font-ui text-[11px] uppercase tracking-[.16em] text-pf-muted">Register new hero art — upload and placement registration</summary>
      <div className="border-t border-pf-border/70 p-3">
        <p className="mb-3 text-xs text-pf-muted">Same panel as Media → Advanced: homepage placement art. Only hero/ and marketing/ images are accepted; registration is explicit, never automatic.</p>
        <PlacementAssetPanel onRegistered={() => load({ refreshPublic: false })} />
      </div>
    </details>}
    {/* Batch 5 / F-07: a toggle, not a tab set — Preview only adds the hero
       preview above; the saved rows and the form stay in view. */}
    <div role="group" aria-label="Hero entry view" className="mb-4 flex gap-2">
      <button type="button" aria-pressed={tab === 'edit'} className={button} onClick={() => setTab('edit')}>Edit</button>
      <button type="button" aria-pressed={tab === 'preview'} className={button} onClick={() => setTab('preview')}>Preview</button>
    </div>
    {tab === 'preview' && (state.status === 'ready'
      ? <PreviewErrorBoundary>
        <Suspense fallback={<p>Loading hero preview…</p>}>
          <HeroPreview rows={previewRows(state.items, editing, draft, asset)} unsaved={dirty} />
        </Suspense>
      </PreviewErrorBoundary>
      : <p role="status">Preview becomes available once the saved entries have loaded. Nothing is written by this tab.</p>)}
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
            /* F-06/F-07: the same card as the section editor, keeping the wide
               hero artwork (variant="cover"). */
            return <EntryRow
              key={item.id}
              variant="cover"
              thumbnail={contentType === 'MEDIA' ? url : ''}
              thumbnailAlt={item.altText || ''}
              title={item.title}
              meta={[item.subtitle, `${item.objectKey} · saved`, `CTA: ${item.ctaLabel || '—'} → ${item.ctaHref || '—'}`]}
              status={item.isActive ? 'Active' : 'Inactive'}
              notice={contentType === 'MEDIA' && !url ? 'No safe media preview available.' : ''}
            >
                {access.edit && <>
                  <button type="button" className={button} disabled={busy} onClick={() => beginEdit(item)}>Edit {contentType === 'TEXT' ? 'text' : 'entry'}</button>
                  <button type="button" className={button} disabled={busy || dirty || index === 0} onClick={() => handleMove(index, -1)}>Move up</button>
                  <button type="button" className={button} disabled={busy || dirty || index === state.items.length - 1} onClick={() => handleMove(index, 1)}>Move down</button>
                  <button type="button" className={button} disabled={busy || dirty} onClick={() => run(() => setHomepageEntryActive(admin, item.id, !item.isActive))}>{item.isActive ? 'Deactivate' : 'Activate'}</button>
                </>}
                {access.delete && <button type="button" className={buttonClass('destructive')} disabled={busy || dirty} onClick={() => {
                  if (window.confirm('Remove this placement entry? This does not delete the media object or any product.')) run(() => removeHomepageEntry(admin, item.id));
                }}>Remove entry</button>}
            </EntryRow>;
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
      <ErrorSummary errors={fieldErrors} />
      <fieldset disabled={busy} className="grid gap-3 md:grid-cols-2">
        {fields.map((field) => <CopyField
          key={field.key}
          field={field}
          value={draft[field.key]}
          disabled={busy}
          error={fieldErrors[field.key] || ''}
          onChange={(value) => {
            setDraft((old) => ({ ...old, [field.key]: value })); setDirty(true);
            /* A corrected field must stop claiming to be wrong. */
            setFieldErrors((old) => clearedErrors(old, field.key));
          }}
        />)}
      </fieldset>
      <SaveBar>
        <button type="submit" className={buttonClass('primary')} disabled={busy || !dirty || (!editing.id && !asset)}>{busy ? 'Saving…' : 'Save to backend'}</button>
        <button type="button" className={button} disabled={busy} onClick={() => { if (discard()) resetForm(); }}>Cancel</button>
      </SaveBar>
    </form>}
    {!access.edit && <p className="mt-4 text-xs">Read-only: media.assign is required to edit, activate or reorder; media.delete is required to remove entries.</p>}
  </AdminPanel>;
}
