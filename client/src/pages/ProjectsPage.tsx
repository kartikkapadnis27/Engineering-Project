import { BadgeCheck, Search, ShieldCheck, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ProjectCard } from '../components/ProjectCard';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { PageHero } from '../components/PageHero';
import { API_BASE_URL, SERVER_BASE_URL } from '../lib/api';
import type { Project } from '../data/projects';

const categoryOptions = ['Web Dev', 'AI/ML', 'Data Science'];

function formatCurrency(value: number) {
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function categoryMatches(category: string, filter: string) {
  const normalized = category.toLowerCase();
  if (filter === 'Web Dev') return normalized.includes('web');
  if (filter === 'AI/ML') return normalized.includes('ai') || normalized.includes('machine learning');
  return normalized.includes('data science');
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [under5000, setUnder5000] = useState(false);
  const [assuredOnly, setAssuredOnly] = useState(false);
  const [minimumIntegrity, setMinimumIntegrity] = useState(0);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [sort, setSort] = useState('newest');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const loadProjects = async () => {
      try {
        setError('');
        const response = await fetch(`${API_BASE_URL}/projects`, { signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message ?? 'Unable to fetch projects.');

        const normalizedProjects: Project[] = (result.data ?? []).map((item: Record<string, unknown>) => ({
          id: String(item.id ?? ''),
          title: String(item.title ?? ''),
          category: String(item.category ?? 'Uncategorized'),
          shortDescription: String(item.shortDescription ?? ''),
          description: String(item.description ?? ''),
          price: Number(item.price ?? 0),
          rating: Number(item.rating ?? 0),
          reviews: Number(item.reviews ?? 0),
          technologies: Array.isArray(item.technologies) ? item.technologies.filter((tech): tech is string => typeof tech === 'string') : [],
          seller: String(item.seller ?? 'Verified seller'),
          demoUrl: String(item.demoUrl ?? ''),
          badge: undefined,
          codeMarketAssured: item.codeMarketAssured === true,
          integrityScore: Number(item.integrityScore ?? 0),
          image: item.thumbnail ? (String(item.thumbnail).startsWith('http') ? String(item.thumbnail) : `${SERVER_BASE_URL}${item.thumbnail}`) : '',
        }));
        setProjects(normalizedProjects);
      } catch (loadError) {
        if (loadError instanceof Error && loadError.name !== 'AbortError') {
          setError(loadError.message);
          setProjects([]);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void loadProjects();
    return () => controller.abort();
  }, []);

  const visibleProjects = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = projects.filter((project) => {
      const matchesSearch = !query || project.title.toLowerCase().includes(query) ||
        project.technologies.some((technology) => technology.toLowerCase().includes(query));
      const matchesCategory = categories.length === 0 || categories.some((category) => categoryMatches(project.category, category));
      return matchesSearch && matchesCategory && (!under5000 || project.price <= 5000) &&
        (!assuredOnly || project.codeMarketAssured) &&
        (minimumIntegrity === 0 || (project.integrityScore ?? 0) >= minimumIntegrity);
    });

    if (sort === 'price-low') return filtered.sort((a, b) => a.price - b.price);
    if (sort === 'price-high') return filtered.sort((a, b) => b.price - a.price);
    return filtered;
  }, [assuredOnly, categories, minimumIntegrity, projects, search, sort, under5000]);

  const comparedProjects = compareIds.map((id) => projects.find((project) => String(project.id) === id)).filter((project): project is Project => Boolean(project));
  const toggleCompare = (project: Project) => {
    const id = String(project.id);
    if (compareIds.includes(id)) {
      setCompareIds(compareIds.filter((item) => item !== id));
    } else if (compareIds.length === 3) {
      setError('Compare up to three projects at a time.');
    } else {
      setError('');
      setCompareIds([...compareIds, id]);
    }
  };

  const toggleCategory = (category: string) => {
    setCategories((selected) => selected.includes(category)
      ? selected.filter((item) => item !== category)
      : [...selected, category]);
  };

  return (
    <>
      <Header />
      <PageHero eyebrow="Marketplace" title="Browse software projects" subtitle="Find vetted software projects across web, AI, data science and more." />

      <main className="container py-10">
        <div className="mb-8 flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 lg:flex-row lg:items-center lg:justify-between">
          <label className="flex w-full max-w-xl items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-slate-600">
            <Search size={18} />
            <span className="sr-only">Search by title or technology</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search project titles or technology…" className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400" />
          </label>
          <div className="flex items-center gap-2 text-sm text-slate-500"><SlidersHorizontal size={16} /> Live filters</div>
        </div>

        <div className="grid gap-8 lg:grid-cols-[250px_1fr]">
          <aside className="h-fit rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="mb-5 text-lg font-bold text-slate-900">Filters</h2>
            <fieldset>
              <legend className="mb-3 text-sm font-semibold text-slate-700">Category</legend>
              <div className="space-y-3">
                {categoryOptions.map((category) => (
                  <label key={category} className="flex cursor-pointer items-center gap-3 text-sm text-slate-600">
                    <input type="checkbox" checked={categories.includes(category)} onChange={() => toggleCategory(category)} className="h-4 w-4 rounded border-slate-300 accent-blue-600" />
                    {category}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="mt-6 border-t border-slate-200 pt-5">
              <legend className="mb-3 text-sm font-semibold text-slate-700">Price</legend>
              <label className="flex cursor-pointer items-center gap-3 text-sm text-slate-600">
                <input type="checkbox" checked={under5000} onChange={(event) => setUnder5000(event.target.checked)} className="h-4 w-4 rounded border-slate-300 accent-blue-600" />
                Up to ₹5000
              </label>
            </fieldset>
            <fieldset className="mt-6 border-t border-slate-200 pt-5">
              <legend className="mb-3 text-sm font-semibold text-slate-700">Trust signals</legend>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={assuredOnly} onChange={(event) => setAssuredOnly(event.target.checked)} className="h-4 w-4 accent-sky-600" /><BadgeCheck size={15} className="text-sky-600" /> Assured projects</label>
              <label className="mt-4 block text-sm text-slate-600">Minimum integrity score
                <select value={minimumIntegrity} onChange={(event) => setMinimumIntegrity(Number(event.target.value))} className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                  <option value={0}>Any score</option><option value={70}>70% and above</option><option value={80}>80% and above</option><option value={90}>90% and above</option>
                </select>
              </label>
            </fieldset>
            {(categories.length > 0 || under5000 || assuredOnly || minimumIntegrity > 0 || search) && (
              <button type="button" onClick={() => { setCategories([]); setUnder5000(false); setAssuredOnly(false); setMinimumIntegrity(0); setSearch(''); }} className="mt-6 text-sm font-semibold text-blue-700 hover:text-blue-800">Clear filters</button>
            )}
          </aside>

          <section aria-label="Marketplace projects">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <p aria-live="polite" className="text-sm text-slate-600">{loading ? 'Loading projects…' : `${visibleProjects.length} ${visibleProjects.length === 1 ? 'project' : 'projects'}`}</p>
              {compareIds.length > 0 && <button type="button" onClick={() => setCompareOpen(true)} className="rounded-lg bg-slate-950 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800">Compare selected ({compareIds.length}/3)</button>}
              <label className="flex items-center gap-2 text-sm text-slate-600">Sort
                <select value={sort} onChange={(event) => setSort(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-700">
                  <option value="newest">Newest</option>
                  <option value="price-low">Price low to high</option>
                  <option value="price-high">Price high to low</option>
                </select>
              </label>
            </div>

            {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">{error}</div>}
            {!loading && !error && visibleProjects.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-600">No approved projects match your filters right now.</div>
            ) : (
              <div className="grid gap-6 xl:grid-cols-2">
                {visibleProjects.map((project) => <ProjectCard key={project.id} project={project} onCompare={toggleCompare} isCompared={compareIds.includes(String(project.id))} />)}
              </div>
            )}
          </section>
        </div>
      </main>
      {compareOpen && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/60 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Project comparison">
        <section className="my-5 w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl">
          <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h2 className="text-lg font-bold text-slate-900">Compare projects</h2><p className="mt-1 text-xs text-slate-500">Review pricing, stack, seller ratings and marketplace assurance side by side.</p></div><button type="button" onClick={() => setCompareOpen(false)} aria-label="Close comparison" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={18} /></button></header>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] border-collapse text-left text-sm">
              <thead><tr><th className="w-36 border-b border-r border-slate-100 bg-slate-50 p-4 text-xs font-semibold text-slate-500">Project</th>{comparedProjects.map((project) => <th key={project.id} className="border-b border-slate-100 p-4 align-top"><div className="flex items-start justify-between gap-3"><span><span className="block font-bold text-slate-900">{project.title}</span><span className="mt-1 block text-xs font-normal text-slate-500">{project.category}</span></span><button type="button" onClick={() => toggleCompare(project)} aria-label={`Remove ${project.title} from comparison`} className="text-slate-400 hover:text-rose-600"><X size={15} /></button></div></th>)}</tr></thead>
              <tbody>
                {[
                  ['Retail price', (project: Project) => <strong className="text-base text-slate-900">{formatCurrency(project.price)}</strong>],
                  ['Developer rating', (project: Project) => <span>{project.rating.toFixed(1)} / 5 <span className="text-xs text-slate-400">({project.reviews})</span></span>],
                  ['Integrity score', (project: Project) => <span className="inline-flex items-center gap-1.5">{(project.integrityScore ?? 0) > 0 ? `${project.integrityScore}%` : 'Review in progress'}{(project.integrityScore ?? 0) >= 90 && <ShieldCheck size={14} className="text-emerald-600" />}</span>],
                  ['Assurance', (project: Project) => project.codeMarketAssured ? <span className="inline-flex items-center gap-1 font-semibold text-sky-700"><BadgeCheck size={14} /> CodeMarket Assured</span> : 'Standard listing'],
                  ['Developer', (project: Project) => project.seller],
                  ['Technology stack', (project: Project) => <div className="flex flex-wrap gap-1.5">{project.technologies.map((technology) => <span key={technology} className="rounded-md bg-slate-100 px-2 py-1 text-[11px]">{technology}</span>)}</div>],
                ].map(([label, render]) => <tr key={label as string} className="border-b border-slate-100 last:border-0"><th className="border-r border-slate-100 bg-slate-50/70 p-4 text-xs font-semibold text-slate-600">{label as string}</th>{comparedProjects.map((project) => <td key={project.id} className="p-4 text-sm text-slate-700">{(render as (project: Project) => ReactNode)(project)}</td>)}</tr>)}
              </tbody>
            </table>
          </div>
        </section>
      </div>}
      <Footer />
    </>
  );
}
