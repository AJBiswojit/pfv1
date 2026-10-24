/* F-06 + F-07 (Batch 3): one entry card for both editors.
 *
 * Before this the section editor printed `slotKey · <uuid> · Active`: an
 * untitled media entry was a 36-character identifier and the artwork was
 * invisible. The card now carries a thumbnail the read payload already
 * provides (`row.media.url`), a human slot label, a real title (or an explicit
 * "Untitled …" fallback) and a status chip.
 *
 * `variant="cover"` keeps the hero editor's wide artwork; `variant="row"`
 * (default) is the 56×56 list thumbnail used by the standalone section editor;
 * `variant="card"` is the four-column editorial media card used by the control
 * centre. All three render the same live data and the same child actions.
 *
 * Presentation only — no request, no state, no transport.
 */

const humanSlot = (slotKey) => String(slotKey ?? '')
  .split('-')
  .filter(Boolean)
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  .join(' ');

export default function EntryRow({
  variant = 'row',
  expectArt = false,
  thumbnail = '',
  thumbnailAlt = '',
  title = '',
  untitled = 'Untitled entry',
  slotKey = '',
  status = '',
  meta = [],
  notice = '',
  warning = '',
  children = null,
}) {
  const chip = status
    ? `inline-flex items-center border px-2 py-0.5 text-[10px] uppercase tracking-[.12em] ${status === 'Active' ? 'border-pf-gold-deep text-pf-burgundy' : 'border-pf-border-strong text-pf-muted'}`
    : '';
  const cover = variant === 'cover';
  const card = variant === 'card';
  /* F-19: an asset can disappear after the entry was saved (a hero row keeps
     its stored object key). A plate that 404s is removed instead of painting the
     browser's broken-image glyph over the card; nothing is substituted and the
     row's own title/meta stay readable. Written directly, like the storefront's
     own `hideBrokenMedia`, so this primitive still holds no state. */
  const hideBrokenPlate = (event) => { const plate = event?.currentTarget; if (plate?.style) plate.style.display = 'none'; };
  const artClass = cover ? 'mb-3 h-32 w-full object-cover' : card ? 'pf-hcc-entry-img' : 'h-14 w-14 shrink-0 object-cover';
  const art = thumbnail
    ? <img src={thumbnail} alt={thumbnailAlt} loading="lazy" onError={hideBrokenPlate} className={artClass} />
    : null;
  /* A TEXT row has no artwork at all, so it gets no empty plate; only a MEDIA
     row that is missing its art (or the hero, which always expects art) does. */
  const placeholder = thumbnail ? null : cover
    /* Review fix: only say art is missing when the caller says so. The hero's
       TEXT tab passes no notice because the row does have a safe URL, it simply
       is not rendered in that view. */
    ? (notice ? <p className="mb-2 text-xs text-amber-900">{notice}</p> : null)
    : card && expectArt
      ? <span aria-hidden="true" className="pf-hcc-entry-noart">No art</span>
      : expectArt
        ? <span aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center border border-dashed border-pf-border-strong text-[9px] uppercase tracking-[.1em] text-pf-muted">No art</span>
        : null;

  const heading = <div className="flex min-w-0 flex-wrap items-center gap-2">
    {slotKey && <span className="text-[10px] uppercase tracking-[.12em] text-pf-muted">{humanSlot(slotKey)}</span>}
    {status && <span className={chip}>{status}</span>}
  </div>;
  const body = <div className="min-w-0 flex-1">
    {heading}
    <p className={cover ? 'font-display text-lg' : 'break-words font-display text-base'}>{title || untitled}</p>
    {meta.filter(Boolean).map((line, index) => <p key={`${index}-${line}`} className="break-all text-xs text-pf-muted">{line}</p>)}
    {!thumbnail && !cover && notice ? <p className="text-xs text-amber-900">{notice}</p> : null}
  </div>;

  /* The control-centre card: one consistent image ratio, the real slot label
     and status over the plate, then title and a bottom-aligned action row. */
  if (card) return <li className="pf-hcc-entry min-w-0 border border-pf-border bg-pf-card">
    <div className="pf-hcc-entry-art">
      {art}
      {placeholder}
      {slotKey && <span className="pf-hcc-entry-tag">{humanSlot(slotKey)}</span>}
      {status && <span className={`pf-hcc-entry-status ${status === 'Active' ? 'is-active' : 'is-inactive'}`}>{status}</span>}
    </div>
    <div className="pf-hcc-entry-info">
      <p className="pf-hcc-entry-title" title={title || untitled}>{title || untitled}</p>
      {meta.filter(Boolean).map((line, index) => <p key={`${index}-${line}`} className="pf-hcc-entry-meta">{line}</p>)}
      {warning && <p role="status" className="pf-hcc-entry-warning">Not publicly eligible: {warning}</p>}
    </div>
    {children && <div className="pf-hcc-entry-actions">{children}</div>}
  </li>;

  return <li className="min-w-0 border border-pf-border-strong bg-pf-card p-3">
    {cover ? <>{art}{placeholder}{body}</> : <div className="flex min-w-0 items-start gap-3">{art}{placeholder}{body}</div>}
    {warning && <p role="status" className="mt-2 text-xs">Not publicly eligible: {warning}</p>}
    {children && <div className="mt-3 flex flex-wrap gap-2">{children}</div>}
  </li>;
}

export { humanSlot };
