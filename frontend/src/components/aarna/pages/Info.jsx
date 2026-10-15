import { Link } from '../router/index.jsx';
import { useLocation } from 'react-router-dom';
import { getRouteMeta } from '../../../config/navigationConfig.js';
import NotFound from './NotFound.jsx';

/* The information routes this page serves. */
const INFO_PATHS = ['/about', '/contact', '/privacy', '/terms'];

/* The honest note this application has always put where a page's own text will
   arrive — the production shell's sentence, without the internal word for the
   work that will fill it. No policy text is written here, and none is invented. */
const CONTENT_NOTE =
  'This page is part of the PRATIKSHYA FASHION shell. The full text arrives as the business publishes it — the navigation, layout and routing around it are in place.';

export default function Info() {
  const { pathname } = useLocation();
  const meta = getRouteMeta(pathname);
  /* No manifest entry means this application serves no information page at this
     path, and the design's own 404 answers it — exactly as the design did. */
  if (!meta) return <NotFound />;
  const title = meta.label;
  return (
    <article className="info container">
      <nav className="crumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><span>/</span><span>{title}</span></nav>
      <p className="label">{meta.eyebrow}</p>
      <h1 className="display info__title">{title}</h1>
      <p className="info__lead">{meta.description}</p>
      <p>{CONTENT_NOTE}</p>
      <div className="info__links">
        {INFO_PATHS.filter((path) => path !== pathname).map((path) => (
          <Link key={path} to={path}>{getRouteMeta(path)?.label ?? path}</Link>
        ))}
      </div>
    </article>
  );
}
