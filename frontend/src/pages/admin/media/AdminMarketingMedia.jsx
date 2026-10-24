import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Boxes, Home, ImagePlus, Images, Package, Type } from 'lucide-react';
import AdminPage from '../../../components/admin/AdminPage';
import AdminPanel from '../../../components/admin/AdminPanel';
import BackendHomeHeroPanel from '../../../components/admin/BackendHomeHeroPanel';
import SectionContentEditor from '../../../components/admin/homepage/SectionContentEditor';
import { homepageRequest, staffHomepageAccess } from '../../../services/api/homepageApi';
import PublishedProductPicker from '../../../components/admin/homepage/PublishedProductPicker';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import { useEmployeeAuth } from '../../../context/EmployeeAuthContext';
import { hasAdminPermission } from '../../../config/adminAccess';
import { HOMEPAGE_SECTIONS, homepageAccess, isSafeMediaUrl, sectionListStatusLabel, sectionStatusLabel } from '../../../services/homepage/homepageContentModel';
import { resolveMediaUrl } from '../../../services/media/mediaPaths';
import { loadHomepagePlacement } from '../../../services/homepage/homepageContentService';
import './homepageControlCenter.css';

/* Approved local editorial art, already shipped with the storefront. The band
   is decorative (aria-hidden) and always sits behind a solid-to-clear ivory
   veil so the masthead copy keeps its contrast. No new asset or dependency. */
const HEADER_MEDIA = '/design/hero-festive.webp';
const TYPE_ICONS = { MEDIA: Images, PRODUCT: Package, TEXT: Type };

/* Presentation only: a short badge token summarises the SAME status string the
   navigator already derives from persisted backend reads. It never asserts a
   state the backend did not report. */
function badgeFor(line, ready) {
  if (!ready) return { text: 'Checking', tone: 'muted' };
  if (/0 active|inactive/i.test(line)) return { text: 'Inactive', tone: 'warning' };
  if (/\bactive\b/i.test(line)) return { text: 'Active', tone: 'success' };
  if (/hidden|no saved|no entries/i.test(line)) return { text: 'Hidden', tone: 'muted' };
  if (/unavailable|retry|requires|expired|error/i.test(line)) return { text: 'Unavailable', tone: 'muted' };
  return { text: line, tone: 'muted' };
}

/** One section/type workspace. No legacy browser-local assignment editor is
 * mounted here. A photo cannot create a product; products/new remains the
 * existing backend draft → review → approval → publish workspace.
 */
export default function AdminMarketingMedia() {
  const adminAuth = useAdminAuth();
  const employeeAuth = useEmployeeAuth();
  const { pathname } = useLocation();
  const employeeWorkspace = pathname.startsWith('/employee');
  const actor = useMemo(() => ({ admin: employeeWorkspace ? null : adminAuth.admin,
    employee: employeeWorkspace ? employeeAuth.employee : null }), [employeeWorkspace, adminAuth.admin, employeeAuth.employee]);
  const access = homepageAccess(actor);
  const staff = staffHomepageAccess(actor);
  const prefix = employeeWorkspace ? '/employee' : adminAuth.isSuperAdmin ? '/super-admin' : '/admin';
  const [sectionId, setSectionId] = useState('hero');
  const [type, setType] = useState('MEDIA');
  const [pending, setPending] = useState(false);
  const [statusTick, setStatusTick] = useState(0);
  const [statuses, setStatuses] = useState({ state: 'idle', sections: {}, hero: null, sectionsStatus: null });
  const section = HOMEPAGE_SECTIONS.find((item) => item.id === sectionId);
  const loading = employeeWorkspace ? employeeAuth.isLoading : adminAuth.isLoading;
  /* Nav statuses are read from persisted backend state — the non-hero list
     contract plus the existing HOME_HERO placement read — never from a static
     per-section flag (F-21 removed the last one). Each helper fails closed without
     HTTP when its capability is missing, so no unauthorized request is sent.
     Statuses refresh after any editor save via onSaved → statusTick. */
  useEffect(() => {
    if (loading || (!access.overview && !staff.view)) return undefined;
    let cancelled = false;
    setStatuses({ state: 'loading', sections: {}, hero: null, sectionsStatus: null });
    (async () => {
      const next = { sections: staff.view ? null : {}, hero: null, sectionsStatus: null };
      if (staff.view) {
        const list = await homepageRequest(actor, '/sections', 'get');
        if (cancelled) return;
        next.sections = list.ok ? Object.fromEntries((list.sections ?? []).map((s) => [s.key, s])) : null;
        /* F-05: keep the HTTP status so a refusal (403) is not displayed as an
           outage, and an outage (5xx/offline) is not displayed as a refusal. */
        next.sectionsStatus = list.ok ? null : (list.status ?? 0);
      }
      next.hero = await loadHomepagePlacement(actor.employee ? actor : actor.admin, 'HOME_HERO');
      if (!cancelled) setStatuses({ state: 'ready', ...next });
    })();
    return () => { cancelled = true; };
  }, [actor, access.overview, staff.view, loading, statusTick]);
  const refreshStatuses = () => setStatusTick((v) => v + 1);
  /* F-23 (Batch 2): the section list already carries `allowedSlots` for
     configured AND unconfigured sections, so type availability is known before
     any write. A tab with no registered slot is disabled and labelled `· none`
     instead of letting the operator configure a section to discover it. When
     the list has not loaded (or failed) nothing is disabled — a status we do
     not know is not a reason to block the UI. */
  const slotsFor = (id) => (statuses.state === 'ready' ? statuses.sections?.[id]?.allowedSlots : null);
  const kindsFor = (id) => {
    const slots = slotsFor(id);
    if (!slots) return ['MEDIA', 'PRODUCT', 'TEXT'];
    return ['MEDIA', 'PRODUCT', 'TEXT'].filter((kind) => slots.some((spec) => spec.contentType === kind));
  };
  const typeCount = (kind) => {
    const slots = slotsFor(sectionId);
    return slots ? slots.filter((spec) => spec.contentType === kind).length : null;
  };
  const typeLabel = (kind) => (typeCount(kind) === 0 ? `${kind} · none` : kind);
  /* Live entry count for the tab badge, read from the SAME section list that
     seeds the editor. `null` means the list has not loaded (or was refused), so
     no number is claimed. Rendered through CSS `attr()` so the button's own
     accessible name stays the plain kind the existing controls use. */
  const entryCount = (kind) => {
    if (sectionId === 'hero') return null;
    const rows = statuses.sections?.[sectionId]?.items;
    return Array.isArray(rows) ? rows.filter((row) => row.contentType === kind).length : null;
  };
  const navLabel = (item) => {
    if (item.id === 'hero') {
      if (statuses.state !== 'ready') return statuses.state === 'loading' ? 'Checking status…' : 'Live when activated';
      const hero = statuses.hero;
      if (!hero || !hero.ok) return hero?.status === 403 ? 'Requires media access' : sectionListStatusLabel(hero?.status ?? 0);
      const rows = hero.items ?? [];
      if (!rows.length) return 'No saved entries';
      return `${rows.length} saved · ${rows.filter((r) => r.isActive).length} active`;
    }
    if (!staff.view) return 'Requires marketing.view';
    if (statuses.state !== 'ready') return 'Checking status…';
    if (!statuses.sections) return sectionListStatusLabel(statuses.sectionsStatus);
    return sectionStatusLabel(statuses.sections[item.id]);
  };
  /* The rail thumbnail is the section's OWN saved artwork (the /sections list
     already projects `media.url`; HOME_HERO rows carry `url`). Nothing is
     invented: a section with no saved art gets a neutral numbered plate. */
  const thumbnailFor = (item) => {
    const hero = item.id === 'hero';
    const rows = hero ? (statuses.hero?.items ?? []) : (statuses.sections?.[item.id]?.items ?? []);
    const found = rows.find((row) => isSafeMediaUrl(hero ? row.url : row.media?.url));
    return found ? resolveMediaUrl(hero ? found.url : found.media.url) : '';
  };
  const hideBrokenThumb = (event) => { if (event?.currentTarget?.style) event.currentTarget.style.display = 'none'; };
  const currentIndex = HOMEPAGE_SECTIONS.findIndex((item) => item.id === sectionId);
  const currentStatusLine = navLabel(section);
  const currentBadge = badgeFor(currentStatusLine, statuses.state === 'ready');

  if (loading) return <p role="status">Verifying homepage content access…</p>;
  if (!access.overview && !staff.view) return <AdminPage title="Homepage content access denied" description="The existing media.view permission and an active staff session are required." />;
  return <AdminPage className="pf-hcc"
    eyebrow={<><Home size={13} aria-hidden="true" className="pf-hcc-crumb-home" /> Marketing Media <span className="pf-hcc-crumb-sep">/</span> Editorial Operations</>}
    title="Homepage Content Control Center"
    description="Manage homepage sections, registered media, product placements and editorial content. All content is saved through workspace-scoped backend contracts."
    headerMedia={HEADER_MEDIA}
    actions={access.view ? <div className="pf-hcc-header-actions">
      <Link to={`${prefix}/media`} className="pf-hcc-header-action"><Images size={15} aria-hidden="true" />Registered media library</Link>
      {/* F-03 (Batch 2): homepage art is registered in the media library's
         placement panel, not the product uploader. The hash opens and focuses
         that panel directly. */}
      {access.create && <Link to={`${prefix}/media#placement-art`} className="pf-hcc-header-action"><ImagePlus size={15} aria-hidden="true" />Register placement art</Link>}
      {hasAdminPermission(actor.admin, 'catalogue.view') && <Link to={`${prefix}/products`} className="pf-hcc-header-action"><Package size={15} aria-hidden="true" />Product lifecycle workspace</Link>}
    </div> : null}>
    {access.employeeOnly && !staff.view && <p role="status" className="pf-hcc-note pf-hcc-note--warn">Your media permission allows this overview and published-product inspection. The current registered-media and marketing APIs require an admin session and reject employee tokens. The new homepage routes additionally require explicit marketing grants; no admin credentials are reused here.</p>}
    <div className="pf-hcc-layout">
      {/* F-17 (Batch 4): below `lg` the twelve-row rail stacks ~670 px of
         navigation above the workspace. It is a single horizontally
         scrollable topbar of section chips beneath the page header. Every
         chip keeps its number, title and status, the buttons stay in DOM order,
         and no control is removed. */}
      <nav aria-label="Homepage sections" className="pf-hcc-rail flex min-w-0 snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain border border-pf-border bg-pf-card p-2">
        <span className="sr-only">{HOMEPAGE_SECTIONS.length} sections</span>
        {HOMEPAGE_SECTIONS.map((item, index) => {
            const number = String(index + 1).padStart(2, '0');
            const label = navLabel(item);
            const thumb = thumbnailFor(item);
            return <button key={item.id} type="button" disabled={pending} aria-current={item.id === sectionId ? 'true' : undefined}
              onClick={() => {
                const open = kindsFor(item.id);
                setSectionId(item.id);
                setType(open.includes(type) && open.length ? type : (open[0] || 'MEDIA'));
              }}
              className={`pf-hcc-section-btn shrink-0 snap-start px-3 py-2 text-left disabled:opacity-50 ${item.id === sectionId ? 'is-selected' : ''}`}>
              <span className="pf-hcc-section-num">{number}</span>
              <span className="pf-hcc-section-thumb" aria-hidden="true">
                {thumb ? <img src={thumb} alt="" loading="lazy" onError={hideBrokenThumb} /> : <span className="pf-hcc-section-thumb-mark" />}
              </span>
              <span className="pf-hcc-section-name">{item.title}</span>
              <span className="pf-hcc-section-status" data-tone={label === 'Active' ? 'active' : /inactive|hidden|no saved/i.test(label) ? 'idle' : 'muted'}>{label}</span>
            </button>;
          })}
      </nav>
      <div className="pf-hcc-workspace min-w-0">
        <section className="pf-hcc-panel pf-card" aria-label={`${section.title} workspace`}>
          <header className="pf-hcc-section-head">
            <span className="pf-hcc-section-index" aria-hidden="true">{String(currentIndex + 1).padStart(2, '0')}</span>
            <div className="pf-hcc-section-heading">
              <div className="pf-hcc-section-titleline">
                <h2 className="pf-hcc-section-title">{section.title}</h2>
                <span className={`pf-hcc-badge pf-hcc-badge--${currentBadge.tone}`}>{currentBadge.text}</span>
              </div>
              <p className="pf-hcc-section-desc">{section.id === 'hero' ? 'Existing HOME_HERO marketing owner.' : 'Fixed typed slots; authoring requires marketing.view/manage and any media grants.'}</p>
              <p role="status" className="pf-hcc-pending">{pending ? 'Pending changes — save or cancel before switching sections.' : 'No pending changes in this section.'}</p>
            </div>
          </header>
          {/* F-22 (Batch 3): one caveat per section, stated once and ABOVE the
             fields it constrains. The editor used to repeat both sentences under
             its own form, where they arrived after the operator had typed. */}
          {section.id === 'newsletter' && <p className="pf-hcc-caveat" role="note">Content only. No verified subscription endpoint is connected, so no sign-up is simulated and no addresses are collected.</p>}
          {section.id === 'promotion' && <p className="pf-hcc-caveat" role="note">Editorial banner only. This editor cannot create/apply discounts, codes or expiry dates.</p>}
          <div role="group" aria-label="Content type" className="pf-hcc-tabs">
            {['MEDIA', 'PRODUCT', 'TEXT'].map((kind) => {
              const Icon = TYPE_ICONS[kind];
              const empty = typeCount(kind) === 0;
              const count = entryCount(kind);
              return <button key={kind} type="button" aria-pressed={type === kind} disabled={pending || empty}
                aria-describedby={empty ? 'type-none-note' : undefined}
                data-count={count === null || empty ? undefined : `(${count})`}
                onClick={() => setType(kind)}
                className={`pf-hcc-tab ${type === kind ? 'is-active' : ''}`}>
                <Icon size={15} aria-hidden="true" /><span className="pf-hcc-tab-label">{typeLabel(kind)}</span>
              </button>;
            })}
          </div>
          {['MEDIA', 'PRODUCT', 'TEXT'].some((kind) => typeCount(kind) === 0) && <p id="type-none-note" role="status" className="pf-hcc-tab-note">A tab labelled <strong>· none</strong> has no registered slot in this section, so nothing can be saved there — no configuration write is needed to find that out.</p>}
          <div className="pf-hcc-editor-slot">
            {/* B-06 — the "legacy marketing preparation" workflow for the six
               non-hero placements (SAREE_SECTION, BRIDAL_SECTION, JEWELLERY_SECTION,
               PROMOTION, GROOM_SECTION, KIDS_SECTION) saved rows the storefront
               never reads; its toggle is HIDDEN (default-deny UI change only —
               the endpoint, rows and schema are untouched, and the HOME_HERO
               placement panel below stays available). */}
            {section.id !== 'hero' && staff.view ? <SectionContentEditor embedded key={`${section.id}-${type}`} actor={actor} sectionKey={section.id} contentType={type} onDirtyChange={setPending} onSaved={refreshStatuses} registerHref={`${prefix}/media#placement-art`} seed={statuses.sections?.[section.id] ?? null} /> :
              type === 'PRODUCT' ? section.product ? <PublishedProductPicker key={section.id} actor={actor} /> : <AdminPanel title="No product slot"><p>This section does not accept product placements.</p></AdminPanel> :
              section.id === 'hero' && (access.view || staff.mediaView) ? <BackendHomeHeroPanel actor={actor} placement="HOME_HERO" contentType={type} onDirtyChange={setPending} onSaved={refreshStatuses} /> :
              <AdminPanel title={`${type} control unavailable`}><p>Explicit marketing.view/manage and any operation-specific media permissions are required. No unauthorized request is sent.</p></AdminPanel>}
          </div>
        </section>
      </div>
    </div>
    {/* Retained verbatim from the shipped page. It is a persistent operational
       note, so it sits below the workspace instead of pushing the approved
       section/media composition below the fold. No text or meaning is lost. */}
    <div className="pf-hcc-note pf-hcc-note--footer" role="note">
      <Boxes size={16} aria-hidden="true" />
      <p><strong>Production homepage selection is unchanged.</strong> Hero retains its marketing owner. Configured non-hero sections use the additive /home content contract; unconfigured or inactive sections are hidden on the storefront. Configure and activate a section to render it. Product creation stays in the existing draft workspace; this control center never invents identity, price, approval or publication.</p>
    </div>
  </AdminPage>;
}
