import { ArrowLeftRight, BadgeCheck, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Project } from '../data/projects';

export function ProjectCard({ project, onCompare, isCompared = false }: { project: Project; onCompare?: (project: Project) => void; isCompared?: boolean }) {
  const demoUrl = (() => {
    try {
      const url = new URL(project.demoUrl);
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
    } catch {
      return null;
    }
  })();

  return (
    <article className="card overflow-hidden transition hover:-translate-y-1 hover:shadow-xl">
      <div className="relative">
        <img src={project.image} alt={project.title} className="h-52 w-full object-cover" />
        {(project.codeMarketAssured || project.badge) && (
          <span className={`absolute left-4 top-4 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-white ${project.codeMarketAssured ? 'bg-sky-600' : 'bg-brand-600'}`}>
            {project.codeMarketAssured && <BadgeCheck size={13} />}
            {project.codeMarketAssured ? 'CodeMarket Assured' : project.badge}
          </span>
        )}
      </div>

      <div className="space-y-4 p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
            {project.category}
          </span>
          <div className="flex items-center gap-1 text-sm text-amber-500">
            <Star size={14} fill="currentColor" />
            <span className="font-medium text-slate-700">{project.rating}</span>
            <span className="text-slate-500">({project.reviews})</span>
          </div>
        </div>

        <div>
          <h3 className="text-xl font-semibold text-slate-900">{project.title}</h3>
          <p className="mt-2 text-sm text-slate-600">{project.shortDescription}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {project.technologies.map((tech) => (
            <span key={tech} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-600">
              {tech}
            </span>
          ))}
        </div>

        <div className="flex items-end justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-slate-900">₹{project.price}</span>
              {project.originalPrice && (
                <span className="text-sm text-slate-400 line-through">₹{project.originalPrice}</span>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500">by {project.seller}</p>
          </div>
          <Link to={`/projects/${project.id}`} className="btn-primary text-xs">
            Details
          </Link>
        </div>

        <div className="flex gap-3">
          {demoUrl ? (
            <a href={demoUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary flex-1 text-xs">Launch Live Demo</a>
          ) : (
            <span className="btn-secondary flex-1 cursor-not-allowed text-xs text-slate-400">Demo unavailable</span>
          )}
          <Link to={`/projects/${project.id}`} state={{ openCheckout: true }} className="btn-primary flex-1 text-xs">Buy Now</Link>
        </div>
        {onCompare && <button type="button" onClick={() => onCompare(project)} className={`inline-flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition ${isCompared ? 'border-sky-200 bg-sky-50 text-sky-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}><ArrowLeftRight size={13} />{isCompared ? 'Remove from compare' : 'Add to compare'}</button>}
      </div>
    </article>
  );
}
