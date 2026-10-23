import { Activity, ArrowUpRight, Banknote, Check, CheckCircle2, ChevronRight, CircleAlert, Clock3, Code2, ExternalLink, Eye, Fingerprint, Globe2, LayoutDashboard, LoaderCircle, LockKeyhole, LogOut, QrCode, Save, Search, Settings2, Shield, ShieldCheck, Users, Wallet, X } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { OwnerOperationsPanel } from '../components/OwnerOperationsPanel';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL, getAuthHeaders } from '../lib/api';

const OwnerActivityChart = lazy(() => import('../components/OwnerActivityChart'));
const OwnerSystemGlobe = lazy(() => import('../components/OwnerSystemGlobe'));

type Tab = 'overview' | 'projects' | 'payments' | 'accounts' | 'versions' | 'institutions' | 'settings';
type ProjectStatus = 'Pending' | 'Approved' | 'Negotiation';
type ProjectRow = {
  id: string;
  title: string;
  category: string;
  projectStatus: ProjectStatus;
  status: string;
  integrityScore: number;
  developerAgreedPrice: number | null;
  studentRetailPrice: number;
  codeMarketAssured: boolean;
  description: string;
  uploadedAt: string;
  seller: string;
  sellerEmail: string;
  whatsappNumber: string | null;
  developerUpiQrUrl: string | null;
  analysis: {
    archiveFileCount: number;
    sourceFileCount: number;
    linesOfCode: number;
    dependencyCount: number;
    languages: string[];
    reviewFlags: string[];
    duplicateSourceCount: number;
    suggestedPrice: number;
  } | null;
};
type PaymentRow = {
  id: string;
  amount: number;
  utrNumber: string | null;
  screenshotAvailable: boolean;
  paymentVerificationState: string;
  escrowLockStatus: string;
  verifiedAt: string | null;
  escrowReleaseAt: string | null;
  createdAt: string;
  buyer: { id: string; name: string; email: string };
  project: {
    id: string;
    title: string;
    seller: { name: string; email: string };
    developerUpiQrUrl: string | null;
  } | null;
};
type AccountRow = { id: string; name: string; email: string; role: string; status: string; createdAt: string };
type PayoutRow = {
  id: string;
  amount: number;
  seller: { name: string; email: string };
  developerUpiQrUrl: string | null;
  projectTitle: string;
  paymentId: string | null;
  status: string;
  createdAt: string;
};
type Overview = {
  stats: {
    pendingProjects: number;
    approvedProjects: number;
    negotiationProjects: number;
    pendingPayments: number;
    sellers: number;
    buyers: number;
    grossProcessed: number;
  };
  dailyActivity: { date: string; label: string; volume: number }[];
  settings: { ownerUpiQrUrl: string | null; ownerUpiId: string | null };
};
type PricingEdit = { agreed: string; retail: string; integrity: string; status: ProjectStatus; assured: boolean };

const navigation: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'projects', label: 'Project pipeline', icon: Code2 },
  { id: 'payments', label: 'Payments & escrow', icon: Wallet },
  { id: 'accounts', label: 'Accounts', icon: Users },
  { id: 'versions', label: 'Version review', icon: Clock3 },
  { id: 'institutions', label: 'College licenses', icon: Globe2 },
  { id: 'settings', label: 'Platform settings', icon: Settings2 },
];

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = getAuthHeaders();
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });
  const result = await response.json() as { ok: boolean; data: T; message?: string };
  if (!response.ok || !result.ok) {
    throw new Error(result.message ?? `Request failed (${response.status}).`);
  }
  return result.data;
}

function formatCurrency(value: number) {
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function StatusPill({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'blue' | 'amber' | 'green' | 'red' }) {
  const tones = {
    slate: 'border-slate-200 bg-slate-50 text-slate-600',
    blue: 'border-sky-200 bg-sky-50 text-sky-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    red: 'border-rose-200 bg-rose-50 text-rose-700',
  };
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${tones[tone]}`}>{children}</span>;
}

export default function OwnerDashboardPage() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [transferReferences, setTransferReferences] = useState<Record<string, string>>({});
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [pricing, setPricing] = useState<Record<string, PricingEdit>>({});
  const [settings, setSettings] = useState({ ownerUpiQrUrl: '', ownerUpiId: '' });
  const [query, setQuery] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadOverview = useCallback(async () => {
    const data = await request<Overview>('/admin/overview');
    setOverview(data);
    setSettings({
      ownerUpiQrUrl: data.settings.ownerUpiQrUrl ?? '',
      ownerUpiId: data.settings.ownerUpiId ?? '',
    });
  }, []);

  const loadProjects = useCallback(async () => {
    const data = await request<ProjectRow[]>('/admin/projects');
    setProjects(data);
    setPricing(Object.fromEntries(data.map((project) => [project.id, {
      agreed: String(project.developerAgreedPrice ?? project.studentRetailPrice),
      retail: String(project.studentRetailPrice),
      integrity: String(project.integrityScore),
      status: project.projectStatus,
      assured: project.codeMarketAssured,
    }])));
  }, []);

  const loadPayments = useCallback(async () => {
    const [nextPayments, nextPayouts] = await Promise.all([
      request<PaymentRow[]>('/admin/payments'),
      request<PayoutRow[]>('/admin/payouts'),
    ]);
    setPayments(nextPayments);
    setPayouts(nextPayouts);
  }, []);
  const loadAccounts = useCallback(async () => setAccounts(await request<AccountRow[]>('/admin/users')), []);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      await loadOverview();
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load the owner dashboard.');
    } finally {
      setLoading(false);
    }
  }, [loadOverview]);

  useEffect(() => { void loadDashboard(); }, [loadDashboard]);

  useEffect(() => {
    let cancelled = false;
    const loadTab = async () => {
      try {
        if (tab === 'projects') await loadProjects();
        if (tab === 'payments') await loadPayments();
        if (tab === 'accounts') await loadAccounts();
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Unable to load this workspace section.');
      }
    };
    void loadTab();
    return () => { cancelled = true; };
  }, [tab, loadAccounts, loadPayments, loadProjects]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const stats = overview?.stats;
  const filteredProjects = useMemo(() => {
    const value = query.trim().toLowerCase();
    return projects.filter((project) => !value || `${project.title} ${project.seller} ${project.category}`.toLowerCase().includes(value));
  }, [projects, query]);

  const runAction = async (id: string, action: () => Promise<void>, message: string) => {
    setActionId(id);
    setError('');
    setNotice('');
    try {
      await action();
      setNotice(message);
      await loadOverview();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'This action could not be completed.');
    } finally {
      setActionId('');
    }
  };

  const savePricing = (project: ProjectRow) => {
    const edit = pricing[project.id];
    return runAction(`project-${project.id}`, async () => {
      const agreed = Number(edit.agreed);
      const retail = Number(edit.retail);
      if (!Number.isFinite(agreed) || !Number.isFinite(retail) || agreed < 0 || retail < agreed) {
        throw new Error('Enter valid prices. Retail price must be at least the agreed developer price.');
      }
      const integrityScore = Number(edit.integrity);
      if (!Number.isInteger(integrityScore) || integrityScore < 0 || integrityScore > 100) {
        throw new Error('Integrity review score must be an integer from 0 to 100.');
      }
      await request(`/admin/projects/${project.id}/pricing`, {
        method: 'PATCH',
        body: JSON.stringify({
          developerAgreedPrice: Math.round(agreed * 100),
          studentRetailPrice: Math.round(retail * 100),
          integrityScore,
          projectStatus: edit.status,
          codeMarketAssured: edit.assured,
        }),
      });
      await loadProjects();
    }, `Pricing and review status updated for ${project.title}.`);
  };

  const reviewPayment = (payment: PaymentRow, decision: 'CONFIRMED' | 'REJECTED') =>
    runAction(`payment-${payment.id}`, async () => {
      await request(`/admin/payments/${payment.id}/verify`, {
        method: 'PATCH',
        body: JSON.stringify({ decision }),
      });
      await loadPayments();
    }, decision === 'CONFIRMED' ? 'Payment confirmed and placed in the 48-hour escrow window.' : 'Payment request rejected.');

  const releaseEscrow = (payment: PaymentRow) =>
    runAction(`release-${payment.id}`, async () => {
      await request(`/admin/payments/${payment.id}/release-escrow`, { method: 'PATCH' });
      await loadPayments();
    }, 'Escrow matured. Seller payout is ready for manual transfer.');

  const markPayoutPaid = (payout: PayoutRow) =>
    runAction(`payout-${payout.id}`, async () => {
      const transferReference = transferReferences[payout.id]?.trim();
      if (!transferReference) throw new Error('Enter the transfer reference from your manual UPI or bank payout.');
      await request(`/admin/payouts/${payout.id}/mark-paid`, {
        method: 'PATCH',
        body: JSON.stringify({ transferReference }),
      });
      await loadPayments();
    }, `Manual payout recorded for ${payout.seller.name}.`);

  const previewScreenshot = async (payment: PaymentRow) => {
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/admin/payments/${payment.id}/screenshot`, { headers: getAuthHeaders(false) });
      if (!response.ok) {
        const result = await response.json() as { message?: string };
        throw new Error(result.message ?? 'Unable to load payment screenshot.');
      }
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(await response.blob()));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load payment screenshot.');
    }
  };

  const saveSettings = () => runAction('settings', async () => {
    const data = await request<{ ownerUpiQrUrl: string; ownerUpiId: string }>('/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
    setSettings(data);
  }, 'Owner payment settings saved.');

  const moderateAccount = (account: AccountRow, nextStatus: 'ACTIVE' | 'SUSPENDED' | 'BANNED') => {
    return runAction(`account-${account.id}`, async () => {
      const updated = await request<AccountRow>(`/admin/users/${account.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      setAccounts((current) => current.map((item) => item.id === updated.id ? updated : item));
    }, `${account.name} is now ${nextStatus.toLowerCase()}.`);
  };

  const pageTitle = navigation.find((item) => item.id === tab)?.label ?? 'Owner console';

  return (
    <div className="min-h-screen bg-[#f7f9fc] text-slate-900 lg:flex">
      <aside className="flex w-full flex-col border-b border-slate-200 bg-white lg:min-h-screen lg:w-[258px] lg:border-b-0 lg:border-r">
        <Link to="/" className="flex items-center gap-3 border-b border-slate-100 px-5 py-5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-950 text-white"><Code2 size={20} /></span>
          <span><span className="block text-[15px] font-bold tracking-tight">CodeMarket</span><span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-sky-600">Owner control</span></span>
        </Link>
        <div className="flex gap-1 overflow-x-auto p-3 lg:flex-col lg:gap-1.5 lg:px-3 lg:py-6">
          <p className="hidden px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.17em] text-slate-400 lg:block">Workspace</p>
          {navigation.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" onClick={() => { setTab(id); setError(''); setNotice(''); }} className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold transition lg:w-full ${tab === id ? 'bg-sky-50 text-sky-700 ring-1 ring-sky-100' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}>
              <Icon size={17} strokeWidth={1.9} />
              <span>{label}</span>
              {id === 'payments' && (stats?.pendingPayments ?? 0) > 0 && <span className="ml-auto rounded-full bg-rose-100 px-2 py-0.5 text-[10px] text-rose-700">{stats?.pendingPayments}</span>}
              {id === 'projects' && (stats?.pendingProjects ?? 0) > 0 && <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-700">{stats?.pendingProjects}</span>}
            </button>
          ))}
        </div>
        <div className="hidden border-t border-slate-100 p-4 lg:mt-auto lg:block">
          <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">{user?.email.slice(0, 1).toUpperCase()}</div>
            <div className="min-w-0 flex-1"><p className="text-xs font-semibold text-slate-800">Marketplace owner</p><p className="truncate text-[10px] text-slate-500">{user?.email}</p></div>
            <button type="button" onClick={logout} title="Sign out" className="rounded-lg p-2 text-slate-400 hover:bg-white hover:text-slate-700"><LogOut size={15} /></button>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-7 lg:px-10 lg:py-8">
        <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold text-slate-400"><span>Owner workspace</span><ChevronRight size={12} /><span className="text-slate-600">{pageTitle}</span></div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-[28px]">{tab === 'overview' ? 'Good to see you' : pageTitle}</h1>
            <p className="mt-1 text-sm text-slate-500">{tab === 'overview' ? 'Your marketplace, reviewed at a glance.' : 'Manage the marketplace with clear, auditable controls.'}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-2 text-[11px] font-semibold text-emerald-700 sm:inline-flex"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Platform operational</span>
            <button type="button" onClick={() => void loadDashboard()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"><Activity size={15} /> Refresh</button>
          </div>
        </header>

        {error && <div role="alert" className="mb-5 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"><CircleAlert size={17} className="mt-0.5 shrink-0" />{error}</div>}
        {notice && <div role="status" className="mb-5 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><CheckCircle2 size={17} />{notice}</div>}

        {loading && !overview ? (
          <div className="grid min-h-64 place-items-center"><LoaderCircle className="animate-spin text-sky-600" /></div>
        ) : (
          <>
            {tab === 'overview' && (
              <>
                <section className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    { label: 'Gross processed', value: formatCurrency(stats?.grossProcessed ?? 0), meta: 'Verified buyer payments', icon: Banknote, tone: 'text-sky-700 bg-sky-50' },
                    { label: 'Needs review', value: stats?.pendingProjects ?? 0, meta: 'Projects in your queue', icon: Code2, tone: 'text-indigo-700 bg-indigo-50' },
                    { label: 'Payment checks', value: stats?.pendingPayments ?? 0, meta: 'UPI submissions pending', icon: Fingerprint, tone: 'text-amber-700 bg-amber-50' },
                    { label: 'Live catalogue', value: stats?.approvedProjects ?? 0, meta: `${stats?.negotiationProjects ?? 0} in negotiation`, icon: ShieldCheck, tone: 'text-emerald-700 bg-emerald-50' },
                  ].map(({ label, value, meta, icon: Icon, tone }) => (
                    <div key={label} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_12px_rgba(15,23,42,0.025)]">
                      <div className="flex items-start justify-between"><p className="text-[12px] font-semibold text-slate-500">{label}</p><span className={`grid h-9 w-9 place-items-center rounded-xl ${tone}`}><Icon size={17} /></span></div>
                      <p className="mt-4 text-[27px] font-bold tracking-tight text-slate-950">{value}</p><p className="mt-1 text-[11px] text-slate-400">{meta}</p>
                    </div>
                  ))}
                </section>

                <section className="mb-5 grid gap-5 xl:grid-cols-[1.55fr_0.9fr]">
                  <div className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6">
                    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                      <div><p className="text-sm font-semibold text-slate-900">Payment activity</p><p className="mt-1 text-xs text-slate-500">Verified volume received · last 14 days</p></div>
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-semibold text-slate-500"><Activity size={12} /> INR · Daily</span>
                    </div>
                    <div className="h-[220px] w-full">
                      <Suspense fallback={<div className="grid h-full place-items-center text-xs text-slate-400">Loading payment activity…</div>}>
                        <OwnerActivityChart data={overview?.dailyActivity ?? []} />
                      </Suspense>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6">
                    <div className="mb-4 flex items-start justify-between"><div><p className="text-sm font-semibold text-slate-900">Live system nodes</p><p className="mt-1 text-xs text-slate-500">Marketplace activity visualizer</p></div><span className="rounded-lg bg-slate-50 p-2 text-sky-600"><Globe2 size={17} /></span></div>
                    <Suspense fallback={<div className="grid h-52 place-items-center rounded-2xl bg-slate-50 text-xs text-slate-400">Loading system nodes…</div>}>
                      <OwnerSystemGlobe />
                    </Suspense>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Developers</p><p className="mt-1 text-lg font-bold text-slate-900">{stats?.sellers ?? 0}</p></div>
                      <div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Students</p><p className="mt-1 text-lg font-bold text-slate-900">{stats?.buyers ?? 0}</p></div>
                    </div>
                  </div>
                </section>

                <section className="grid gap-4 md:grid-cols-3">
                  {[
                    { title: 'Review new projects', detail: `${stats?.pendingProjects ?? 0} assets waiting for a decision`, icon: Code2, tab: 'projects' as Tab, tone: 'text-indigo-600 bg-indigo-50' },
                    { title: 'Verify buyer payments', detail: `${stats?.pendingPayments ?? 0} UTR submissions to validate`, icon: Fingerprint, tab: 'payments' as Tab, tone: 'text-sky-700 bg-sky-50' },
                    { title: 'Marketplace protection', detail: 'Escrow, account access and owner UPI', icon: Shield, tab: 'settings' as Tab, tone: 'text-emerald-700 bg-emerald-50' },
                  ].map(({ title, detail, icon: Icon, tab: target, tone }) => (
                    <button key={title} type="button" onClick={() => setTab(target)} className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 text-left transition hover:border-sky-200 hover:shadow-sm">
                      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tone}`}><Icon size={18} /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-slate-800">{title}</span><span className="mt-1 block text-xs text-slate-500">{detail}</span></span><ChevronRight size={16} className="text-slate-400" />
                    </button>
                  ))}
                </section>
              </>
            )}

            {tab === 'projects' && (
              <section>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div><h2 className="text-sm font-semibold text-slate-900">Project validation & pricing</h2><p className="mt-1 text-xs text-slate-500">Set the negotiated seller value and student retail price independently.</p></div>
                  <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 focus-within:border-sky-400 focus-within:ring-4 focus-within:ring-sky-100"><Search size={15} className="text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a project or developer" className="w-52 bg-transparent text-xs outline-none placeholder:text-slate-400" /></label>
                </div>
                {filteredProjects.length === 0 ? <EmptyState icon={Code2} title="No projects in this view" detail="Projects submitted for review will appear here." /> : (
                  <div className="grid gap-4 xl:grid-cols-2">
                    {filteredProjects.map((project) => {
                      const edit = pricing[project.id] ?? { agreed: String(project.developerAgreedPrice ?? project.studentRetailPrice), retail: String(project.studentRetailPrice), integrity: String(project.integrityScore), status: project.projectStatus, assured: project.codeMarketAssured };
                      const margin = Number(edit.retail || 0) - Number(edit.agreed || 0);
                      return (
                        <article key={project.id} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_12px_rgba(15,23,42,0.025)] sm:p-6">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0"><div className="mb-2 flex flex-wrap items-center gap-2"><StatusPill tone={project.projectStatus === 'Approved' ? 'green' : project.projectStatus === 'Negotiation' ? 'blue' : 'amber'}>{project.projectStatus}</StatusPill><span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{project.category}</span></div><h3 className="text-base font-bold text-slate-900">{project.title}</h3><p className="mt-1 text-xs text-slate-500">{project.seller} · {project.sellerEmail}</p></div>
                            <label className="text-[10px] font-semibold text-slate-500">Integrity score
                              <span className="mt-1 flex items-center rounded-lg border border-slate-200 px-2 focus-within:border-sky-400 focus-within:ring-4 focus-within:ring-sky-100"><input type="number" min="0" max="100" step="1" value={edit.integrity} onChange={(event) => setPricing((previous) => ({ ...previous, [project.id]: { ...edit, integrity: event.target.value } }))} className="w-12 bg-transparent py-1 text-xs font-semibold text-slate-800 outline-none" /><span className="text-[10px] text-slate-400">/100</span></span>
                            </label>
                          </div>
                          <p className="mt-4 line-clamp-2 text-xs leading-5 text-slate-500">{project.description}</p>
                          {project.analysis && <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/50 px-3.5 py-3">
                            <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[10px] font-semibold uppercase tracking-wide text-indigo-700">Local archive analysis · heuristic estimate only</span><span className="text-xs font-bold text-indigo-800">Suggested retail ₹{project.analysis.suggestedPrice.toLocaleString('en-IN')}</span></div>
                            <p className="mt-1 text-[11px] text-slate-600">{project.analysis.sourceFileCount} source files · {project.analysis.linesOfCode.toLocaleString()} non-empty lines · {project.analysis.dependencyCount} declared dependencies</p>
                            <p className="mt-1 text-[11px] text-slate-500">Detected: {project.analysis.languages.join(', ') || 'No recognized language'} · Exact archive matches in catalogue: {project.analysis.duplicateSourceCount}</p>
                            {project.analysis.reviewFlags.length > 0 && <ul className="mt-2 list-inside list-disc space-y-1 text-[11px] text-amber-800">{project.analysis.reviewFlags.map((flag) => <li key={flag}>{flag}</li>)}</ul>}
                            <p className="mt-2 text-[10px] text-slate-500">Archive metrics and byte-identical checks are review signals, not an AI price decision or plagiarism finding.</p>
                          </div>}
                          <div className="mt-5 grid grid-cols-2 gap-3">
                            <label className="text-[11px] font-semibold text-slate-500">Developer agreed price
                              <span className="mt-1.5 flex items-center rounded-xl border border-slate-200 bg-white px-3 focus-within:border-sky-400 focus-within:ring-4 focus-within:ring-sky-100"><span className="text-sm text-slate-400">₹</span><input type="number" min="0" step="1" value={edit.agreed} onChange={(event) => setPricing((previous) => ({ ...previous, [project.id]: { ...edit, agreed: event.target.value } }))} className="w-full bg-transparent px-2 py-2.5 text-sm font-semibold text-slate-800 outline-none" /></span>
                            </label>
                            <label className="text-[11px] font-semibold text-slate-500">Student retail price
                              <span className="mt-1.5 flex items-center rounded-xl border border-slate-200 bg-white px-3 focus-within:border-sky-400 focus-within:ring-4 focus-within:ring-sky-100"><span className="text-sm text-slate-400">₹</span><input type="number" min="0" step="1" value={edit.retail} onChange={(event) => setPricing((previous) => ({ ...previous, [project.id]: { ...edit, retail: event.target.value } }))} className="w-full bg-transparent px-2 py-2.5 text-sm font-semibold text-slate-800 outline-none" /></span>
                            </label>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-100 bg-sky-50/70 px-3.5 py-3"><span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Estimated platform spread</span><span className="text-sm font-bold text-sky-700">{margin >= 0 ? formatCurrency(margin) : 'Retail must cover seller price'}</span></div>
                          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                            <select aria-label="Project status" value={edit.status} onChange={(event) => setPricing((previous) => ({ ...previous, [project.id]: { ...edit, status: event.target.value as ProjectStatus } }))} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100">
                              <option value="Pending">Pending review</option><option value="Negotiation">Negotiation</option><option value="Approved">Approve & publish</option>
                            </select>
                            <div className="flex items-center gap-3">
                              <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600"><input type="checkbox" checked={edit.assured} onChange={(event) => setPricing((previous) => ({ ...previous, [project.id]: { ...edit, assured: event.target.checked } }))} className="accent-sky-600" /> Assured badge</label>
                              <button type="button" onClick={() => void savePricing(project)} disabled={actionId === `project-${project.id}`} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3.5 py-2.5 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50">{actionId === `project-${project.id}` ? <LoaderCircle size={14} className="animate-spin" /> : <Save size={14} />} Save review</button>
                            </div>
                          </div>
                          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3 text-[11px] text-slate-400">
                            <span>Submitted {formatDate(project.uploadedAt)}</span>
                            {project.whatsappNumber && <a href={`https://wa.me/${project.whatsappNumber.replace(/\D/g, '')}?text=${encodeURIComponent(`Hi ${project.seller}, we have reviewed “${project.title}”. Our proposed developer value is ₹${edit.agreed}. Let us know if you agree so we can proceed with validation.`)}`} target="_blank" rel="noreferrer" className="font-semibold text-sky-700 hover:text-sky-900">WhatsApp developer <ExternalLink size={11} className="ml-1 inline" /></a>}
                            <a href={`mailto:${project.sellerEmail}?subject=${encodeURIComponent(`CodeMarket review: ${project.title}`)}&body=${encodeURIComponent(`Hi ${project.seller}, we reviewed “${project.title}”. Our proposed developer value is ₹${edit.agreed}. Please reply to continue.`)}`} className="font-semibold text-sky-700 hover:text-sky-900">Email developer <ExternalLink size={11} className="ml-1 inline" /></a>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {tab === 'payments' && (
              <section>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold text-slate-900">UPI verification ledger</h2><p className="mt-1 text-xs text-slate-500">Confirm UTRs manually; verified funds remain locked for 48 hours.</p></div><StatusPill tone="amber"><LockKeyhole size={12} /> Seller payouts are never automatic</StatusPill></div>
                {payments.length === 0 && payouts.length === 0 ? <EmptyState icon={Wallet} title="No manual payments yet" detail="Buyer UPI submissions will appear here for review." /> : (
                  <div className="space-y-3">
                    {payments.map((payment) => {
                      const matured = Boolean(payment.escrowReleaseAt && new Date(payment.escrowReleaseAt) <= new Date());
                      const pending = payment.paymentVerificationState === 'PENDING';
                      return (
                        <article key={payment.id} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_12px_rgba(15,23,42,0.025)]">
                          <div className="flex flex-wrap items-start justify-between gap-4">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-bold text-slate-900">{payment.project?.title ?? 'Project order'}</h3><StatusPill tone={pending ? 'amber' : payment.paymentVerificationState === 'CONFIRMED' ? 'green' : 'red'}>{payment.paymentVerificationState}</StatusPill>{payment.escrowLockStatus === 'LOCKED' && <StatusPill tone="blue"><LockKeyhole size={11} /> Escrow locked</StatusPill>}</div>
                              <p className="mt-1.5 text-xs text-slate-500">{payment.buyer.name} · {payment.buyer.email}</p>
                              <div className="mt-3 grid gap-x-8 gap-y-1.5 text-xs sm:grid-cols-2">
                                <p><span className="text-slate-400">Amount </span><strong className="text-slate-800">{formatCurrency(payment.amount)}</strong></p>
                                <p><span className="text-slate-400">UTR </span><strong className="font-mono text-slate-800">{payment.utrNumber ?? '—'}</strong></p>
                                <p><span className="text-slate-400">Developer </span><strong className="text-slate-700">{payment.project?.seller.name ?? '—'}</strong></p>
                                <p><span className="text-slate-400">Submitted </span><strong className="font-medium text-slate-700">{formatDate(payment.createdAt)}</strong></p>
                              </div>
                              {payment.escrowReleaseAt && <p className="mt-2 text-xs text-slate-500">{matured ? 'Escrow matured' : 'Escrow releases'} · {formatDate(payment.escrowReleaseAt)}</p>}
                              {payment.project?.developerUpiQrUrl && payment.escrowLockStatus === 'LOCKED' && <a href={payment.project.developerUpiQrUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700"><QrCode size={13} /> View developer payout QR <ExternalLink size={11} /></a>}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              {payment.screenshotAvailable && <button type="button" onClick={() => void previewScreenshot(payment)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Eye size={14} /> Proof</button>}
                              {pending && <><button type="button" onClick={() => void reviewPayment(payment, 'REJECTED')} disabled={actionId === `payment-${payment.id}`} className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">Reject</button><button type="button" onClick={() => void reviewPayment(payment, 'CONFIRMED')} disabled={actionId === `payment-${payment.id}`} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"><Check size={14} /> Confirm UTR</button></>}
                              {payment.escrowLockStatus === 'LOCKED' && <button type="button" onClick={() => void releaseEscrow(payment)} disabled={!matured || Boolean(actionId)} title={matured ? 'Release escrow to the seller payout ledger' : 'Available after the 48-hour hold'} className="inline-flex items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800 disabled:cursor-not-allowed disabled:opacity-45"><ArrowUpRight size={14} /> Release to payout ledger</button>}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
                {payouts.length > 0 && <div className="mt-9">
                  <div className="mb-4 flex items-center justify-between"><div><h2 className="text-sm font-semibold text-slate-900">Matured seller payouts</h2><p className="mt-1 text-xs text-slate-500">Transfer manually to the developer QR, then record the outbound reference.</p></div><StatusPill tone="blue">{payouts.length} ready</StatusPill></div>
                  <div className="grid gap-4 xl:grid-cols-2">
                    {payouts.map((payout) => (
                      <article key={payout.id} className="rounded-2xl border border-sky-200 bg-white p-5">
                        <div className="flex items-start justify-between gap-4"><div><StatusPill tone="blue"><Wallet size={12} /> Ready for manual transfer</StatusPill><h3 className="mt-3 text-sm font-bold text-slate-900">{payout.projectTitle}</h3><p className="mt-1 text-xs text-slate-500">{payout.seller.name} · {payout.seller.email}</p></div><p className="text-lg font-bold text-slate-900">{formatCurrency(payout.amount)}</p></div>
                        <div className="mt-4 flex flex-wrap items-end gap-3">
                          {payout.developerUpiQrUrl && <a href={payout.developerUpiQrUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-sky-700"><QrCode size={14} /> Open developer QR <ExternalLink size={11} /></a>}
                          {!payout.developerUpiQrUrl && <span className="text-xs font-medium text-rose-600">Developer payout QR has not been provided.</span>}
                          <label className="min-w-[180px] flex-1 text-[10px] font-semibold text-slate-500">Outbound transfer reference
                            <input value={transferReferences[payout.id] ?? ''} onChange={(event) => setTransferReferences((current) => ({ ...current, [payout.id]: event.target.value }))} placeholder="UPI / bank UTR" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-normal text-slate-800 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100" />
                          </label>
                          <button type="button" onClick={() => void markPayoutPaid(payout)} disabled={!payout.developerUpiQrUrl || Boolean(actionId)} className="rounded-lg bg-slate-950 px-3 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50">Record transfer</button>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>}
              </section>
            )}

            {tab === 'accounts' && (
              <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4"><div><h2 className="text-sm font-semibold text-slate-900">Marketplace accounts</h2><p className="mt-1 text-xs text-slate-500">Suspend or restore buyer and seller access. Admin accounts are protected.</p></div><span className="text-xs text-slate-400">{accounts.length} accounts</span></div>
                <div className="divide-y divide-slate-100">
                  {accounts.map((account) => (
                    <div key={account.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                      <div className="flex min-w-0 items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-bold uppercase text-slate-600">{account.name.slice(0, 1)}</span><span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-800">{account.name}</span><span className="block truncate text-xs text-slate-500">{account.email}</span></span></div>
                      <div className="flex items-center gap-2 sm:gap-3">
                        <StatusPill tone={account.status === 'ACTIVE' ? 'green' : account.status === 'SUSPENDED' ? 'amber' : 'red'}>{account.status}</StatusPill>
                        <span className="w-14 text-[10px] font-bold uppercase tracking-wider text-slate-400">{account.role}</span>
                        {account.status === 'ACTIVE'
                          ? <><button type="button" onClick={() => void moderateAccount(account, 'SUSPENDED')} disabled={Boolean(actionId)} className="rounded-lg border border-amber-200 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50">Suspend</button><button type="button" onClick={() => void moderateAccount(account, 'BANNED')} disabled={Boolean(actionId)} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">Ban</button></>
                          : <button type="button" onClick={() => void moderateAccount(account, 'ACTIVE')} disabled={Boolean(actionId)} className="rounded-lg border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">Restore</button>}
                      </div>
                    </div>
                  ))}
                  {accounts.length === 0 && <p className="p-10 text-center text-sm text-slate-500">No buyer or seller accounts found.</p>}
                </div>
              </section>
            )}

            {tab === 'settings' && (
              <section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-7">
                  <div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-sky-50 text-sky-700"><QrCode size={19} /></span><span><h2 className="text-sm font-semibold text-slate-900">Owner UPI collection node</h2><p className="mt-1 text-xs leading-5 text-slate-500">Buyer instructions use this QR and UPI ID. Keep the collection account under owner control.</p></span></div>
                  <div className="mt-6 space-y-4">
                    <label className="block text-xs font-semibold text-slate-600">UPI ID<input value={settings.ownerUpiId} onChange={(event) => setSettings((current) => ({ ...current, ownerUpiId: event.target.value }))} placeholder="payments@bank" className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm font-medium text-slate-800 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100" /></label>
                    <label className="block text-xs font-semibold text-slate-600">UPI QR image URL<input value={settings.ownerUpiQrUrl} onChange={(event) => setSettings((current) => ({ ...current, ownerUpiQrUrl: event.target.value }))} placeholder="https://..." type="url" className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm font-medium text-slate-800 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100" /></label>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4"><p className="max-w-sm text-[11px] leading-5 text-slate-400">Use a trusted HTTPS-hosted QR asset. Payment verification and all developer payouts remain manual.</p><button type="button" onClick={() => void saveSettings()} disabled={actionId === 'settings'} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"><Save size={14} /> Save payment details</button></div>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-7">
                  <p className="text-sm font-semibold text-slate-900">QR preview</p>
                  <p className="mt-1 text-xs text-slate-500">This is the owner collection destination shown at checkout.</p>
                  <div className="mt-5 grid min-h-56 place-items-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4">
                    {settings.ownerUpiQrUrl ? <img src={settings.ownerUpiQrUrl} alt="Owner UPI payment QR" className="max-h-48 max-w-48 rounded-xl object-contain" /> : <div className="text-center"><QrCode size={38} className="mx-auto text-slate-300" /><p className="mt-3 text-xs font-medium text-slate-500">No owner QR configured</p></div>}
                  </div>
                  <div className="mt-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] leading-4 text-amber-800"><CircleAlert size={15} className="shrink-0" /> Use manual UTR checks; never release payout before funds are received and escrow matures.</div>
                </div>
                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-7 xl:col-span-2">
                  <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><ShieldCheck size={19} /></span><span><p className="text-sm font-semibold text-slate-900">Financial controls</p><p className="mt-1 text-xs text-slate-500">Built around confirmed buyer funds and an explicit hold period.</p></span></div>
                  <div className="mt-5 grid gap-3 md:grid-cols-3">
                    {[['01', 'No advance payout', 'Seller funds are only eligible after a verified student payment.'], ['02', '48-hour escrow', 'Every confirmed transaction records its maturity timestamp.'], ['03', 'Manual payout ledger', 'Matured funds are marked ready for an owner-initiated transfer.']].map(([number, title, detail]) => <div key={number} className="rounded-xl border border-slate-100 bg-slate-50/80 p-4"><span className="text-[10px] font-bold text-sky-600">{number}</span><p className="mt-2 text-xs font-semibold text-slate-800">{title}</p><p className="mt-1 text-[11px] leading-5 text-slate-500">{detail}</p></div>)}
                  </div>
                </div>
              </section>
            )}

            {tab === 'versions' && <OwnerOperationsPanel mode="versions" />}
            {tab === 'institutions' && <OwnerOperationsPanel mode="institutions" />}
          </>
        )}
        <footer className="mt-10 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/80 pt-5 text-[10px] text-slate-400"><span>CodeMarket Owner Control Center · Sensitive actions are server-authorized.</span><span>Protected workspace <LockKeyhole size={11} className="ml-1 inline" /></span></footer>
      </main>

      {previewUrl && <div role="dialog" aria-modal="true" aria-label="Payment screenshot preview" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" onClick={() => { URL.revokeObjectURL(previewUrl); setPreviewUrl(''); }}><div className="relative max-h-[90vh] max-w-3xl rounded-2xl bg-white p-3 shadow-2xl" onClick={(event) => event.stopPropagation()}><button type="button" onClick={() => { URL.revokeObjectURL(previewUrl); setPreviewUrl(''); }} aria-label="Close preview" className="absolute -right-3 -top-3 grid h-9 w-9 place-items-center rounded-full bg-slate-950 text-white shadow-lg"><X size={17} /></button><img src={previewUrl} alt="Uploaded UPI payment proof" className="max-h-[84vh] max-w-full rounded-xl object-contain" /></div></div>}
    </div>
  );
}

function EmptyState({ icon: Icon, title, detail }: { icon: typeof Code2; title: string; detail: string }) {
  return <div className="grid min-h-56 place-items-center rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center"><div><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-slate-50 text-slate-400"><Icon size={21} /></span><h3 className="mt-3 text-sm font-semibold text-slate-800">{title}</h3><p className="mt-1 text-xs text-slate-500">{detail}</p></div></div>;
}
