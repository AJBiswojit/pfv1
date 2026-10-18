export default function FutureNote({ title, children }) {
  return (
    <aside className="border border-dashed border-pf-border bg-pf-card/70 px-4 py-3">
      <p className="font-ui text-[10px] uppercase tracking-[.2em] text-pf-gold-text">{title}</p>
      <p className="mt-1.5 font-ui text-[12px] leading-relaxed text-pf-muted">{children}</p>
    </aside>
  );
}
