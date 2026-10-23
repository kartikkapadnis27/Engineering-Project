import { useCallback, useEffect, useState } from 'react';
import { API_BASE_URL, getAuthHeaders } from '../lib/api';

type Conversation = {
  buyer: { id: string; name: string; email: string } | undefined;
  lastMessageAt: string | null;
};
type Message = {
  id: string;
  senderId: string;
  content: string;
  sender: { name: string };
};

export function SellerProjectConversations({ projectId }: { projectId: string }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [buyerId, setBuyerId] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const loadConversations = useCallback(async () => {
    const response = await fetch(`${API_BASE_URL}/projects/${projectId}/conversations`, { headers: getAuthHeaders(false) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message ?? 'Unable to load buyer conversations.');
    setConversations(result.data as Conversation[]);
    if (!buyerId && result.data[0]?.buyer?.id) setBuyerId(result.data[0].buyer.id);
  }, [buyerId, projectId]);

  const loadMessages = useCallback(async () => {
    if (!buyerId) {
      setMessages([]);
      return;
    }
    const response = await fetch(`${API_BASE_URL}/projects/${projectId}/messages?buyerId=${encodeURIComponent(buyerId)}`, { headers: getAuthHeaders(false) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message ?? 'Unable to load the buyer conversation.');
    setMessages(result.data as Message[]);
  }, [buyerId, projectId]);

  useEffect(() => {
    let active = true;
    void loadConversations().catch((loadError) => {
      if (active) setError(loadError instanceof Error ? loadError.message : 'Unable to load buyer conversations.');
    });
    return () => { active = false; };
  }, [loadConversations]);

  useEffect(() => {
    let active = true;
    void loadMessages().catch((loadError) => {
      if (active) setError(loadError instanceof Error ? loadError.message : 'Unable to load the buyer conversation.');
    });
    return () => { active = false; };
  }, [loadMessages]);

  const send = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!buyerId) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/projects/${projectId}/messages`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ buyerId, content: draft }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? 'Unable to send your reply.');
      setMessages((current) => [...current, result.data as Message]);
      setDraft('');
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Unable to send your reply.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h4 className="text-sm font-semibold text-slate-800">Buyer conversations</h4><p className="text-xs text-slate-500">External contact details are filtered.</p></div>
        <select value={buyerId} onChange={(event) => setBuyerId(event.target.value)} className="max-w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs">
          <option value="">Choose a conversation</option>
          {conversations.map(({ buyer }) => buyer && <option key={buyer.id} value={buyer.id}>{buyer.name} · {buyer.email}</option>)}
        </select>
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-rose-700">{error}</p>}
      {buyerId && <>
        <div className="mt-3 max-h-40 space-y-2 overflow-y-auto rounded-lg bg-white p-3">
          {messages.map((item) => <p key={item.id} className="rounded-lg bg-slate-50 px-3 py-2 text-xs"><strong>{item.sender.name}:</strong> {item.content}</p>)}
        </div>
        <form onSubmit={(event) => void send(event)} className="mt-3 flex gap-2">
          <input value={draft} onChange={(event) => setDraft(event.target.value)} minLength={2} maxLength={2000} required placeholder="Reply in CodeMarket" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <button disabled={loading} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{loading ? 'Sending…' : 'Reply'}</button>
        </form>
      </>}
    </section>
  );
}
