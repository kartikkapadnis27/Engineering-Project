import { useCallback, useEffect, useState } from 'react';
import { API_BASE_URL, getAuthHeaders } from '../lib/api';

type Props = { mode: 'versions' | 'institutions' };
type Version = {
  id: string;
  version: string;
  notes: string | null;
  createdAt: string;
  project: { id: string; title: string; seller: { user: { name: string; email: string } } };
};
type Institution = {
  id: string;
  code: string;
  institutionName: string;
  categories: string;
  maxSeats: number;
  annualPrice: number;
  paymentReference: string;
  activeSeats: number;
  expiresAt: string;
  status: string;
};

async function request<T>(url: string, init?: RequestInit) {
  const response = await fetch(`${API_BASE_URL}${url}`, {
    ...init,
    headers: { ...Object.fromEntries(getAuthHeaders().entries()), ...Object.fromEntries(new Headers(init?.headers).entries()) },
  });
  const result = await response.json() as { ok: boolean; data: T; message?: string };
  if (!response.ok || !result.ok) throw new Error(result.message ?? `Request failed (${response.status}).`);
  return result.data;
}

export function OwnerOperationsPanel({ mode }: Props) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [paidUpdates, setPaidUpdates] = useState<Record<string, boolean>>({});
  const [updatePrices, setUpdatePrices] = useState<Record<string, string>>({});
  const [sellerPrices, setSellerPrices] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ institutionName: '', categories: '*', maxSeats: '100', annualPrice: '', paymentReference: '', expiresAt: '' });
  const [createdCode, setCreatedCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [gatewayReady, setGatewayReady] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      if (mode === 'versions') setVersions(await request<Version[]>('/admin/versions/review'));
      else {
        setInstitutions(await request<Institution[]>('/institutions/admin'));
        setGatewayReady(true);
      }
    } catch (loadError) {
      if (mode === 'institutions') setGatewayReady(false);
      setError(loadError instanceof Error ? loadError.message : 'Unable to load owner operations.');
    }
  }, [mode]);

  useEffect(() => { void load(); }, [load]);

  const reviewVersion = async (version: Version, decision: 'APPROVED' | 'REJECTED') => {
    setLoading(true);
    setError('');
    setNotice('');
    const paidUpdate = paidUpdates[version.id] ?? false;
    const updatePrice = Number(updatePrices[version.id] ?? '');
    const developerAgreedPrice = Number(sellerPrices[version.id] ?? '');
    if (decision === 'APPROVED' && paidUpdate &&
        (!Number.isInteger(updatePrice) || updatePrice < 1 || !Number.isInteger(developerAgreedPrice) || developerAgreedPrice < 0 || developerAgreedPrice > updatePrice)) {
      setError('Enter whole-rupee update prices and ensure the agreed seller value does not exceed the retail price.');
      setLoading(false);
      return;
    }
    try {
      await request(`/admin/versions/${version.id}/review`, {
        method: 'PATCH',
        body: JSON.stringify({
          decision,
          paidUpdate: decision === 'APPROVED' && paidUpdate,
          ...(paidUpdate ? {
            updatePrice: Math.round(updatePrice * 100),
            developerAgreedPrice: Math.round(developerAgreedPrice * 100),
          } : {}),
        }),
      });
      setNotice(`Version ${version.version} ${decision === 'APPROVED' ? 'approved' : 'rejected'}.`);
      await load();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : 'Unable to review project update.');
    } finally {
      setLoading(false);
    }
  };

  const createInstitution = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setNotice('');
    setCreatedCode('');
    try {
      const license = await request<Institution>('/institutions/admin', {
        method: 'POST',
        body: JSON.stringify({
          institutionName: form.institutionName,
          categories: form.categories.split(',').map((category) => category.trim()).filter(Boolean),
          maxSeats: Number(form.maxSeats),
          annualPrice: Math.round(Number(form.annualPrice) * 100),
          paymentReference: form.paymentReference.trim(),
          expiresAt: new Date(form.expiresAt).toISOString(),
        }),
      });
      setCreatedCode(license.code);
      setNotice('Institution license created. Share the code securely with the institution.');
      setForm((current) => ({ ...current, institutionName: '', annualPrice: '', paymentReference: '' }));
      await load();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to create institution license.');
    } finally {
      setLoading(false);
    }
  };

  const toggleInstitution = async (license: Institution) => {
    setLoading(true);
    setError('');
    try {
      await request(`/institutions/admin/${license.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: license.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' }),
      });
      await load();
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : 'Unable to update institution license.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="space-y-5">
      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p>}
      {mode === 'institutions' && (
        <section aria-label="Local workflow status" className="grid gap-3 sm:grid-cols-2">
          <article className="rounded-2xl border border-sky-100 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Institution Gateway Status</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">{gatewayReady ? 'SECURE [Bearer Token Active]' : 'Awaiting authenticated API check'}</p>
              </div>
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${gatewayReady ? 'bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.12)]' : 'bg-amber-400'}`} />
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">Verified by the owner-only license ledger request. Buyer entitlements are checked again for each access token and download.</p>
          </article>
          <article className="rounded-2xl border border-sky-100 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Watermark Engine</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">NATIVE ONLINE</p>
              </div>
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-sky-500 shadow-[0_0_0_4px_rgba(14,165,233,0.12)]" />
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">Local ZIP delivery signs buyer and purchase metadata into supported source comments. Run <code className="rounded bg-slate-50 px-1 py-0.5 text-sky-700">npm run test:watermark</code> for the isolated fixture check.</p>
          </article>
        </section>
      )}
      {mode === 'versions' ? (
        <>
          <div><h2 className="text-sm font-semibold text-slate-900">Seller-submitted releases</h2><p className="mt-1 text-xs text-slate-500">Review the source archive before buyer update alerts go out. Paid update price is set in rupees.</p></div>
          {versions.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">No project updates are waiting for review.</div> : versions.map((version) => (
            <article key={version.id} className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap justify-between gap-3"><div><h3 className="font-semibold text-slate-900">{version.project.title} · v{version.version}</h3><p className="mt-1 text-xs text-slate-500">{version.project.seller.user.name} · {version.project.seller.user.email} · {new Date(version.createdAt).toLocaleString()}</p><p className="mt-2 text-sm text-slate-600">{version.notes || 'No release notes provided.'}</p></div><span className="h-fit rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">Pending review</span></div>
              <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4">
                <label className="flex items-center gap-2 text-xs font-medium text-slate-700"><input type="checkbox" checked={paidUpdates[version.id] ?? false} onChange={(event) => setPaidUpdates((current) => ({ ...current, [version.id]: event.target.checked }))} /> Paid update</label>
                {(paidUpdates[version.id] ?? false) && <>
                  <label className="text-xs font-medium text-slate-600">Student update price (₹)<input type="number" min="1" step="1" value={updatePrices[version.id] ?? ''} onChange={(event) => setUpdatePrices((current) => ({ ...current, [version.id]: event.target.value }))} className="ml-2 w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
                  <label className="text-xs font-medium text-slate-600">Agreed seller value (₹)<input type="number" min="0" step="1" value={sellerPrices[version.id] ?? ''} onChange={(event) => setSellerPrices((current) => ({ ...current, [version.id]: event.target.value }))} className="ml-2 w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
                </>}
                <div className="ml-auto flex gap-2"><button type="button" disabled={loading} onClick={() => void reviewVersion(version, 'REJECTED')} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700">Reject</button><button type="button" disabled={loading} onClick={() => void reviewVersion(version, 'APPROVED')} className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white">Approve &amp; notify buyers</button></div>
              </div>
            </article>
          ))}
        </>
      ) : (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">Create institutional license</h2>
            <p className="mt-1 text-xs text-slate-500">Set a seat cap, category scope, and expiry after receiving the annual fee. Record the incoming transfer reference; no subscription payment processor is configured.</p>
            <form onSubmit={(event) => void createInstitution(event)} className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="text-xs font-semibold text-slate-600">Institution name<input value={form.institutionName} onChange={(event) => setForm((current) => ({ ...current, institutionName: event.target.value }))} minLength={2} maxLength={160} required className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal" /></label>
              <label className="text-xs font-semibold text-slate-600">Eligible categories (comma-separated; * = all)<input value={form.categories} onChange={(event) => setForm((current) => ({ ...current, categories: event.target.value }))} required className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal" /></label>
              <label className="text-xs font-semibold text-slate-600">Seat limit<input type="number" min="1" max="100000" value={form.maxSeats} onChange={(event) => setForm((current) => ({ ...current, maxSeats: event.target.value }))} required className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal" /></label>
              <label className="text-xs font-semibold text-slate-600">Expiry<input type="datetime-local" value={form.expiresAt} onChange={(event) => setForm((current) => ({ ...current, expiresAt: event.target.value }))} required className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal" /></label>
              <label className="text-xs font-semibold text-slate-600">Annual fee received (₹)<input type="number" min="1" step="1" value={form.annualPrice} onChange={(event) => setForm((current) => ({ ...current, annualPrice: event.target.value }))} required className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal" /></label>
              <label className="text-xs font-semibold text-slate-600">Incoming transfer reference<input value={form.paymentReference} onChange={(event) => setForm((current) => ({ ...current, paymentReference: event.target.value }))} minLength={4} maxLength={100} required className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal" /></label>
              <button disabled={loading} className="rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white md:col-span-2 md:justify-self-end">Create access license</button>
            </form>
            {createdCode && <p className="mt-4 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">Institution code: <code className="font-mono font-bold">{createdCode}</code></p>}
          </section>
          <div className="space-y-3">{institutions.map((license) => (
            <article key={license.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5">
              <div><h3 className="font-semibold text-slate-900">{license.institutionName}</h3><p className="mt-1 font-mono text-xs text-slate-600">{license.code}</p><p className="mt-1 text-xs text-slate-500">₹{(license.annualPrice / 100).toLocaleString('en-IN')}/year · Ref {license.paymentReference} · {license.activeSeats}/{license.maxSeats} seats · {new Date(license.expiresAt).toLocaleDateString()} · {license.categories}</p></div>
              <div className="flex items-center gap-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${license.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{license.status}</span><button type="button" onClick={() => void toggleInstitution(license)} disabled={loading} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700">{license.status === 'ACTIVE' ? 'Suspend' : 'Activate'}</button></div>
            </article>
          ))}</div>
        </>
      )}
    </section>
  );
}
