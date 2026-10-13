import { Link, useParams } from 'react-router-dom';
import { infoPages } from '../data/index.js';
import NotFound from './NotFound.jsx';

export default function Info() {
  const { slug } = useParams();
  const page = infoPages[slug];
  if (!page) return <NotFound />;
  return (
    <article className="info container">
      <nav className="crumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><span>/</span><span>{page.title}</span></nav>
      <p className="label">{page.kicker}</p>
      <h1 className="display info__title">{page.title}</h1>
      <p className="info__lead">{page.lead}</p>
      {page.body.map((b) => <p key={b}>{b}</p>)}
      <div className="info__links">
        {Object.entries(infoPages).filter(([k]) => k !== slug).slice(0, 4).map(([k, p]) => <Link key={k} to={`/pages/${k}`}>{p.title}</Link>)}
      </div>
    </article>
  );
}
