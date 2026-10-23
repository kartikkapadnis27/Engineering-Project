import { Check, QrCode, ShieldCheck, Star, UploadCloud, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { ProjectInsightsPanel } from '../components/ProjectInsightsPanel';
import { API_BASE_URL, getAuthHeaders, SERVER_BASE_URL } from '../lib/api';
import type { Project } from '../data/projects';
import { useAuth } from '../context/AuthContext';

type ProjectComment = { id: string; comment: string; author: string; createdAt: string };

type ProjectDetails = Project & { demoVideo: string; comments: ProjectComment[] };

function formatCurrency(value: number) {
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function safeExternalUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : '';
  } catch {
    return '';
  }
}

export default function ProjectDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [project, setProject] = useState<ProjectDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [coupon, setCoupon] = useState('');
  const [couponMessage, setCouponMessage] = useState('');
  const [couponDiscount, setCouponDiscount] = useState<number | null>(null);
  const [downloadLink, setDownloadLink] = useState('');
  const [activationCode, setActivationCode] = useState('');
  const [purchaseTarget, setPurchaseTarget] = useState<{ versionId: string; price: number } | null>(null);
  const [showManualCheckout, setShowManualCheckout] = useState(false);
  const [ownerPayment, setOwnerPayment] = useState<{ ownerUpiQrUrl: string | null; ownerUpiId: string | null } | null>(null);
  const [utrNumber, setUtrNumber] = useState('');
  const [paymentScreenshot, setPaymentScreenshot] = useState<File | null>(null);
  const [manualPaymentId, setManualPaymentId] = useState('');
  const [manualPaymentStatus, setManualPaymentStatus] = useState('');
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [comment, setComment] = useState('');
  const [commentError, setCommentError] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);
  const [showCustomization, setShowCustomization] = useState(false);
  const [customization, setCustomization] = useState({ description: '', budget: '', timeline: '' });
  const [customizationMessage, setCustomizationMessage] = useState('');
  const [customizationError, setCustomizationError] = useState('');
  const checkoutStarted = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    const loadProject = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(`${API_BASE_URL}/projects/${id}`, { signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message ?? 'Project not found.');
        const item = result.data;
        setProject({
          id: item.id,
          title: item.title,
          category: item.category,
          shortDescription: item.shortDescription,
          description: item.description,
          price: Number(item.price ?? 0),
          integrityScore: Number(item.integrityScore ?? 0),
          codeMarketAssured: item.codeMarketAssured === true,
          rating: Number(item.rating ?? 0),
          reviews: Number(item.reviews ?? 0),
          technologies: Array.isArray(item.technologies) ? item.technologies : [],
          seller: item.seller ?? 'Verified seller',
          demoUrl: item.demoUrl ?? '',
          image: item.thumbnail ?? '',
          demoVideo: item.demoVideo ?? '',
          comments: item.comments ?? [],
        });
      } catch (loadError) {
        if (loadError instanceof Error && loadError.name !== 'AbortError') {
          setError(loadError.message);
          setProject(null);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void loadProject();
    return () => controller.abort();
  }, [id]);

  const handleCoupon = async () => {
    if (!user || user.role !== 'BUYER') {
      navigate(user ? '/seller/dashboard' : '/login');
      return;
    }
    setCouponMessage('');
    setCouponDiscount(null);
    try {
      const response = await fetch(`${API_BASE_URL}/payments/verify-coupon`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ projectId: String(id), code: coupon }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? 'Coupon code is not valid.');
      setCouponDiscount(Number(result.data.discount));
      setCouponMessage(`Coupon applied. You save ₹${Number(result.data.discount).toLocaleString('en-IN')}.`);
    } catch (couponError) {
      setCouponMessage(couponError instanceof Error ? couponError.message : 'Unable to verify coupon.');
    }
  };

  const handleBuyNow = async (update?: { id: string; price: number }) => {
    if (!project) return;
    if (!user || user.role !== 'BUYER') {
      navigate(user ? '/seller/dashboard' : '/login');
      return;
    }
    setCoupon('');
    setPurchaseTarget(update ? { versionId: update.id, price: update.price } : null);
    setCouponDiscount(null);
    setCouponMessage('');
    setError('');
    setCheckoutLoading(true);
    try {
      const qrResponse = await fetch(`${API_BASE_URL}/payments/manual/owner-qr`);
      const qrResult = await qrResponse.json();
      if (!qrResponse.ok) throw new Error(qrResult.message ?? 'Unable to load owner payment details.');
      if (!qrResult.data.ownerUpiQrUrl && !qrResult.data.ownerUpiId) {
        throw new Error('Owner UPI payment details are not configured yet. Please try again later.');
      }
      setOwnerPayment(qrResult.data);
      setShowManualCheckout(true);
    } catch (purchaseError) {
      setError(purchaseError instanceof Error ? purchaseError.message : 'Unable to prepare manual checkout.');
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleManualPaymentSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!paymentScreenshot) {
      setError('Upload a screenshot of your completed UPI payment.');
      return;
    }
    setManualSubmitting(true);
    setError('');
    const payload = new FormData();
    payload.append('projectId', String(id));
    payload.append('utrNumber', utrNumber.trim());
    payload.append('paymentScreenshot', paymentScreenshot);
    if (purchaseTarget) payload.append('projectVersionId', purchaseTarget.versionId);
    if (couponDiscount !== null && !purchaseTarget) payload.append('couponCode', coupon);

    try {
      const response = await fetch(`${API_BASE_URL}/payments/manual/submit`, {
        method: 'POST',
        headers: getAuthHeaders(false),
        body: payload,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? 'Unable to submit your payment for verification.');
      setManualPaymentId(result.data.paymentId);
      setManualPaymentStatus('PENDING');
      setShowManualCheckout(false);
      setUtrNumber('');
      setPaymentScreenshot(null);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to submit your payment for verification.');
    } finally {
      setManualSubmitting(false);
    }
  };

  useEffect(() => {
    if (!manualPaymentId) return;
    let active = true;
    let interval: number | undefined;
    const checkStatus = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/payments/manual/${manualPaymentId}/status`, { headers: getAuthHeaders(false) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message ?? 'Unable to check payment status.');
        if (!active) return;
        const state = result.data.paymentVerificationState as string;
        setManualPaymentStatus(state);
        if (state === 'CONFIRMED') {
          setDownloadLink(`${SERVER_BASE_URL}${result.data.downloadLink}`);
          setActivationCode(result.data.activationCode ?? '');
          if (interval) window.clearInterval(interval);
        }
        if (state === 'REJECTED' && interval) window.clearInterval(interval);
      } catch (statusError) {
        if (active) setError(statusError instanceof Error ? statusError.message : 'Unable to check payment status.');
        if (interval) window.clearInterval(interval);
      }
    };
    void checkStatus();
    interval = window.setInterval(() => void checkStatus(), 5000);
    return () => {
      active = false;
      if (interval) window.clearInterval(interval);
    };
  }, [manualPaymentId]);

  useEffect(() => {
    const shouldCheckout = (location.state as { openCheckout?: boolean } | null)?.openCheckout;
    if (shouldCheckout && project && !loading && !checkoutStarted.current) {
      checkoutStarted.current = true;
      navigate(location.pathname, { replace: true, state: null });
      void handleBuyNow();
    }
  }, [loading, location.pathname, location.state, navigate, project]);

  const handleComment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCommentError('');
    if (!user || user.role !== 'BUYER') {
      navigate(user ? '/seller/dashboard' : '/login');
      return;
    }
    setCommentLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/projects/${id}/comments`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ comment }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? 'Unable to post comment.');
      setProject((previous) => previous ? { ...previous, comments: [result.data, ...previous.comments] } : previous);
      setComment('');
    } catch (submitError) {
      setCommentError(submitError instanceof Error ? submitError.message : 'Unable to post comment.');
    } finally {
      setCommentLoading(false);
    }
  };

  const handleCustomization = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCustomizationError('');
    if (!user || user.role !== 'BUYER') {
      navigate(user ? '/seller/dashboard' : '/login');
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/projects/${id}/customization-requests`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(customization),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? 'Unable to send customization request.');
      setCustomizationMessage('Your request has been sent. The CodeMarket team will follow up.');
      setCustomization({ description: '', budget: '', timeline: '' });
    } catch (submitError) {
      setCustomizationError(submitError instanceof Error ? submitError.message : 'Unable to send customization request.');
    }
  };

  if (loading) {
    return <><Header /><main className="container py-20 text-center text-slate-600">Loading project details…</main><Footer /></>;
  }
  if (!project) {
    return <><Header /><main className="container py-20 text-center text-slate-600">{error || 'Project not found.'}</main><Footer /></>;
  }

  const demoUrl = safeExternalUrl(project.demoUrl);
  const demoVideo = project.demoVideo ? (project.demoVideo.startsWith('http') ? project.demoVideo : `${SERVER_BASE_URL}${project.demoVideo}`) : '';

  return (
    <>
      <Header />
      <main className="container py-10">
        {error && <div role="alert" className="mb-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
        {downloadLink && (
          <div role="status" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <span>Owner verified your payment — your purchase-scoped access is ready.{activationCode && <span className="mt-1 block font-mono text-xs">Activation code: {activationCode}</span>}</span>
            <a href={downloadLink} className="rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-800">Download source ZIP</a>
          </div>
        )}
        {manualPaymentStatus === 'PENDING' && <div role="status" className="mb-5 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">Your UPI transfer is awaiting owner verification. This page will update when it is reviewed.</div>}
        {manualPaymentStatus === 'REJECTED' && <div role="alert" className="mb-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">Your payment could not be verified. Check the UTR and screenshot, then contact marketplace support.</div>}
        <section className="rounded-lg border border-slate-200 bg-white p-5 sm:p-7">
          <div className="grid gap-7 lg:grid-cols-[1.15fr_0.85fr]">
            <div>
              {project.image && <img src={project.image} alt={project.title} className="h-[360px] w-full rounded-lg bg-slate-100 object-cover sm:h-[420px]" />}
              {demoVideo && <video controls preload="metadata" src={demoVideo} className="mt-4 max-h-80 w-full rounded-lg bg-slate-900" aria-label={`${project.title} demo video`} />}
            </div>
            <aside className="flex flex-col gap-5 rounded-lg border border-slate-200 bg-slate-50 p-5">
              <span className="w-fit rounded-full bg-blue-100 px-3 py-1 text-sm font-semibold text-blue-800">{project.category}</span>
              <div>
                <div className="flex flex-wrap items-center gap-2"><h1 className="text-3xl font-bold text-slate-900">{project.title}</h1>{project.codeMarketAssured && <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700"><ShieldCheck size={14} /> CodeMarket Assured</span>}</div>
                <p className="mt-3 text-slate-600">{project.shortDescription}</p>
              </div>
              <div className="flex items-center gap-2 text-amber-500">
                <Star size={18} fill="currentColor" /><span className="font-semibold text-slate-900">{project.rating}</span>
                <span className="text-slate-500">({project.reviews} reviews)</span>
              </div>
              <p className="text-4xl font-bold text-slate-900">₹{project.price.toLocaleString('en-IN')}</p>

              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <label htmlFor="coupon-code" className="text-sm font-semibold text-slate-800">Checkout coupon</label>
                <div className="mt-2 flex gap-2">
                  <input id="coupon-code" value={coupon} onChange={(event) => { setCoupon(event.target.value); setCouponDiscount(null); setCouponMessage(''); }} maxLength={40} placeholder="Enter voucher code" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600" />
                  <button type="button" onClick={() => void handleCoupon()} disabled={!coupon.trim()} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Apply</button>
                </div>
                {couponMessage && <p role="status" className={`mt-2 text-xs ${couponDiscount !== null ? 'text-emerald-700' : 'text-rose-700'}`}>{couponMessage}</p>}
              </div>

              <div className="space-y-3">
                <button type="button" onClick={() => void handleBuyNow()} disabled={checkoutLoading || Boolean(manualPaymentId && manualPaymentStatus !== 'REJECTED')} className="w-full rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60">{checkoutLoading ? 'Preparing secure checkout…' : manualPaymentStatus === 'PENDING' ? 'Payment under review' : 'Buy with UPI'}</button>
                {demoUrl ? <a href={demoUrl} target="_blank" rel="noopener noreferrer" className="flex w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50">Launch Live Demo</a> : <p className="text-center text-xs text-slate-500">A live demo is not available for this project.</p>}
              </div>
              {couponDiscount !== null && <p className="text-sm font-medium text-emerald-700">Voucher savings: ₹{couponDiscount.toLocaleString('en-IN')}</p>}
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="mb-2 font-semibold text-slate-900">Included with purchase</p>
                <ul className="space-y-2 text-sm text-slate-600">
                  {['Full source code', 'Setup guide', 'Commercial license'].map((item) => <li key={item} className="flex items-center gap-2"><Check size={16} className="text-emerald-600" />{item}</li>)}
                </ul>
              </div>
            </aside>
          </div>
        </section>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1.4fr_0.6fr]">
          <div className="space-y-6">
            <section className="rounded-lg border border-slate-200 bg-white p-6">
              <h2 className="mb-3 text-xl font-bold text-slate-900">Project details</h2>
              <p className="whitespace-pre-line text-slate-600">{project.description}</p>
            </section>
            <section className="rounded-lg border border-slate-200 bg-white p-6">
              <h2 className="mb-4 text-xl font-bold text-slate-900">Technology stack</h2>
              <div className="flex flex-wrap gap-2">
                {project.technologies.length ? project.technologies.map((technology) => <span key={technology} className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-800">{technology}</span>) : <p className="text-sm text-slate-500">Technology details have not been provided.</p>}
              </div>
            </section>
            <section className="rounded-lg border border-slate-200 bg-white p-6">
              <h2 className="mb-4 text-xl font-bold text-slate-900">Questions &amp; discussion</h2>
              <form onSubmit={handleComment} className="mb-6">
                <label htmlFor="project-comment" className="sr-only">Add a project question or comment</label>
                <textarea id="project-comment" value={comment} onChange={(event) => setComment(event.target.value)} required minLength={2} maxLength={2000} placeholder="Ask a question or share a comment…" className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-600" />
                {commentError && <p role="alert" className="mt-2 text-sm text-rose-700">{commentError}</p>}
                <button type="submit" disabled={commentLoading} className="mt-3 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{commentLoading ? 'Posting…' : 'Post comment'}</button>
              </form>
              <div className="divide-y divide-slate-200">
                {project.comments.length ? project.comments.map((item) => (
                  <article key={item.id} className="py-4 first:pt-0">
                    <div className="flex items-center justify-between gap-3"><p className="font-semibold text-slate-800">{item.author}</p><time className="text-xs text-slate-400">{new Date(item.createdAt).toLocaleDateString()}</time></div>
                    <p className="mt-2 whitespace-pre-line text-sm text-slate-600">{item.comment}</p>
                  </article>
                )) : <p className="text-sm text-slate-500">No questions yet. Start the discussion.</p>}
              </div>
            </section>
          </div>

          <aside className="space-y-5">
            <section className="rounded-lg border border-slate-200 bg-white p-6">
              <h2 className="mb-3 text-lg font-bold text-slate-900">Seller</h2>
              <p className="font-medium text-slate-800">{project.seller}</p>
              <p className="mt-1 text-sm text-slate-500">Marketplace project contributor</p>
            </section>
            <section className="rounded-lg border border-slate-200 bg-white p-6">
              <h2 className="mb-2 text-lg font-bold text-slate-900">Need a modification?</h2>
              <p className="mb-4 text-sm text-slate-600">Tell us about a feature or change you need for this project.</p>
              <button type="button" onClick={() => { setCustomizationMessage(''); setCustomizationError(''); setShowCustomization(true); }} className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800">Request Customization</button>
            </section>
            <Link to="/projects" className="block rounded-lg border border-slate-300 bg-white px-4 py-3 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50">Back to marketplace</Link>
          </aside>
        </div>
        <ProjectInsightsPanel
          projectId={String(id)}
          user={user}
          onPurchaseUpdate={(versionId, price) => void handleBuyNow({ id: versionId, price })}
        />
      </main>

      {showManualCheckout && ownerPayment && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-labelledby="manual-checkout-title">
          <div className="my-6 w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl sm:p-7">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div><h2 id="manual-checkout-title" className="text-xl font-bold text-slate-900">Pay securely with UPI</h2><p className="mt-1 text-sm text-slate-500">Transfer to CodeMarket owner and submit your payment proof.</p></div>
              <button type="button" onClick={() => setShowManualCheckout(false)} aria-label="Close UPI checkout" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={19} /></button>
            </div>
            <div className="grid gap-5 sm:grid-cols-[0.85fr_1.15fr]">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center">
                <div className="mx-auto grid min-h-48 place-items-center">
                  {ownerPayment.ownerUpiQrUrl ? <img src={ownerPayment.ownerUpiQrUrl} alt="CodeMarket owner UPI QR code" className="max-h-48 w-full rounded-lg object-contain" /> : <QrCode size={52} className="text-sky-600" />}
                </div>
                <p className="mt-3 text-xs font-semibold text-slate-700">Pay {formatCurrency((purchaseTarget?.price ?? project.price) - (purchaseTarget ? 0 : couponDiscount ?? 0))}</p>
                {ownerPayment.ownerUpiId && <p className="mt-1 break-all font-mono text-[11px] text-slate-500">{ownerPayment.ownerUpiId}</p>}
              </div>
              <form onSubmit={handleManualPaymentSubmit} className="space-y-3.5">
                <p className="flex items-start gap-2 rounded-lg border border-sky-100 bg-sky-50 px-3 py-2.5 text-xs leading-5 text-sky-800"><ShieldCheck size={15} className="mt-0.5 shrink-0" /> Your access is enabled after the owner manually confirms the transfer.</p>
                <label className="block text-xs font-semibold text-slate-700">UPI UTR / transaction ID
                  <input value={utrNumber} onChange={(event) => setUtrNumber(event.target.value)} required minLength={8} maxLength={80} pattern="[A-Za-z0-9-]+" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-mono text-sm outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100" placeholder="Enter the bank reference" />
                </label>
                <label className="block rounded-lg border border-dashed border-slate-300 bg-white p-3 text-xs font-semibold text-slate-700">Payment screenshot
                  <input type="file" required accept="image/png,image/jpeg,image/webp" onChange={(event) => setPaymentScreenshot(event.target.files?.[0] ?? null)} className="mt-2 block w-full text-xs font-normal text-slate-500" />
                  <span className="mt-1 block text-[10px] font-normal text-slate-400">{paymentScreenshot?.name ?? 'JPG, PNG or WebP · up to 10 MB'}</span>
                </label>
                <div className="flex items-center justify-between border-t border-slate-100 pt-3"><span className="text-xs text-slate-500"><UploadCloud size={14} className="mr-1 inline" /> Screenshot is only visible to marketplace admins</span><span className="text-xs font-bold text-slate-800">{formatCurrency((purchaseTarget?.price ?? project.price) - (purchaseTarget ? 0 : couponDiscount ?? 0))}</span></div>
                <button type="submit" disabled={manualSubmitting || !utrNumber.trim() || !paymentScreenshot} className="w-full rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">{manualSubmitting ? 'Submitting proof…' : 'Submit payment for verification'}</button>
              </form>
            </div>
          </div>
        </div>
      )}

      {showCustomization && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-labelledby="customization-title">
          <div className="w-full max-w-xl rounded-lg bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div><h2 id="customization-title" className="text-xl font-bold text-slate-900">Request a customization</h2><p className="mt-1 text-sm text-slate-500">Share the changes you need for {project.title}.</p></div>
              <button type="button" onClick={() => setShowCustomization(false)} aria-label="Close customization form" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={20} /></button>
            </div>
            {customizationMessage ? (
              <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{customizationMessage}</div>
            ) : (
              <form onSubmit={handleCustomization} className="space-y-4">
                <label className="block text-sm font-semibold text-slate-700">Requested changes
                  <textarea value={customization.description} onChange={(event) => setCustomization((previous) => ({ ...previous, description: event.target.value }))} minLength={20} maxLength={5000} required className="mt-2 min-h-32 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" placeholder="Describe the features or modifications you need." />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-semibold text-slate-700">Budget (optional)<input value={customization.budget} onChange={(event) => setCustomization((previous) => ({ ...previous, budget: event.target.value }))} maxLength={100} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" placeholder="₹20,000–₹30,000" /></label>
                  <label className="text-sm font-semibold text-slate-700">Timeline (optional)<input value={customization.timeline} onChange={(event) => setCustomization((previous) => ({ ...previous, timeline: event.target.value }))} maxLength={100} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" placeholder="Within 4 weeks" /></label>
                </div>
                {customizationError && <p role="alert" className="text-sm text-rose-700">{customizationError}</p>}
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setShowCustomization(false)} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700">Cancel</button>
                  <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">Send request</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
      <Footer />
    </>
  );
}
