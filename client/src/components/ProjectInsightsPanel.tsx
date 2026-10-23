import { lazy, Suspense, useEffect, useState } from 'react';
import { API_BASE_URL, getAuthHeaders, SERVER_BASE_URL } from '../lib/api';

const ArchitectureTour = lazy(() => import('./ArchitectureTour'));

type Props = {
  projectId: string;
  user: { id: string; role: 'BUYER' | 'SELLER' | 'ADMIN' } | null;
  onPurchaseUpdate: (versionId: string, price: number) => void;
};

type InsightData = {
  analysis: {
    sourceFileCount: number;
    linesOfCode: number;
    dependencyCount: number;
    languages: string[];
    reviewFlags: string[];
  };
  architecture: {
    nodes: { id: string; label: string; detail: string }[];
    edges: [string, string][];
  };
  practiceQuestions: string[];
};

type ProjectVersion = {
  id: string;
  version: string;
  notes: string | null;
  paidUpdate: boolean;
  updatePrice: number | null;
  createdAt: string;
};

type Message = {
  id: string;
  senderId: string;
  content: string;
  createdAt: string;
  sender: { name: string; role: string };
};

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { ...Object.fromEntries(getAuthHeaders().entries()), ...Object.fromEntries(new Headers(init?.headers).entries()) } });
  const result = await response.json() as { ok: boolean; data: T; message?: string };
  if (!response.ok || !result.ok) throw new Error(result.message ?? `Request failed (${response.status}).`);
  return result.data;
}

export function ProjectInsightsPanel({ projectId, user, onPurchaseUpdate }: Props) {
  const [insights, setInsights] = useState<InsightData | null>(null);
  const [versions, setVersions] = useState<ProjectVersion[]>([]);
  const [subscribed, setSubscribed] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [message, setMessage] = useState('');
  const [activeNode, setActiveNode] = useState('');
  const [completedQuestions, setCompletedQuestions] = useState<string[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      setError('');
      try {
        const [insightData, versionData] = await Promise.all([
          jsonRequest<InsightData>(`${API_BASE_URL}/projects/${projectId}/insights`),
          jsonRequest<ProjectVersion[]>(`${API_BASE_URL}/projects/${projectId}/versions`),
        ]);
        if (!active) return;
        setInsights(insightData);
        setVersions(versionData);
        setActiveNode(insightData.architecture.nodes[0]?.id ?? '');
        if (user?.role === 'BUYER') {
          const [alertState, thread] = await Promise.all([
            jsonRequest<{ subscribed: boolean }>(`${API_BASE_URL}/projects/${projectId}/price-alert`, { headers: getAuthHeaders(false) }),
            jsonRequest<Message[]>(`${API_BASE_URL}/projects/${projectId}/messages`, { headers: getAuthHeaders(false) }),
          ]);
          if (!active) return;
          setSubscribed(alertState.subscribed);
          setMessages(thread);
        }
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Unable to load project tools.');
      }
    };
    void load();
    return () => { active = false; };
  }, [projectId, user?.id, user?.role]);

  const toggleAlert = async () => {
    setBusy('alert');
    setError('');
    try {
      const method = subscribed ? 'DELETE' : 'POST';
      const data = await jsonRequest<{ subscribed: boolean }>(`${API_BASE_URL}/projects/${projectId}/price-alert`, { method, headers: getAuthHeaders(false) });
      setSubscribed(data.subscribed);
      setNotice(data.subscribed ? 'You will see an in-app alert when this project price drops.' : 'Price alerts disabled.');
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Unable to update price alerts.');
    } finally {
      setBusy('');
    }
  };

  const downloadReport = async () => {
    setBusy('report');
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/projects/${projectId}/report.pdf`, { headers: getAuthHeaders(false) });
      if (!response.ok) {
        const result = await response.json() as { message?: string };
        throw new Error(result.message ?? 'Report download failed.');
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = 'project-documentation.pdf';
      link.click();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'Unable to download the project report.');
    } finally {
      setBusy('');
    }
  };

  const getInstitutionAccess = async () => {
    setBusy('institution');
    setError('');
    try {
      const data = await jsonRequest<{ downloadLink: string; institutionName: string }>(
        `${API_BASE_URL}/projects/${projectId}/institution-access`,
        { headers: getAuthHeaders(false) },
      );
      window.location.assign(`${SERVER_BASE_URL}${data.downloadLink}`);
    } catch (accessError) {
      setError(accessError instanceof Error ? accessError.message : 'Unable to check institution access.');
    } finally {
      setBusy('');
    }
  };

  const sendMessage = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy('message');
    setError('');
    try {
      const created = await jsonRequest<Message>(`${API_BASE_URL}/projects/${projectId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: message }),
      });
      setMessages((current) => [...current, created]);
      setMessage('');
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Unable to send the message.');
    } finally {
      setBusy('');
    }
  };

  return (
    <section className="mt-8 space-y-5" aria-label="Project tools">
      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p>}
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="text-lg font-bold text-slate-900">Project architecture explorer</h2><p className="mt-1 text-xs text-slate-500">A technology-based map from seller-submitted project metadata.</p></div>
            {insights && <span className="text-xs text-slate-500">{insights.analysis.sourceFileCount} source files · {insights.analysis.linesOfCode.toLocaleString()} lines</span>}
          </div>
          {insights && (
            <>
              <Suspense fallback={<div className="my-5 grid h-52 place-items-center rounded-xl bg-slate-50 text-xs text-slate-500">Loading 3D architecture tour…</div>}>
                <ArchitectureTour nodes={insights.architecture.nodes} selected={activeNode} onSelect={setActiveNode} />
              </Suspense>
              <div className="my-5 flex flex-wrap items-center justify-center gap-3">
                {insights.architecture.nodes.map((node, index) => (
                  <div key={node.id} className="flex items-center gap-3">
                    <button type="button" onClick={() => setActiveNode(node.id)} className={`min-w-28 rounded-xl border p-3 text-left transition ${activeNode === node.id ? 'border-sky-300 bg-sky-50 shadow-sm' : 'border-slate-200 bg-white hover:border-sky-200'}`}>
                      <span className="block text-[10px] font-semibold uppercase tracking-wide text-sky-700">{node.label}</span>
                      <span className="mt-1 block text-xs font-medium text-slate-800">{node.detail}</span>
                    </button>
                    {index < insights.architecture.nodes.length - 1 && <span aria-hidden="true" className="font-semibold text-sky-500">→</span>}
                  </div>
                ))}
              </div>
              <p className="text-xs leading-5 text-slate-500">Dependencies identified: {insights.analysis.dependencyCount}. Components are illustrative; verify the source and deployment paths before relying on this map.</p>
            </>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-bold text-slate-900">Viva &amp; interview practice</h2>
          <p className="mt-1 text-xs text-slate-500">Guided offline practice prompts. Answers are not sent to an AI service or automatically graded.</p>
          <div className="mt-4 space-y-2">
            {insights?.practiceQuestions.slice(0, 6).map((question, index) => (
              <label key={question} className="flex cursor-pointer gap-3 rounded-lg border border-slate-100 p-2.5 text-sm text-slate-700">
                <input type="checkbox" checked={completedQuestions.includes(question)} onChange={(event) => setCompletedQuestions((current) => event.target.checked ? [...current, question] : current.filter((item) => item !== question))} className="mt-0.5 accent-sky-600" />
                <span><span className="mr-1 text-xs font-semibold text-sky-700">Q{index + 1}.</span>{question}</span>
              </label>
            ))}
          </div>
        </section>
      </div>

      {versions.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-bold text-slate-900">Version history</h2>
          <ul className="mt-3 divide-y divide-slate-100">
            {versions.map((version) => (
              <li key={version.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div><p className="font-semibold text-slate-800">Version {version.version}</p><p className="text-xs text-slate-500">{version.notes || 'Owner-reviewed source update'} · {new Date(version.createdAt).toLocaleDateString()}</p></div>
                {version.paidUpdate ? (
                  <button type="button" onClick={() => onPurchaseUpdate(version.id, (version.updatePrice ?? 0) / 100)} className="rounded-lg border border-sky-200 px-3 py-2 text-xs font-semibold text-sky-700 hover:bg-sky-50">Purchase update · ₹{((version.updatePrice ?? 0) / 100).toLocaleString('en-IN')}</button>
                ) : <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Included update</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5">
          <div><h2 className="font-bold text-slate-900">Project report &amp; alerts</h2><p className="mt-1 text-xs text-slate-500">Documentation PDF requires purchase or an active institution license.</p></div>
          <div className="flex flex-wrap gap-2">
            {user?.role === 'BUYER' && <>
              <button type="button" onClick={() => void toggleAlert()} disabled={busy === 'alert'} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700">{subscribed ? 'Disable price alert' : 'Notify me on price drop'}</button>
              <button type="button" onClick={() => void getInstitutionAccess()} disabled={busy === 'institution'} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700">Use institution access</button>
            </>}
            {user && <button type="button" onClick={() => void downloadReport()} disabled={busy === 'report'} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white">{busy === 'report' ? 'Preparing…' : 'Download report PDF'}</button>}
          </div>
        </section>

        {user?.role === 'BUYER' && (
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="font-bold text-slate-900">In-platform seller chat</h2>
            <p className="mt-1 text-xs text-slate-500">Phone numbers, payment handles, email addresses and external contact links are filtered.</p>
            <div className="mt-3 max-h-44 space-y-2 overflow-y-auto rounded-lg bg-slate-50 p-3">
              {messages.length === 0 ? <p className="text-xs text-slate-500">Start a conversation with the seller about this project.</p> : messages.map((item) => (
                <div key={item.id} className={`max-w-[90%] rounded-lg px-3 py-2 text-xs ${item.senderId === user.id ? 'ml-auto bg-sky-100 text-sky-950' : 'bg-white text-slate-700'}`}>
                  <p className="mb-1 font-semibold">{item.sender.name}</p><p className="whitespace-pre-wrap">{item.content}</p>
                </div>
              ))}
            </div>
            <form onSubmit={(event) => void sendMessage(event)} className="mt-3 flex gap-2">
              <input value={message} onChange={(event) => setMessage(event.target.value)} maxLength={2000} minLength={2} required placeholder="Ask about features or setup" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-400" />
              <button type="submit" disabled={busy === 'message'} className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{busy === 'message' ? 'Sending…' : 'Send'}</button>
            </form>
          </section>
        )}
      </div>
    </section>
  );
}
