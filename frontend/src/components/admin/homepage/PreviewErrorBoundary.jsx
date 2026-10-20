import { Component } from 'react';

export default class PreviewErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error) { /* log once */ console.warn('SectionPreview error', error); }
  render() {
    if (this.state.hasError) return <p role="alert">Preview unavailable.</p>;
    return this.props.children;
  }
}
