import { Component } from "react";
import { AtelierButton, ErrorState } from "../../design-system";

/**
 * Keeps the employee header/sidebar mounted when a desk throws.
 * Without this, a post-paint crash (null performance rows, etc.) whitescreens
 * the whole /employee tree — the flash-then-blank the Super Employee saw.
 */
export default class EmployeeDeskErrorBoundary extends Component {
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
        <ErrorState
          eyebrow="This desk"
          title="This view could not be opened"
          description="The rest of the employee portal is still available. Open another page from the sidebar, or try this desk again."
          actions={
            <AtelierButton size="chip" onClick={() => this.setState({ hasError: false })}>
              Try again
            </AtelierButton>
          }
        />
      );
    }
    return this.props.children;
  }
}
