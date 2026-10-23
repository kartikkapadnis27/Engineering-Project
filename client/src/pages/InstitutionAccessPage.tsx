import { useCallback, useEffect, useState } from 'react';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { API_BASE_URL, getAuthHeaders } from '../lib/api';
import { useAuth } from '../context/AuthContext';

type Membership = {
  id: string;
  license: { institutionName: string; expiresAt: string; status: string; categories: string };
};

export default function InstitutionAccessPage() {
  const { user } = useAuth();
  const [code, setCode] = useState('');
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  const loadMemberships = useCallback(async () => {
    if (!user || user.role !== 'BUYER') return;
    const response = await fetch(`${API_BASE_URL}/institutions/mine`, { headers: getAuthHeaders(false) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message ?? 'Unable to load institution access.');
    setMemberships(result.data as Membership[]);
  }, [user]);

  useEffect(() => {
    void loadMemberships().catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Unable to load institution access.'));
  }, [loadMemberships]);

  const redeem = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`${API_BASE_URL}/institutions/redeem`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ code }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? 'Unable to redeem institution code.');
      setCode('');
      setNotice(`Access enabled for ${result.data.institutionName}.`);
      await loadMemberships();
    } catch (redeemError) {
      setError(redeemError instanceof Error ? redeemError.message : 'Unable to redeem institution code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Header />
      <main className="container min-h-[65vh] py-12">
        <div className="mx-auto max-w-2xl">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">Institution portal</span>
          <h1 className="mt-2 text-3xl font-bold text-slate-950">Redeem college access</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">Enter a license code from your institution. Eligible catalogue access is subject to the institution's category scope, seat limit, and expiry.</p>
          {!user || user.role !== 'BUYER' ? <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Sign in with a student buyer account to redeem an institution license.</p> : (
            <>
              <form onSubmit={(event) => void redeem(event)} className="mt-6 flex flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white p-5">
                <input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} minLength={8} maxLength={40} required placeholder="Institution license code" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2.5 font-mono text-sm outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100" />
                <button type="submit" disabled={loading} className="rounded-lg bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{loading ? 'Checking…' : 'Redeem code'}</button>
              </form>
              {error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
              {notice && <p role="status" className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}
              <section className="mt-8">
                <h2 className="text-lg font-bold text-slate-900">Your institution access</h2>
                {memberships.length === 0 ? <p className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">No active licenses are linked to your account yet.</p> : <ul className="mt-3 space-y-3">{memberships.map(({ id, license }) => (
                  <li key={id} className="rounded-xl border border-slate-200 bg-white p-4">
                    <p className="font-semibold text-slate-900">{license.institutionName}</p>
                    <p className="mt-1 text-xs text-slate-500">Expires {new Date(license.expiresAt).toLocaleDateString()} · Categories: {license.categories}</p>
                    {license.status !== 'ACTIVE' && <p className="mt-2 text-xs font-semibold text-rose-700">This institution license is currently inactive.</p>}
                  </li>
                ))}</ul>}
              </section>
            </>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
