import { useCallback, useEffect, useState } from 'react';
import { API_BASE_URL, getAuthHeaders } from '../lib/api';

type VersionRow = {
  id: string;
  version: string;
  notes: string | null;
  status: string;
  reviewNote: string | null;
  paidUpdate: boolean;
  updatePrice: number | null;
  createdAt: string;
};

export function SellerProjectUpdates({ projectId }: { projectId: string }) {
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [version, setVersion] = useState('');
  const [notes, setNotes] = useState('');
  const [archive, setArchive] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadVersions = useCallback(async () => {
    const response = await fetch(`${API_BASE_URL}/projects/${projectId}/versions/manage`, { headers: getAuthHeaders(false) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message ?? 'Unable to load project updates.');
    setVersions((result.data.versions ?? []) as VersionRow[]);
    if (!version && result.data.currentVersion) {
      const parts = String(result.data.currentVersion).split('.');
      const patch = Number(parts[parts.length - 1]);
      parts[parts.length - 1] = String(Number.isInteger(patch) ? patch + 1 : 1);
      setVersion(parts.join('.'));
    }
  }, [projectId, version]);

  useEffect(() => {
    void loadVersions().catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Unable to load project updates.'));
  }, [loadVersions]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!archive) {
      setError('Choose a ZIP archive for the update.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    const payload = new FormData();
    payload.append('version', version);
    payload.append('notes', notes);
    payload.append('projectZip', archive);
    try {
      const response = await fetch(`${API_BASE_URL}/projects/${projectId}/versions`, {
        method: 'POST',
        headers: getAuthHeaders(false),
        body: payload,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? 'Unable to submit project update.');
      setNotice('Update submitted. The owner must review it before buyer access and notifications.');
      setNotes('');
      setArchive(null);
      await loadVersions();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to submit project update.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <h4 className="text-sm font-semibold text-slate-800">Project versions &amp; updates</h4>
      <p className="mt-1 text-xs text-slate-500">Upload a ZIP release for owner review. Free or paid status is set by the owner; no seller payout is initiated by publishing an update.</p>
      {versions.length > 0 && <ul className="my-3 space-y-1.5 text-xs text-slate-600">{versions.slice(0, 5).map((item) => (
        <li key={item.id} className="flex flex-wrap justify-between gap-2 rounded-md bg-white px-3 py-2">
          <span>v{item.version} · {item.status.replace(/_/g, ' ').toLowerCase()}{item.reviewNote ? ` · ${item.reviewNote}` : ''}</span>
          {item.paidUpdate && item.updatePrice !== null && <span>₹{(item.updatePrice / 100).toLocaleString('en-IN')}</span>}
        </li>
      ))}</ul>}
      <form onSubmit={(event) => void submit(event)} className="grid gap-3 sm:grid-cols-[0.6fr_1fr_1fr_auto] sm:items-end">
        <label className="text-xs font-semibold text-slate-600">Version
          <input value={version} onChange={(event) => setVersion(event.target.value)} minLength={1} maxLength={40} required className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" />
        </label>
        <label className="text-xs font-semibold text-slate-600">Release notes
          <input value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" placeholder="Bug fixes and improvements" />
        </label>
        <label className="text-xs font-semibold text-slate-600">Source ZIP
          <input type="file" accept=".zip,application/zip" onChange={(event) => setArchive(event.target.files?.[0] ?? null)} required className="mt-1.5 block w-full text-xs font-normal" />
        </label>
        <button type="submit" disabled={busy || !archive} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{busy ? 'Submitting…' : 'Submit update'}</button>
      </form>
      {error && <p role="alert" className="mt-2 text-xs text-rose-700">{error}</p>}
      {notice && <p role="status" className="mt-2 text-xs text-emerald-700">{notice}</p>}
    </section>
  );
}
