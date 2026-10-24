import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { MemoryRouter, useInRouterContext } from 'react-router-dom';
import { Check, Circle, Eye, Layers, Pencil, Power, RefreshCw, Trash2, Upload } from 'lucide-react';
import { readHomepageSection, writeHomepageSection, staffHomepageAccess } from '../../../services/api/homepageApi';
import { hydrateCatalog } from '../../../services/catalog/catalogStore';
import { sectionReadFailureMessage, ctaErrors, isSafeMediaUrl } from '../../../services/homepage/homepageContentModel';
import { resolveMediaUrl } from '../../../services/media/mediaPaths';
import AdminPanel from '../AdminPanel';
import RegisteredMediaPicker from './RegisteredMediaPicker';
import PublishedProductPicker from './PublishedProductPicker';
import PreviewErrorBoundary from './PreviewErrorBoundary';
import { publishSummary, publishBlockers, nextPublishStep, sectionActivationReason, reorderGroupFor } from './publishModel';
import { COPY_FIELDS, COPY_KEYS, CopyField, ErrorSummary, clearedErrors, emptyCopy, fieldErrorsFor } from './copyFields';
import EntryRow from './EntryRow';
import { SaveBar, buttonClass } from './SaveBar';
import SlotMeter from './SlotMeter';

const SectionPreview = lazy(() => import('./SectionPreview'));

/* F-08/F-07 (Batch 3): the field list, its labels, help text and limits live
   in copyFields.jsx so the hero editor uses exactly the same vocabulary. */
const fields = COPY_KEYS;
const empty = emptyCopy;
/* F-24: one style per intent, from the shared SaveBar variants. */
const button = buttonClass('secondary');
/* The backend's messages already end with a full stop; the new partial-result
   sentences append their own, so trim before composing to avoid "..". */
const sentence = (value, fallback) => String(value || fallback).trim().replace(/\.+$/, '');

/* The editor always mounts inside the workspace <Router>, so an unconditional
   <MemoryRouter> around the preview throws ("You cannot render a <Router>
   inside another <Router>") and the boundary reports "Preview unavailable."
   for every section. Only supply a router when none exists (isolated mounts). */
function PreviewRouter({ children }) {
  const inRouter = useInRouterContext();
  return inRouter ? children : <MemoryRouter>{children}</MemoryRouter>;
}

/* `embedded` is presentation-only: inside the control-centre panel the editor
   drops its own card chrome and lays its controls out as the approved status →
   toolbar → media-card composition. Standalone mounts (and every existing
   regression that mounts the editor directly) keep the shipped AdminPanel. */
export default function SectionContentEditor({ actor, sectionKey, contentType, onDirtyChange, onSaved, registerHref, seed = null, embedded = false }) {
  const access = staffHomepageAccess(actor);
  /* F-20 (Batch 4): the workspace list already carries this exact section
     object, so the first paint uses it instead of a second full content build.
     `seed` is only ever the list's own copy of THIS section; when the list has
     not loaded (or failed, or the actor lacks the grant) it is null and the
     editor performs its existing read, unchanged. */
  const [section, setSection] = useState(seed);
  const [error, setError] = useState('');
  const [readStatus, setReadStatus] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [needsReload, setNeedsReload] = useState(false);
  /* F-15: a revision conflict is a fact about the SERVER, not a reason to throw
     away the operator's copy. The draft, the open form and every field stay
     exactly as typed; only writes are blocked until an explicit reconcile. */
  const [conflict, setConflict] = useState(null);
  const [slot, setSlot] = useState('');
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(empty);
  /* F-14 (Batch 3): a 422 that names a field is shown under that field. */
  const [fieldErrors, setFieldErrors] = useState({});
  const [asset, setAsset] = useState(null);
  /* F-11 (Batch 2): products are staged as a SET and saved one existing call at
     a time. One row per request — no bulk endpoint and no combined payload. */
  const [staged, setStaged] = useState([]);
  /* F-16 (Batch 2): a reorder is composed locally and sent as ONE request when
     the operator commits it, instead of one request per arrow click. Orders are
     kept PER GROUP: a section can expose several product slots, and moving rows
     in one slot must never discard a pending move in another. */
  const [orders, setOrders] = useState({});
  const [tab, setTab] = useState('edit');
  const locked = useRef(false);
  const alive = useRef(true);
  const reset = () => { setEditing(null); setSlot(''); setDraft(empty()); setAsset(null); setStaged([]); setOrders({}); setDirty(false); setFieldErrors({}); };
  const load = useCallback(async () => {
    if (!access.view) return;
    const result = await readHomepageSection(actor, sectionKey);
    if (!alive.current) return;
    if (result.ok) { setSection(result.section); setError(''); setReadStatus(null); setNeedsReload(false); }
    else { setError(result.error || 'Content unavailable.'); setReadStatus(result.status ?? null); setNeedsReload(true); }
    return result;
  }, [actor, sectionKey, access.view]);
  /* The workspace keys this component by section+type, so a mount with a seed
     never needs its initial read; every later read (post-write refresh, Retry)
     still goes to the wire through `load()` exactly as before. */
  const seeded = useRef(Boolean(seed));
  useEffect(() => {
    alive.current = true;
    if (seeded.current) seeded.current = false;
    else load();
    return () => { alive.current = false; };
  }, [load]);
  /* A pending reorder is unsaved work exactly like a typed draft, so it must
     block section switches (the page uses onDirtyChange) and warn on unload. */
  const pendingGroups = Object.keys(orders).filter((group) => (orders[group] ?? []).length > 0);
  const pendingWork = dirty || pendingGroups.length > 0;
  useEffect(() => { onDirtyChange?.(pendingWork || busy); return () => onDirtyChange?.(false); }, [pendingWork, busy, onDirtyChange]);
  useEffect(() => {
    if (!pendingWork) return undefined;
    const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [pendingWork]);
  const allowed = (section?.allowedSlots ?? []).filter((s) => s.contentType === contentType);
  const entries = (section?.items ?? []).filter((r) => r.contentType === contentType);
  /* Slot occupancy from the authoritative section read. A create against a
     full slot is a guaranteed backend 409 that forces a reload and discards
     the draft — so full slots are disabled up front and the form defaults to
     the first slot with room instead of always allowed[0]. */
  const usedIn = (slotKey) => entries.filter((r) => r.slotKey === slotKey).length;
  const remainingIn = (spec) => Math.max(0, (spec.capacity ?? 1) - usedIn(spec.slotKey));
  const firstOpen = allowed.find((s) => remainingIn(s) > 0)?.slotKey || '';
  const currentSlot = editing?.slotKey || slot || firstOpen;
  const currentSpec = allowed.find((s) => s.slotKey === currentSlot);
  const currentFull = !editing && Boolean(currentSpec) && remainingIn(currentSpec) <= 0;
  const allFull = !editing && allowed.length > 0 && allowed.every((s) => remainingIn(s) <= 0);
  const canWrite = access.write && (contentType !== 'MEDIA' || access.mediaAssign);
  const revision = section?.revision ?? 0;
  const blocked = Boolean(conflict) || needsReload;
  const configured = Boolean(section?.configured);
  const product = staged[0] ?? null;
  const summary = publishSummary(section);
  const nothingToPublish = summary.next === 'Nothing left to publish';
  const blockers = publishBlockers(section, { write: access.write, mediaAssign: access.mediaAssign, dirty: pendingWork, blocked });
  const activationReason = configured ? sectionActivationReason(section, { mediaAssign: access.mediaAssign }) : null;

  /* F-16: order rows within the group the server actually supports (trust TEXT,
     sarees lookbook MEDIA, per-slot PRODUCT). A local list keeps the group
     intact; the request is still `PUT /reorder` with exact membership. */
  const groupOf = (row) => reorderGroupFor(sectionKey, contentType, row);
  const rowsForGroup = (group) => {
    const base = entries.filter((row) => groupOf(row) === group);
    const ids = orders[group];
    if (!ids) return base;
    const byId = new Map(base.map((row) => [row.id, row]));
    return ids.map((id) => byId.get(id)).filter(Boolean);
  };
  const groupsInView = [...new Set(entries.map((row) => groupOf(row)))];
  const orderedEntries = groupsInView.flatMap((group) => rowsForGroup(group));

  /* Shared trailer for every successful write: authoritative reload, public
     hydration, and the honest sentence about what actually refreshed. */
  const afterWrite = async (nextSection, note, { configuring = false } = {}) => {
    setSection(nextSection);
    /* F-02: configuring a section used to wipe a locally drafted entry. Keep
       the draft so "type → configure → save" does not lose the typed copy. */
    if (!configuring || !dirty) reset();
    setMessage('Saved to backend. Refreshing authoritative content…');
    const publicRefresh = hydrateCatalog({ force: true });
    const fresh = await load();
    const snapshot = await publicRefresh;
    if (!alive.current) return null;
    const kept = configuring && dirty ? 'Section configured. Your draft is still unsaved — press Save section entry to store it. ' : '';
    const outcome = !fresh?.ok ? 'Saved; staff reload failed. Retry reload before editing.' : snapshot.homeStatus === 'error' || !snapshot.home?.homepageContent || snapshot.home.homepageContent.status !== 'ready' ? 'Saved; public refresh failed. Retry refresh.' : 'Saved; authoritative content reloaded and public refresh completed.';
    setMessage(`${kept}${note ? `${note} ` : ''}${outcome}`);
    onSaved?.(fresh?.ok ? fresh.section : nextSection);
    return fresh?.ok ? fresh.section : nextSection;
  };

  const run = async (suffix, method, body, { deleting = false, configuring = false, note = '' } = {}) => {
    if (locked.current || !access.write || blocked || (!configuring && !(deleting ? contentType !== 'MEDIA' || access.mediaDelete : canWrite))) return { ok: false };
    locked.current = true; setBusy(true); setError(''); setMessage(''); setFieldErrors({});
    try {
      const result = await writeHomepageSection(actor, sectionKey, suffix, method, body);
      if (!alive.current) return { ok: false };
      if (!result.ok) {
        /* F-14: recognised copy failures move under their field; the sentence
           is still shown verbatim, and everything else keeps the alert. */
        const mapped = fieldErrorsFor(result.error);
        setFieldErrors(mapped);
        setError(Object.keys(mapped).length ? '' : (result.error || 'Change rejected.'));
        if (result.status === 409) setConflict({ message: result.error || 'Content changed.', status: 409, revision });
        else if (!result.status) setNeedsReload(true);
        return { ok: false, status: result.status ?? 0 };
      }
      const latest = await afterWrite(result.section, note, { configuring });
      return { ok: true, section: latest ?? result.section };
    } catch (failure) {
      if (alive.current) { setError(`Could not confirm save/refresh: ${failure.message}. Reload before retrying.`); setNeedsReload(true); }
      return { ok: false };
    } finally { locked.current = false; if (alive.current) setBusy(false); }
  };

  /* F-10: publish = the existing activation calls, in the existing order
     (entries first, then the section), each against the revision returned by
     the previous response. It stops on the first failure and never retries. */
  const publishSection = async (start) => {
    if (locked.current || !access.write) return { ok: false };
    if (!start && blockers.length) return { ok: false };
    locked.current = true; setBusy(true); setError(''); setMessage('Publishing…');
    let current = start ?? section;
    const done = [];
    try {
      for (let guard = 0; guard < 128; guard += 1) {
        const step = nextPublishStep(current);
        if (!step) break;
        const result = await writeHomepageSection(actor, sectionKey, step.suffix, step.method, step.body);
        if (!alive.current) return { ok: false };
        if (!result.ok) {
          setError(`${done.length ? `Published ${done.length} step${done.length === 1 ? '' : 's'}, then stopped: ` : 'Publish stopped: '}${sentence(result.error, 'rejected')}. Nothing is being retried.`);
          if (result.status === 409) setConflict({ message: result.error || 'Content changed.', status: 409, revision: current?.revision ?? 0 });
          else if (!result.status) setNeedsReload(true);
          if (current) setSection(current);
          return { ok: false, section: current };
        }
        current = result.section;
        done.push(step.label);
      }
      if (!current) return { ok: false };
      if (!done.length) { setMessage('Nothing left to publish — the section is already live.'); setSection(current); return { ok: true, section: current }; }
      const latest = await afterWrite(current, `Published ${done.length} step${done.length === 1 ? '' : 's'}: ${done.join(' → ')}.`);
      return { ok: true, section: latest ?? current };
    } catch (failure) {
      if (alive.current) { setError(`Could not confirm publish: ${failure.message}. Reload before retrying.`); setNeedsReload(true); }
      return { ok: false };
    } finally { locked.current = false; if (alive.current) setBusy(false); }
  };

  /* F-11: N staged products become N existing `POST /items` calls, one at a
     time, each with the revision the previous call returned. The first
     rejection stops the loop and names exactly what was and was not saved. */
  const createProducts = async (ids) => {
    if (locked.current || !access.write || blocked || !canWrite) return { ok: false };
    locked.current = true; setBusy(true); setError(''); setMessage('');
    let current = section;
    const saved = [];
    const batchSlot = currentSlot;
    try {
      for (const productId of ids) {
        const body = { expectedRevision: current?.revision ?? 0, contentType, slotKey: currentSlot, isActive: false, productId };
        const result = await writeHomepageSection(actor, sectionKey, '/items', 'post', body);
        if (!alive.current) return { ok: false };
        if (!result.ok) {
          const remainingRows = staged.filter((row) => !saved.includes(row.id));
          const name = staged.find((row) => row.id === productId)?.name || productId;
          const remaining = ids.length - saved.length;
          if (current) setSection(current);
          /* The successful post-failure refresh clears `error`, so the honest
             partial report is set after it; the reset inside `afterWrite` also
             clears staging, so the unsaved products are re-staged afterwards. */
          if (saved.length) await afterWrite(current, `Saved ${saved.length} of ${ids.length} products.`);
          /* The refresh above resets the form. Restore the batch's own target
             slot and the still-unsaved rows, and keep them marked as pending
             work: re-targeting a later slot would save the leftovers in the
             wrong place, and a clean `dirty` flag would disable the button the
             message tells the operator to press. */
          setSlot(batchSlot);
          setStaged(remainingRows);
          setDirty(true);
          setError(`Added ${saved.length} of ${ids.length} products, then stopped at ${name}: ${sentence(result.error, 'rejected')}. No retry was attempted; ${remaining} product${remaining === 1 ? '' : 's'} remain${remaining === 1 ? 's' : ''} selected.`);
          if (result.status === 409) setConflict({ message: result.error || 'Content changed.', status: 409, revision: current?.revision ?? 0 });
          else if (!result.status) setNeedsReload(true);
          return { ok: false, section: current };
        }
        current = result.section;
        saved.push(productId);
      }
      setStaged([]);
      const latest = await afterWrite(current, `Added ${saved.length} product${saved.length === 1 ? '' : 's'} as ${saved.length} separate ${saved.length === 1 ? 'entry' : 'entries'}.`);
      return { ok: true, section: latest ?? current };
    } catch (failure) {
      if (alive.current) { setError(`Could not confirm save: ${failure.message}. Reload before retrying.`); setNeedsReload(true); }
      return { ok: false };
    } finally { locked.current = false; if (alive.current) setBusy(false); }
  };

  const submitEntry = async (publish) => {
    if (!configured || currentFull || busy || blocked) return;
    if (contentType === 'PRODUCT' && !editing) {
      const ids = staged.map((row) => row.id);
      if (!ids.length) return;
      const result = ids.length === 1
        ? await run('/items', 'post', { expectedRevision: revision, contentType, slotKey: currentSlot, isActive: false, productId: ids[0] })
        : await createProducts(ids);
      if (result.ok && publish) await publishAfterSave(result.section);
      return;
    }
    /* F-14: the two deterministic rules are checked before any request, so a
       paired-CTA mistake costs a keystroke fix instead of a round trip. */
    if (contentType !== 'PRODUCT') {
      const preflight = ctaErrors(draft);
      if (Object.keys(preflight).length) { setFieldErrors(preflight); setError(''); return; }
    }
    setFieldErrors({});
    const body = { expectedRevision: revision };
    if (!editing) Object.assign(body, { contentType, slotKey: currentSlot, isActive: false });
    if (contentType !== 'PRODUCT') for (const key of fields) body[key] = draft[key] || null;
    if (asset) body.mediaAssetId = asset.id;
    if (product) body.productId = product.id;
    const result = await run(editing ? `/items/${encodeURIComponent(editing.id)}` : '/items', editing ? 'patch' : 'post', body);
    if (result.ok && publish) await publishAfterSave(result.section);
  };

  /* "Save & publish" applies the same blockers to the freshly saved snapshot
     before it sends anything else, so a missing permission is reported rather
     than turned into a server error. */
  const publishAfterSave = async (latest) => {
    const reasons = publishBlockers(latest, { write: access.write, mediaAssign: access.mediaAssign, dirty: false, blocked: false });
    if (reasons.length) { setMessage(`Saved. Not published yet: ${reasons.join(' ')}`); return; }
    await publishSection(latest);
  };

  const reload = async () => {
    if (busy || (pendingWork && !window.confirm('Discard unsaved edits and reload?'))) return;
    setConflict(null);
    reset(); await load();
    hydrateCatalog({ force: true }).catch(() => {});
  };
  /* F-15 recovery: re-read ONLY, never a write and never an automatic retry.
     The operator keeps every typed value and must press Save again himself. */
  const reconcile = async () => {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await readHomepageSection(actor, sectionKey);
      if (!alive.current) return;
      if (!result.ok) {
        setError(`Could not read the latest revision: ${result.error || 'unknown error'}. Your draft is preserved.`);
        setReadStatus(result.status ?? null);
        return;
      }
      setSection(result.section);
      setConflict(null);
      setNeedsReload(false);
      setReadStatus(null);
      const stillExists = !editing?.id || (result.section.items ?? []).some((row) => row.id === editing.id);
      if (!stillExists) {
        /* R-1 (Batch 1 review): this must be `null`, not `{}`. An empty object
           is truthy, so the form would stay in "Edit saved entry" mode, lock
           its slot selector and submit PATCH …/items/undefined. `null` puts the
           preserved draft back into the create form, which posts a new entry
           against the fresh revision. */
        setEditing(null);
        setMessage(`Loaded revision ${result.section.revision ?? 0}. The entry you were editing no longer exists; your text is preserved here as a new entry draft. Review it, then save.`);
      } else {
        setMessage(`Loaded revision ${result.section.revision ?? 0}. Your draft is preserved below — review it, then save again to apply it. Saving writes every copy field in this form, including any the other operator changed.`);
      }
      hydrateCatalog({ force: true }).catch(() => {});
    } catch (failure) {
      if (alive.current) setError(`Could not read the latest revision: ${failure.message}. Your draft is preserved.`);
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  if (!access.view) return <p>Section persistence requires marketing.view. Existing media-only access is unchanged.</p>;
  if (!section) return <div>{error ? <><p role="alert">{sectionReadFailureMessage(readStatus, error)}</p><p>{error}</p></> : <p role="status">Loading section content…</p>}<button type="button" onClick={reload}>Retry section</button></div>;

  /* F-08: labels, help, limits and per-field errors now come from the shared
     descriptor list instead of the raw request key. */
  const copyInputs = contentType !== 'PRODUCT' && COPY_FIELDS.map((field) => <CopyField
    key={field.key}
    field={field}
    value={draft[field.key]}
    disabled={busy}
    error={fieldErrors[field.key] || ''}
    onChange={(value) => { setDraft((v) => ({ ...v, [field.key]: value })); setDirty(true); setFieldErrors((old) => clearedErrors(old, field.key)); }}
  />);
  /* Batch 1 (F-02): an unconfigured section can be authored as a LOCAL draft so
     the operator can preview it before any backend row exists. There is no
     submit control, no request and no implied save in this state. */
  const draftForm = canWrite && allowed.length > 0 && <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); return submitEntry(false); }}>
    <h3>{editing ? 'Edit saved entry' : configured ? 'New inactive entry' : 'New draft entry (not saved)'}</h3>
    <label className="block text-xs">Slot
      <select className="mt-1 block w-full border border-pf-border-strong bg-pf-ivory p-2 text-sm" value={editing?.slotKey || currentSlot} disabled={busy || Boolean(editing)} onChange={(event) => { setSlot(event.target.value); setStaged([]); setDirty(true); }}>{allowed.map((s) => <option key={s.slotKey} value={s.slotKey} disabled={remainingIn(s) <= 0}>{s.slotKey} ({usedIn(s.slotKey)}/{s.capacity} filled{remainingIn(s) <= 0 ? ' — full' : ''})</option>)}</select>
    </label>
    {currentSpec && <SlotMeter slotKey={currentSpec.slotKey} used={usedIn(currentSpec.slotKey)} capacity={currentSpec.capacity} />}
    {currentFull && <p role="status">This slot is full — choose a slot with room before saving.</p>}
    <ErrorSummary errors={fieldErrors} />
    {copyInputs}
    {contentType === 'MEDIA' && <RegisteredMediaPicker admin={actor.employee ? actor : actor.admin} disabled={busy || !access.mediaView} disabledReason={!access.mediaView ? 'Browsing the registered library requires media.view. Ask an administrator; Retry stays available.' : ''} value={asset} onChange={(value) => { setAsset(value); setDirty(true); }} />}
    {contentType === 'MEDIA' && registerHref && <p className="text-xs">No usable art yet? <a className="underline" href={registerHref}>Upload and register placement art</a> — the media library registers hero/ and marketing/ objects; a raw upload elsewhere is not selectable here.</p>}
    {contentType === 'PRODUCT' && <PublishedProductPicker
      actor={actor}
      multiple={!editing}
      selectedIds={editing ? [] : staged.map((row) => row.id)}
      selectedId={editing ? product?.id : undefined}
      onSelect={editing ? (value) => { setStaged(value ? [value] : []); setDirty(true); } : undefined}
      onToggle={(row, checked) => {
        setStaged((rows) => {
          if (!checked) return rows.filter((value) => value.id !== row.id);
          if (rows.some((value) => value.id === row.id)) return rows;
          if (currentSpec && rows.length >= remainingIn(currentSpec)) return rows;
          return [...rows, row];
        });
        setDirty(true);
      }}
      disabled={busy}
      disabledIds={entries.filter((row) => row.slotKey === currentSlot && row.id !== editing?.id && row.productId).map((row) => row.productId)}
      remaining={currentSpec ? remainingIn(currentSpec) : null}
    />}
    {configured
      ? <SaveBar>
        <button type="submit" className={buttonClass('primary')} disabled={busy || blocked || currentFull || (!dirty && !editing) || (!editing && contentType === 'MEDIA' && !asset) || (!editing && contentType === 'PRODUCT' && !staged.length)}>{busy ? 'Saving…' : contentType === 'PRODUCT' && !editing && staged.length > 1 ? `Add ${staged.length} products` : 'Save section entry'}</button>
        {access.write && <button type="button" className={buttonClass('primary')} disabled={busy || blocked || currentFull || (!dirty && !editing) || (!editing && contentType === 'PRODUCT' && !staged.length) || (!editing && contentType === 'MEDIA' && !asset)} onClick={() => submitEntry(true)}>Save &amp; publish</button>}
      </SaveBar>
      : <button type="button" className={button} disabled aria-describedby="local-draft-note">Configure the section to save</button>}
    <button type="button" className={button} disabled={busy} onClick={reset}>Cancel entry changes</button>
    <p role="status">{pendingWork ? 'Pending changes — not saved.' : 'No unsaved entry changes.'}</p>
  </form>;

  /* F-24: the section editor wears the shared AdminPanel chrome. Inside the
     control centre (`embedded`) the card border/background are removed and its
     header becomes a screen-reader label, because the page already supplies
     the section heading; the entries heading is then rendered in the approved
     position, after the toolbar. Every handler, guard and payload is unchanged. */
  const panelTitle = contentType === 'MEDIA' ? 'Media entries' : contentType === 'PRODUCT' ? 'Product entries' : 'Text entries';
  const panelChrome = embedded
    ? { className: 'pf-hcc-editor border-0 bg-transparent shadow-none', headerClassName: 'sr-only', bodyClassName: 'pf-hcc-editor-body px-0 py-0 sm:px-0' }
    : {};

  /* Each piece below is built once and placed per mode. Embedded (control
     centre) gets the approved composition and its `pf-hcc-*` classes; the
     standalone editor gets its original classes, markup and order. Handlers,
     guards, payloads and copy are identical in both modes. */
  const statusLine = <p role="status" className={embedded ? 'pf-hcc-publish-state' : undefined}>{configured ? `Backend controlled · ${section.state} · revision ${revision}` : 'Not configured · hidden on the storefront until configured and activated.'}</p>;
  const ineligibleLine = summary.ineligible.length > 0 && <p role="status" className={embedded ? 'pf-hcc-publish-eligibility' : undefined}>Not publicly eligible, so never activated here: {summary.ineligible.map((row) => `${row.slotKey} (${row.warning})`).join('; ')}.</p>;
  const publishBtn = <button type="button" className={embedded ? `${buttonClass('primary')} pf-hcc-publish-btn` : buttonClass('primary')} disabled={busy || blocked || blockers.length > 0 || nothingToPublish} onClick={() => publishSection()} aria-describedby="publish-reasons">{embedded && <Upload size={15} strokeWidth={1.9} aria-hidden="true" />}Publish section</button>;
  const publishReasons = <p id="publish-reasons" role="status">{blockers.length ? blockers.join(' ') : 'Publishing activates each saved entry, then the section, using the existing requests one after another. It stops at the first failure and never retries.'}</p>;
  const toolClass = (active) => (embedded ? `${button} pf-hcc-tool${active ? ' is-active' : ''}` : button);
  const toggleGroup = <div role="group" aria-label="Section view" className={embedded ? 'pf-hcc-toggle' : 'flex gap-2'}>
    <button type="button" aria-pressed={tab === 'edit'} className={toolClass(tab === 'edit')} onClick={() => setTab('edit')}>{embedded && <Pencil size={14} strokeWidth={1.8} aria-hidden="true" />}Edit</button>
    <button type="button" aria-pressed={tab === 'preview'} className={toolClass(tab === 'preview')} onClick={() => setTab('preview')}>{embedded && <Eye size={14} strokeWidth={1.8} aria-hidden="true" />}Preview</button>
  </div>;
  const reloadBtn = <button type="button" className={toolClass(false)} disabled={busy} onClick={reload}>{embedded && <RefreshCw size={14} strokeWidth={1.8} aria-hidden="true" />}Reload section and public content</button>;
  const configureBtn = !configured && access.write && <button type="button" className={toolClass(false)} disabled={busy || blocked} onClick={() => {
    if (window.confirm('Switch this section to backend control? The first save is inactive and keeps the section hidden on the storefront until you activate it.')) run('', 'put', { expectedRevision: 0, isActive: false }, { configuring: true });
  }}>Configure section (initially hidden)</button>;
  const activateBtn = configured && access.write && <button type="button" className={embedded ? `${button} pf-hcc-tool pf-hcc-tool--danger` : button} aria-describedby={activationReason ? 'activation-reason' : undefined} disabled={busy || pendingWork || blocked || Boolean(activationReason)} onClick={() => run('', 'put', { expectedRevision: revision, isActive: !section.isActive }, { configuring: true })}>{embedded && <Power size={14} strokeWidth={1.8} aria-hidden="true" />}{section.isActive ? 'Deactivate section' : 'Activate section'}</button>;
  const reasonLine = configured && access.write && activationReason && <p id="activation-reason" role="status" className={embedded ? 'pf-hcc-reason' : 'text-xs'}>{activationReason}</p>;
  const previewBody = (
    <PreviewErrorBoundary>
      <Suspense fallback={<p>Loading preview…</p>}>
        <PreviewRouter>
          <SectionPreview
            sectionKey={sectionKey}
            draft={draft}
            asset={asset}
            product={product}
            slot={slot || firstOpen || allowed[0]?.slotKey}
            contentType={contentType}
            section={section}
            editingId={editing?.id ?? null}
          />
        </PreviewRouter>
      </Suspense>
    </PreviewErrorBoundary>
  );

  return <AdminPanel title={panelTitle} eyebrow="Section content" {...panelChrome}>
    {!embedded && statusLine}
    {/* F-10: the publish pipeline, stated before the operator starts clicking. */}
    <div className={embedded ? 'pf-hcc-publish' : 'space-y-2 border border-pf-border bg-pf-card p-3 text-xs'} data-publish-summary>
      {embedded && <div className="pf-hcc-publish-summary">
        <span className="pf-hcc-publish-icon" aria-hidden="true"><Layers size={18} strokeWidth={1.6} /></span>
        <div className="min-w-0">
          {statusLine}
          <p className="pf-hcc-publish-line">{summary.text}</p>
          {ineligibleLine}
        </div>
      </div>}
      {!embedded && <p className="text-sm">{summary.text}</p>}
      <ol className={embedded ? 'pf-hcc-checklist' : 'space-y-1'}>
        {summary.checklist.map((step) => <li key={step.id} className={embedded ? (step.done ? 'is-done' : 'is-todo') : undefined}>
          {embedded && (step.done ? <Check size={12} strokeWidth={2.4} aria-hidden="true" /> : <Circle size={11} strokeWidth={2} aria-hidden="true" />)}
          <span>{step.done ? 'Done' : 'To do'} — {step.text}</span>
        </li>)}
      </ol>
      {!embedded && ineligibleLine}
      {configured && access.write && (embedded ? <div className="pf-hcc-publish-action">{publishBtn}{publishReasons}</div> : <>{publishBtn}{publishReasons}</>)}
    </div>
    {/* Batch 5 / F-07: this is a toggle, not a tab set. Selecting Preview only
       ADDS the preview; the list, the form and the reload control stay in view. */}
    {embedded ? <div className="pf-hcc-toolbar">{toggleGroup}{reloadBtn}{configureBtn}{activateBtn}</div> : toggleGroup}
    {embedded && reasonLine}
    {tab === 'preview' && (embedded ? <div className="pf-hcc-preview">{previewBody}</div> : previewBody)}
    {!embedded && reloadBtn}
    {message && <p role="status" className={embedded ? 'pf-hcc-message' : undefined}>{message}</p>}{error && <p role="alert" className={embedded ? 'pf-hcc-message pf-hcc-message--error' : undefined}>{error}</p>}
    {conflict && <div role="alert" className={embedded ? 'pf-hcc-alert' : 'space-y-2 border border-amber-300 bg-amber-50 p-3 text-sm'}>
      <p><strong>Someone else saved this section while you were editing.</strong> {conflict.message}</p>
      <p>Your draft is preserved exactly as typed. This edit was based on revision {conflict.revision}. No retry has been attempted and nothing was overwritten.</p>
      <p>Reconciling only re-reads the section. If you then save, every copy field in this form is written — including fields the other operator changed.</p>
      <div className={embedded ? 'pf-hcc-alert-actions' : 'flex flex-wrap gap-2'}>
        <button type="button" className={button} disabled={busy} onClick={reconcile}>Reload and reconcile (keep my draft)</button>
        <button type="button" className={button} disabled={busy} onClick={reload}>Discard my draft and reload</button>
      </div>
    </div>}
    {needsReload && !conflict && <div role="status" className={embedded ? 'pf-hcc-alert' : 'space-y-2'}>
      <p>The section could not be re-read, so writes are paused. Your draft is preserved; no automatic retry is performed.</p>
      <button type="button" className={button} disabled={busy} onClick={reconcile}>Reload and reconcile (keep my draft)</button>
    </div>}
    {!embedded && configureBtn}
    {!embedded && reasonLine}
    {!embedded && activateBtn}
    {!configured && canWrite && allowed.length > 0 && <p id="local-draft-note" role="status" className={embedded ? 'pf-hcc-reason' : undefined} data-local-draft>
      Draft only — this section is not configured yet, so nothing typed here is saved and no request is made. Use Preview to review it, then configure the section to save.
    </p>}
    {!allowed.length ? <p className={embedded ? 'pf-hcc-reason' : undefined}>No {contentType} slot is registered for this section.</p> : <>
      {embedded && <div className="pf-hcc-entries-head">
        <h3 className="pf-hcc-entries-title"><span aria-hidden="true" className="pf-hcc-entries-rule" />{panelTitle} <span className="pf-hcc-entries-count">({entries.length})</span></h3>
        {/* The only ordering mechanism that exists is the composed move up/down
            + one reorder request. No decorative sort or view switch is added. */}
        {pendingGroups.length > 0 && <span className="pf-hcc-order-note" role="status">Custom order — unsaved</span>}
      </div>}
      {configured && <ul className={embedded ? 'pf-hcc-entries' : 'space-y-2'}>{orderedEntries.map((row) => {
        const group = groupOf(row);
        const members = group ? rowsForGroup(group) : [];
        const index = members.findIndex((r) => r.id === row.id);
        const canReorder = Boolean(group) && members.length > 1;
        /* F-06: thumbnail + human slot label + real title + chip. The raw
           asset identifier only appears when there is no art to show. */
        const editLabel = embedded ? <>Edit<span className="sr-only"> entry</span></> : 'Edit entry';
        const toggleLabel = embedded
          ? <>{row.isActive ? 'Deactivate' : 'Activate'}<span className="sr-only"> entry</span></>
          : (row.isActive ? 'Deactivate entry' : 'Activate entry');
        const removeLabel = embedded ? <>Remove<span className="sr-only"> entry</span></> : 'Remove entry';
        const upLabel = embedded ? <>Move <span className="sr-only">entry </span>up</> : 'Move entry up';
        const downLabel = embedded ? <>Move <span className="sr-only">entry </span>down</> : 'Move entry down';
        const entryClass = (base, extra = '') => (embedded ? `${base} pf-hcc-entry-action${extra}` : base);
        const moveUpBtn = <button type="button" className={entryClass(button)} disabled={busy || blocked || index === 0} onClick={() => {
          const ids = members.map((r) => r.id); [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
          setOrders((old) => ({ ...old, [group]: ids }));
        }}>{upLabel}</button>;
        const moveDownBtn = <button type="button" className={entryClass(button)} disabled={busy || blocked || index === members.length - 1} onClick={() => {
          const ids = members.map((r) => r.id); [ids[index + 1], ids[index]] = [ids[index], ids[index + 1]];
          setOrders((old) => ({ ...old, [group]: ids }));
        }}>{downLabel}</button>;
        return <EntryRow
          key={row.id}
          variant={embedded ? 'card' : 'row'}
          expectArt={contentType === 'MEDIA'}
          thumbnail={isSafeMediaUrl(row.media?.url) ? resolveMediaUrl(row.media.url) : ''}
          thumbnailAlt={row.altText || ''}
          slotKey={row.slotKey}
          status={row.isActive ? 'Active' : 'Inactive'}
          title={row.title || row.product?.name || row.media?.title || (contentType === 'MEDIA' ? 'Untitled media entry' : 'Untitled entry')}
          warning={row.warning || ''}
          meta={[row.productId && !row.title ? row.productId : '', row.mediaAssetId && !row.media ? row.mediaAssetId : '']}
        >
          {canWrite && <>
            <button type="button" className={entryClass(button)} disabled={busy || pendingWork || blocked} onClick={() => { setEditing(row); setSlot(row.slotKey); setDraft(Object.fromEntries(fields.map((k) => [k, row[k] || '']))); setAsset(null); setStaged([]); }}>{embedded && <Pencil size={13} strokeWidth={1.8} aria-hidden="true" />}{editLabel}</button>
            <button type="button" className={entryClass(button)} disabled={busy || pendingWork || blocked} onClick={() => run(`/items/${encodeURIComponent(row.id)}`, 'patch', { expectedRevision: revision, isActive: !row.isActive })}>{embedded && <Power size={13} strokeWidth={1.8} aria-hidden="true" />}{toggleLabel}</button>
          </>}
          {access.write && (contentType !== 'MEDIA' || access.mediaDelete) && <button type="button" className={entryClass(buttonClass('destructive'), ' pf-hcc-entry-action--danger')} disabled={busy || pendingWork || blocked} onClick={() => { if (window.confirm('Remove only this homepage entry? Its product/media object is not deleted.')) run(`/items/${encodeURIComponent(row.id)}?expectedRevision=${revision}`, 'delete', undefined, { deleting: true }); }}>{embedded && <Trash2 size={13} strokeWidth={1.8} aria-hidden="true" />}{removeLabel}</button>}
          {/* F-16: arrows compose a local order; ONE request is sent on commit. */}
          {canWrite && canReorder && (embedded ? <div className="pf-hcc-entry-reorder">{moveUpBtn}{moveDownBtn}</div> : <>{moveUpBtn}{moveDownBtn}</>)}
        </EntryRow>;
      })}</ul>}
      {configured && canWrite && pendingGroups.map((group) => {
        /* A reconcile can remove rows another operator deleted. The composed
           order is kept (never silently dropped) but saving it would violate
           exact membership, so the commit is blocked and Cancel stays available. */
        const members = rowsForGroup(group);
        const stale = members.length !== (orders[group] ?? []).length || members.length < 2;
        return <div key={group} className={embedded ? 'pf-hcc-order-bar' : 'flex flex-wrap items-center gap-2 text-xs'} role="status">
          <span>Order changed locally{pendingGroups.length > 1 ? ` in ${group}` : ''} — nothing has been sent yet.</span>
          {stale && <span>The saved rows changed since this order was composed; cancel it and reorder the remaining rows.</span>}
          <button type="button" className={button} disabled={busy || blocked || stale} onClick={async () => {
            const ids = orders[group];
            const others = { ...orders }; delete others[group];
            const result = await run('/reorder', 'put', { expectedRevision: revision, slotKey: group, contentType, itemIds: ids }, { note: `Order saved for ${members.length} entries.` });
            /* `run` reloads the section and clears the form; restore every other
               group's pending order so one commit cannot discard another. */
            if (result.ok) setOrders(others);
          }}>Save order</button>
          <button type="button" className={button} disabled={busy} onClick={() => setOrders((old) => { const next = { ...old }; delete next[group]; return next; })}>Cancel order changes</button>
        </div>;
      })}
      {configured && canWrite && (allFull ? <p role="status" className={embedded ? 'pf-hcc-reason' : undefined}>All {contentType} slots are filled ({entries.length} saved). Edit or remove an entry above to make room — no further {contentType} entry can be saved here.</p> : draftForm)}
      {!configured && draftForm}
    </>}
  </AdminPanel>;
}
