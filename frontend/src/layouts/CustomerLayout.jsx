import AarnaStorefront from "../components/aarna/AarnaStorefront";

/** Customer routes are rendered exclusively by Aarna's own shell and route table. */
export default function CustomerLayout() {
  return (
    <div className="min-h-screen flex flex-col pf-shell__surface selection:bg-accent selection:text-white">
      <AarnaStorefront />
    </div>
  );
}
