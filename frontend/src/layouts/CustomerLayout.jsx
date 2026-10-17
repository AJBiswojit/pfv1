import CustomerStorefront from "../components/customer/CustomerStorefront";

/** Customer routes are rendered exclusively by the storefront's own shell and route table. */
export default function CustomerLayout() {
  return (
    <div className="min-h-screen flex flex-col pf-shell__surface selection:bg-accent selection:text-white">
      <CustomerStorefront />
    </div>
  );
}
