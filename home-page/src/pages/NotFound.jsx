import Button from '../components/ui/Button.jsx';
export default function NotFound() {
  return (
    <div className="info container empty">
      <p className="label">404</p>
      <h1 className="display info__title">This page has slipped <em>off the loom.</em></h1>
      <Button to="/">Return home</Button>
    </div>
  );
}
