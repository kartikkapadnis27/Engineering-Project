import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL, getAuthHeaders, SERVER_BASE_URL } from '../lib/api';
import { SellerProjectConversations } from '../components/SellerProjectConversations';
import { SellerProjectUpdates } from '../components/SellerProjectUpdates';

type SellerProject = {
  id: string;
  title: string;
  category: string;
  price: number;
  status: string;
  reviewNote: string | null;
  sales: number;
  thumbnail: string;
  uploadedAt: string;
};

type DashboardData = {
  sellerProfile: { whatsappNumber: string; developerUpiQrUrl: string };
  stats: {
    totalProjects: number;
    totalSales: number;
    earnings: number;
    averageRating: number;
    loyaltyTier: { name: string; commissionRate: number };
  };
  projects: SellerProject[];
};

const initialForm = {
  title: '',
  category: 'Web Development',
  description: '',
  frontend: 'React',
  backend: 'Node.js',
  database: 'SQLite',
  version: '1.0.0',
  price: '1499',
  demoUrl: '',
};

const steps = ['Project details', 'Technology & pricing', 'Media & source files'];

function statusStyles(status: string) {
  if (status === 'APPROVED') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'REJECTED') return 'border-rose-200 bg-rose-50 text-rose-700';
  return 'border-amber-200 bg-amber-50 text-amber-700';
}

export default function SellProjectPage() {
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [projectZip, setProjectZip] = useState<File | null>(null);
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [demoVideo, setDemoVideo] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [step, setStep] = useState(0);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [payoutProfile, setPayoutProfile] = useState({ whatsappNumber: '', developerUpiQrUrl: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [loadingDashboard, setLoadingDashboard] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadDashboard = useCallback(async () => {
    if (!token) return;
    setLoadingDashboard(true);
    try {
      const response = await fetch(`${API_BASE_URL}/projects/mine`, { headers: getAuthHeaders() });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? 'Unable to load seller dashboard.');
      setDashboard(result.data as DashboardData);
      setPayoutProfile(result.data.sellerProfile ?? { whatsappNumber: '', developerUpiQrUrl: '' });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load seller dashboard.');
    } finally {
      setLoadingDashboard(false);
    }
  }, [token]);

  useEffect(() => {
    if (!user || user.role !== 'SELLER') {
      navigate('/login', { replace: true });
      return;
    }
    void loadDashboard();
  }, [loadDashboard, navigate, user]);

  if (!user || user.role !== 'SELLER') return null;

  const updateForm = (field: keyof typeof form, value: string) => {
    setForm((previous) => ({ ...previous, [field]: value }));
  };

  const handleNext = () => {
    setError('');
    if (step === 0 && (form.title.trim().length < 3 || form.description.trim().length < 20)) {
      setError('Add a project title and a description with at least 20 characters.');
      return;
    }
    if (step === 1 && (!Number.isFinite(Number(form.price)) || Number(form.price) < 1)) {
      setError('Enter a valid price greater than ₹0.');
      return;
    }
    setStep((current) => Math.min(current + 1, steps.length - 1));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!token || !projectZip || !thumbnail || !demoVideo) {
      setError('A ZIP source archive, thumbnail image, and demo video are all required.');
      return;
    }
    if (!/\.zip$/i.test(projectZip.name)) {
      setError('The main project source must be a .zip archive.');
      setProjectZip(null);
      return;
    }
    if (!Number.isFinite(Number(form.price)) || Number(form.price) < 1) {
      setError('Enter a valid price greater than ₹0.');
      return;
    }

    setLoading(true);
    const payload = new FormData();
    Object.entries(form).forEach(([key, value]) => payload.append(key, value));
    payload.append('projectZip', projectZip);
    payload.append('thumbnail', thumbnail);
    payload.append('demoVideo', demoVideo);

    try {
      const response = await fetch(`${API_BASE_URL}/projects/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: payload,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? 'Project upload failed.');

      setSuccess('Project submitted successfully and is awaiting review.');
      setForm(initialForm);
      setProjectZip(null);
      setThumbnail(null);
      setDemoVideo(null);
      setStep(0);
      setFileInputKey((key) => key + 1);
      await loadDashboard();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not submit project.');
    } finally {
      setLoading(false);
    }
  };

  const savePayoutProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    setSavingProfile(true);
    try {
      const response = await fetch(`${API_BASE_URL}/projects/seller-profile`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify(payoutProfile),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? 'Unable to save your payout details.');
      setPayoutProfile({
        whatsappNumber: result.data.whatsappNumber ?? '',
        developerUpiQrUrl: result.data.developerUpiQrUrl ?? '',
      });
      setSuccess('Your contact and payout QR details were saved securely.');
    } catch (profileError) {
      setError(profileError instanceof Error ? profileError.message : 'Unable to save your payout details.');
    } finally {
      setSavingProfile(false);
    }
  };

  const stats = [
    { label: 'Total Projects', value: dashboard?.stats.totalProjects ?? 0 },
    { label: 'Total Sales', value: dashboard?.stats.totalSales ?? 0 },
    { label: 'Earnings in ₹', value: `₹${(dashboard?.stats.earnings ?? 0).toLocaleString('en-IN')}` },
    { label: 'Loyalty tier', value: dashboard?.stats.loyaltyTier.name ?? '—' },
  ];

  return (
    <div className="min-h-screen bg-slate-100 lg:flex">
      <aside className="flex w-full flex-col bg-slate-900 text-white lg:min-h-screen lg:w-72">
        <Link to="/seller/dashboard" className="border-b border-white/10 px-7 py-6">
          <span className="text-xl font-bold tracking-tight">CodeMarket</span>
          <span className="mt-1 block text-xs uppercase tracking-[0.2em] text-blue-300">Seller workspace</span>
        </Link>
        <nav className="flex gap-2 overflow-x-auto p-4 lg:flex-col">
          <a href="#overview" className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold">Overview</a>
          <a href="#upload" className="rounded-lg px-4 py-3 text-sm text-slate-300 transition hover:bg-white/10 hover:text-white">Add a project</a>
          <a href="#my-projects" className="rounded-lg px-4 py-3 text-sm text-slate-300 transition hover:bg-white/10 hover:text-white">My projects</a>
          <Link to="/projects" className="rounded-lg px-4 py-3 text-sm text-slate-300 transition hover:bg-white/10 hover:text-white">Browse marketplace</Link>
        </nav>
        <div className="mt-auto hidden border-t border-white/10 p-6 text-sm text-slate-300 lg:block">
          Signed in as <span className="mt-1 block truncate font-medium text-white">{user.email}</span>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-8 sm:px-7 lg:px-10">
        <div id="overview" className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">Seller dashboard</p>
            <h1 className="mt-1 text-3xl font-bold text-slate-900">Seller dashboard</h1>
            <p className="mt-2 text-slate-600">Manage your software listings, sales and earnings.</p>
          </div>
          <Link to="/" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Visit CodeMarket</Link>
        </div>

        {error && <div role="alert" className="mb-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
        {success && <div role="status" className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>}

        <section aria-label="Seller stats" className="mb-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-lg border border-slate-200 bg-white p-5">
              <p className="text-sm font-medium text-slate-500">{stat.label}</p>
              <p className="mt-3 text-3xl font-bold text-slate-900">{loadingDashboard ? '—' : stat.value}</p>
              {stat.label === 'Loyalty tier' && dashboard && <p className="mt-2 text-xs leading-5 text-slate-500">{dashboard.stats.loyaltyTier.commissionRate}% indicative tier target · based on {dashboard.stats.totalSales} sales and {dashboard.stats.averageRating.toFixed(1)} average rating. Existing owner-agreed payout amounts remain controlling.</p>}
            </div>
          ))}
        </section>

        <section className="mb-10 rounded-lg border border-slate-200 bg-white p-5 sm:p-7">
          <div className="mb-5"><h2 className="text-xl font-bold text-slate-900">Contact &amp; payout details</h2><p className="mt-1 text-sm text-slate-500">The owner uses these verified details to contact you and arrange payouts after escrow maturity.</p></div>
          <form onSubmit={savePayoutProfile} className="grid gap-4 md:grid-cols-[1fr_1.5fr_auto] md:items-end">
            <label className="text-sm font-semibold text-slate-700">WhatsApp number
              <input type="tel" value={payoutProfile.whatsappNumber} onChange={(event) => setPayoutProfile((profile) => ({ ...profile, whatsappNumber: event.target.value }))} maxLength={30} placeholder="+91 98765 43210" className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100" />
            </label>
            <label className="text-sm font-semibold text-slate-700">Developer UPI QR image URL
              <input type="url" value={payoutProfile.developerUpiQrUrl} onChange={(event) => setPayoutProfile((profile) => ({ ...profile, developerUpiQrUrl: event.target.value }))} placeholder="https://your-secure-image-host/upi-qr.png" className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100" />
            </label>
            <button type="submit" disabled={savingProfile} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">{savingProfile ? 'Saving…' : 'Save payout details'}</button>
            {payoutProfile.developerUpiQrUrl && <img src={payoutProfile.developerUpiQrUrl} alt="Developer payout UPI QR preview" className="h-28 w-28 rounded-lg border border-slate-200 bg-slate-50 object-contain p-2 md:col-start-2" />}
          </form>
        </section>

        <section id="upload" className="mb-10 rounded-lg border border-slate-200 bg-white p-5 sm:p-7">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Add a project</h2>
              <p className="mt-1 text-sm text-slate-500">Complete each step to submit your project for vetting.</p>
            </div>
            <span className="rounded-lg bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800">Step {step + 1} of {steps.length}</span>
          </div>

          <ol className="mb-7 grid gap-2 sm:grid-cols-3">
            {steps.map((label, index) => (
              <li key={label} className={`rounded-lg border px-3 py-3 text-sm font-medium ${index === step ? 'border-blue-600 bg-blue-50 text-blue-800' : index < step ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
                <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs">{index + 1}</span>{label}
              </li>
            ))}
          </ol>

          <form onSubmit={handleSubmit}>
            {step === 0 && (
              <div className="grid gap-5 md:grid-cols-2">
                <label className="text-sm font-semibold text-slate-700">Project title
                  <input value={form.title} onChange={(event) => updateForm('title', event.target.value)} minLength={3} maxLength={150} required className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-blue-600" placeholder="Inventory Management System" />
                </label>
                <label className="text-sm font-semibold text-slate-700">Category
                  <select value={form.category} onChange={(event) => updateForm('category', event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal">
                    <option>Web Development</option><option>AI &amp; Machine Learning</option><option>Data Science</option><option>Mobile</option><option>Business</option><option>Fintech</option>
                  </select>
                </label>
                <label className="text-sm font-semibold text-slate-700 md:col-span-2">Project description
                  <textarea value={form.description} onChange={(event) => updateForm('description', event.target.value)} minLength={20} maxLength={5000} required className="mt-2 min-h-36 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-blue-600" placeholder="Describe the product, important features and who it is for." />
                </label>
              </div>
            )}

            {step === 1 && (
              <div className="grid gap-5 md:grid-cols-2">
                <label className="text-sm font-semibold text-slate-700">Frontend technology
                  <input value={form.frontend} onChange={(event) => updateForm('frontend', event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" />
                </label>
                <label className="text-sm font-semibold text-slate-700">Backend technology
                  <input value={form.backend} onChange={(event) => updateForm('backend', event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" />
                </label>
                <label className="text-sm font-semibold text-slate-700">Database
                  <input value={form.database} onChange={(event) => updateForm('database', event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" />
                </label>
                <label className="text-sm font-semibold text-slate-700">Version
                  <input value={form.version} onChange={(event) => updateForm('version', event.target.value)} required className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" />
                </label>
                <label className="text-sm font-semibold text-slate-700">Price (₹)
                  <input type="number" min="1" step="1" value={form.price} onChange={(event) => updateForm('price', event.target.value)} required className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" />
                </label>
                <label className="text-sm font-semibold text-slate-700">Live demo URL (optional)
                  <input type="url" value={form.demoUrl} onChange={(event) => updateForm('demoUrl', event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" placeholder="https://your-demo.example" />
                </label>
              </div>
            )}

            {step === 2 && (
              <div className="grid gap-5 md:grid-cols-3">
                <label className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm font-semibold text-slate-800">Thumbnail image <span className="text-rose-600">*</span>
                  <input key={`thumbnail-${fileInputKey}`} type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" required className="mt-3 block w-full text-sm font-normal text-slate-600" onChange={(event) => setThumbnail(event.target.files?.[0] ?? null)} />
                  <span className="mt-2 block text-xs font-normal text-slate-500">{thumbnail?.name ?? 'PNG, JPEG or WebP · required'}</span>
                </label>
                <label className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm font-semibold text-slate-800">Demo video showcase <span className="text-rose-600">*</span>
                  <input key={`video-${fileInputKey}`} type="file" accept=".mp4,.webm,.mov,video/mp4,video/webm,video/quicktime" required className="mt-3 block w-full text-sm font-normal text-slate-600" onChange={(event) => setDemoVideo(event.target.files?.[0] ?? null)} />
                  <span className="mt-2 block text-xs font-normal text-slate-500">{demoVideo?.name ?? 'MP4, WebM or MOV · required'}</span>
                </label>
                <label className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm font-semibold text-slate-800">Product source archive <span className="text-rose-600">*</span>
                  <input key={`zip-${fileInputKey}`} type="file" accept=".zip,application/zip" required className="mt-3 block w-full text-sm font-normal text-slate-600" onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    if (file && !/\.zip$/i.test(file.name)) {
                      setProjectZip(null);
                      setError('The main product source must be a secure .zip archive.');
                      event.target.value = '';
                      return;
                    }
                    setProjectZip(file);
                    setError('');
                  }} />
                  <span className="mt-2 block text-xs font-normal text-slate-500">{projectZip?.name ?? 'ZIP archive only · required'}</span>
                </label>
                <p className="text-sm text-slate-500 md:col-span-3">Every submission is reviewed before it appears in the marketplace. Source archives are stored privately; showcase media is served separately.</p>
              </div>
            )}

            <div className="mt-7 flex flex-wrap justify-between gap-3 border-t border-slate-200 pt-5">
              <button type="button" onClick={() => { setError(''); setStep((current) => Math.max(0, current - 1)); }} disabled={step === 0 || loading} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-40">Back</button>
              {step < steps.length - 1 ? (
                <button type="button" onClick={handleNext} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">Continue</button>
              ) : (
                <button type="submit" disabled={loading || !projectZip || !thumbnail || !demoVideo} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{loading ? 'Submitting…' : 'Submit for review'}</button>
              )}
            </div>
          </form>
        </section>

        <section id="my-projects" className="rounded-lg border border-slate-200 bg-white p-5 sm:p-7">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div><h2 className="text-xl font-bold text-slate-900">My projects</h2><p className="mt-1 text-sm text-slate-500">Review status and feedback for your submissions.</p></div>
            <button type="button" onClick={() => void loadDashboard()} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Refresh</button>
          </div>
          {loadingDashboard ? <p className="py-8 text-center text-sm text-slate-500">Loading your projects…</p> : !dashboard?.projects.length ? (
            <p className="rounded-lg bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">Your submitted projects will appear here.</p>
          ) : (
            <div className="divide-y divide-slate-200">
              {dashboard.projects.map((project) => (
                <div key={project.id} className="py-5">
                  <article className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    <img src={project.thumbnail ? (project.thumbnail.startsWith('http') ? project.thumbnail : `${SERVER_BASE_URL}${project.thumbnail}`) : ''} alt="" className="h-16 w-24 rounded-lg border border-slate-200 bg-slate-100 object-cover" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-slate-900">{project.title}</h3>
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyles(project.status)}`}>
                          {project.status === 'APPROVED' ? 'Approved' : project.status === 'REJECTED' ? 'Rejected' : 'Pending'}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">{project.category} · ₹{project.price.toLocaleString('en-IN')} · {project.sales} sales</p>
                      {project.reviewNote && <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800"><span className="font-semibold">Admin feedback:</span> {project.reviewNote}</p>}
                    </div>
                    <p className="text-xs text-slate-400">{new Date(project.uploadedAt).toLocaleDateString()}</p>
                  </article>
                  {project.status === 'APPROVED' && <>
                    <SellerProjectUpdates projectId={project.id} />
                    <SellerProjectConversations projectId={project.id} />
                  </>}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
