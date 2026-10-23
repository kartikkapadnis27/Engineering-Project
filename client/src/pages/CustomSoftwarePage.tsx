import { useState, type FormEvent } from 'react';
import { PageHero } from '../components/PageHero';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { API_BASE_URL } from '../lib/api';

export default function CustomSoftwarePage() {
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setSubmitting(true);
    setMessage(null);

    const formData = new FormData(form);
    const payload = Object.fromEntries(
      Array.from(formData.entries(), ([key, value]) => [key, typeof value === 'string' ? value.trim() : value]),
    );

    try {
      const response = await fetch(`${API_BASE_URL}/custom-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message ?? 'Unable to submit your request.');
      }

      form.reset();
      setMessage({ text: 'Your request was sent successfully. We will be in touch soon.', isError: false });
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : 'Unable to submit your request. Please try again.',
        isError: true,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Header />
      <PageHero
        eyebrow="Custom development"
        title="Need a custom software solution?"
        subtitle="Tell us about your product idea and our team can help scope, design, and build it."
      />
      <main className="container py-10">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="card p-6">
            <h2 className="text-2xl font-bold text-slate-900">What we build</h2>
            <ul className="mt-6 space-y-3 text-slate-600">
              <li>• Website and web application development</li>
              <li>• Android and iOS app development</li>
              <li>• Business software and dashboards</li>
              <li>• AI-powered apps and automation</li>
              <li>• Management systems and portals</li>
            </ul>
          </div>

          <form className="card p-6 md:p-8" onSubmit={handleSubmit}>
            <div className="grid gap-6 md:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">
                Name
                <input name="name" required minLength={2} maxLength={100} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3" placeholder="Your name" />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Email
                <input name="email" type="email" required maxLength={254} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3" placeholder="you@example.com" />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Phone
                <input name="phone" maxLength={30} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3" placeholder="+91 98765 43210" />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Project type
                <select name="projectType" required className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <option value="Website">Website</option>
                  <option value="Android App">Android App</option>
                  <option value="Business Software">Business Software</option>
                  <option value="AI Application">AI Application</option>
                  <option value="Other">Other</option>
                </select>
              </label>
            </div>

            <label className="mt-6 block text-sm font-medium text-slate-700">
              Project description
              <textarea name="description" required minLength={20} maxLength={5000} className="mt-2 min-h-[150px] w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3" placeholder="Tell us about your requirements, audience, and business goals." />
            </label>

            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">
                Budget (₹)
                <input name="budget" maxLength={100} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3" placeholder="250000" />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Expected timeline
                <input name="timeline" maxLength={100} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3" placeholder="4–6 weeks" />
              </label>
            </div>

            <div className="mt-6 flex justify-end">
              <button type="submit" disabled={submitting} className="btn-primary disabled:cursor-not-allowed disabled:opacity-60">
                {submitting ? 'Submitting…' : 'Submit Request'}
              </button>
            </div>
            {message && (
              <p className={`mt-4 text-sm ${message.isError ? 'text-red-600' : 'text-green-700'}`} role={message.isError ? 'alert' : 'status'}>
                {message.text}
              </p>
            )}
          </form>
        </div>
      </main>
      <Footer />
    </>
  );
}
