import { Component } from "react";

/**
 * Admin / Super Admin desk error boundary (Phase 2, P0-1).
 *
 * Mirrors the established EmployeeDeskErrorBoundary pattern: a render
 * failure in one desk must never white-screen the whole portal — the
 * masthead and sidebar stay mounted, and the operator gets a calm,
 * controlled fallback with a safe recovery action. Keyed by pathname in
 * AdminLayout so navigating away always remounts cleanly.
 */
export default class StaffDeskErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <section
          role="alert"
          className="rounded-xl border border-pf-border bg-pf-card px-6 py-16 text-center shadow-[0_10px_40px_rgb(74_7_24/0.07)]"
        >
          <p className="font-ui text-[11px] font-semibold uppercase tracking-[0.24em] text-pf-gold-text">
            This desk
          </p>
          <h1 className="mt-3 font-display text-[32px] font-medium leading-tight text-pf-text">
            This view could not be opened
          </h1>
          <p className="mx-auto mt-3 max-w-md font-ui text-sm leading-relaxed text-pf-muted">
            The rest of the portal is still available. Open another page from the
            sidebar, or try this desk again.
          </p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false })}
            className="mt-6 min-h-11 rounded-lg bg-pf-burgundy px-6 py-2.5 font-ui text-[12px] font-semibold uppercase tracking-[0.14em] text-pf-ivory transition-colors hover:bg-pf-wine"
          >
            Try again
          </button>
        </section>
      );
    }
    return this.props.children;
  }
}
