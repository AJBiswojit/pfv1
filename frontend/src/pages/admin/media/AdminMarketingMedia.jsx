import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import AdminPage from '../../../components/admin/AdminPage';
import AdminPanel from '../../../components/admin/AdminPanel';
import BackendHomeHeroPanel from '../../../components/admin/BackendHomeHeroPanel';
import SectionContentEditor from '../../../components/admin/homepage/SectionContentEditor';
import { staffHomepageAccess } from '../../../services/api/homepageApi';
import PublishedProductPicker from '../../../components/admin/homepage/PublishedProductPicker';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import { useEmployeeAuth } from '../../../context/EmployeeAuthContext';
import { hasAdminPermission } from '../../../config/adminAccess';
import { HOMEPAGE_SECTIONS, homepageAccess } from '../../../services/homepage/homepageContentModel';

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
  const [legacy, setLegacy] = useState(false);
  const section = HOMEPAGE_SECTIONS.find((item) => item.id === sectionId);
  const loading = employeeWorkspace ? employeeAuth.isLoading : adminAuth.isLoading;
  if (loading) return <p role="status">Verifying homepage content access…</p>;
  if (!access.overview && !staff.view) return <AdminPage title="Homepage content access denied" description="The existing media.view permission and an active staff session are required." />;
  return <AdminPage eyebrow="Marketing media / Editorial operations" title="Homepage Content Control Center"
    description="Twelve fixed homepage sections. Registered media, published product placements and editorial text are saved through workspace-scoped backend contracts."
    actions={access.view ? <div className="flex flex-wrap gap-2">
      <Link to={`${prefix}/media`} className="border border-mist p-2 text-xs">Registered media library</Link>
      {access.create && <Link to={`${prefix}/media/upload`} className="border border-mist p-2 text-xs">Register media</Link>}
      {hasAdminPermission(actor.admin, 'catalogue.view') && <Link to={`${prefix}/products`} className="border border-mist p-2 text-xs">Product lifecycle workspace</Link>}
    </div> : null}>
    <div className="mb-6 border border-mist bg-canvas p-4 text-sm">
      <strong>Production homepage selection is unchanged.</strong> Hero retains its marketing owner. Configured non-hero sections use the additive /home content contract; missing sections retain existing content. Inactive or empty configurations never restore fallback.
      <p className="mt-2">Product creation stays in the existing draft workspace; this control center never invents identity, price, approval or publication.</p>
    </div>
    {access.employeeOnly && !staff.view && <p role="status" className="mb-6 border border-amber-200 bg-amber-50 p-4 text-sm">Your media permission allows this overview and published-product inspection. The current registered-media and marketing APIs require an admin session and reject employee tokens. The new homepage routes additionally require explicit marketing grants; no admin credentials are reused here.</p>}
    <div className="grid gap-6 lg:grid-cols-[230px_minmax(0,1fr)]">
      <nav aria-label="Homepage sections" className="space-y-1 self-start border border-mist bg-surface p-2 lg:sticky lg:top-4">
        {HOMEPAGE_SECTIONS.map((item, index) => <button key={item.id} type="button" disabled={pending} aria-current={item.id === sectionId ? 'true' : undefined}
          onClick={() => { setSectionId(item.id); setType('MEDIA'); setLegacy(false); }}
          className={`block w-full border-l-2 px-3 py-3 text-left disabled:opacity-50 ${item.id === sectionId ? 'border-accent bg-canvas-deep' : 'border-transparent'}`}>
          <span className="mr-2 font-mono text-[10px] text-taupe">{String(index + 1).padStart(2, '0')}</span>
          <span className="text-sm">{item.title}</span>
          <span className="mt-1 block pl-6 text-[10px] uppercase tracking-wider text-taupe">{item.live ? 'Live /home integration' : 'Section content'}</span>
        </button>)}
      </nav>
      <div className="min-w-0 space-y-5">
        <header className="border-b border-mist pb-4">
          <h2 className="font-display text-3xl">{section.title}</h2>
          <p className="mt-2 text-xs text-taupe">{section.id === 'hero' ? 'Existing HOME_HERO marketing owner.' : 'Fixed typed slots; authoring requires marketing.view/manage and any media grants.'}</p>
          <p role="status" className="mt-2 text-xs">{pending ? 'Pending changes — save or cancel before switching sections.' : 'No pending changes in this section.'}</p>
        </header>
        <div role="group" aria-label="Content type" className="flex gap-2">
          {['MEDIA', 'PRODUCT', 'TEXT'].map((kind) => <button key={kind} type="button" aria-pressed={type === kind} disabled={pending}
            onClick={() => setType(kind)} className={`border px-4 py-2 text-xs tracking-widest disabled:opacity-40 ${type === kind ? 'border-ink bg-ink text-ivory' : 'border-mist'}`}>{kind}</button>)}
        </div>
        {section.id === 'newsletter' && <p>No verified subscription endpoint is connected. Newsletter editing is content-only; subscription remains unavailable.</p>}
        {section.id !== 'hero' && section.placement && access.view && <button type="button" disabled={pending} onClick={() => setLegacy((v) => !v)} className="border border-mist p-2 text-xs">{legacy ? 'Return to live section content' : 'Show legacy marketing preparation (not live section content)'}</button>}
        {legacy && section.placement && access.view ? <BackendHomeHeroPanel key={`legacy-${section.id}`} placement={section.placement} contentType={type === 'PRODUCT' ? 'TEXT' : type} onDirtyChange={setPending} /> :
          section.id !== 'hero' && staff.view ? <SectionContentEditor key={`${section.id}-${type}`} actor={actor} sectionKey={section.id} contentType={type} onDirtyChange={setPending} /> :
          type === 'PRODUCT' ? section.product ? <PublishedProductPicker key={section.id} actor={actor} /> : <AdminPanel title="No product slot"><p>This section does not accept product placements.</p></AdminPanel> :
          section.id === 'hero' && (access.view || staff.mediaView) ? <BackendHomeHeroPanel actor={actor} placement="HOME_HERO" contentType={type} onDirtyChange={setPending} /> :
          <AdminPanel title={`${type} control unavailable`}><p>Explicit marketing.view/manage and any operation-specific media permissions are required. No unauthorized request is sent.</p></AdminPanel>}

      </div>
    </div>
  </AdminPage>;
}
