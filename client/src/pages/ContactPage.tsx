import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { PageHero } from '../components/PageHero';

export default function ContactPage() {
  return (
    <>
      <Header />
      <PageHero
        eyebrow="Contact"
        title="Get in touch"
        subtitle="Ask about product discovery, custom development, seller onboarding, or partnership opportunities."
      />
      <main className="container py-12">
        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="card p-8">
            <h2 className="text-2xl font-bold text-slate-900">Contact details</h2>
            <div className="mt-6 space-y-3 text-slate-600">
              <p>Email: kartikkapadnis27@gmail.com</p>
              <p>Phone: +919021156768</p>
              <p>Hours: Mon–Sat, 9 AM to 7 PM</p>
            </div>
          </div>

          <form className="card p-8">
            <div className="grid gap-6 md:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">
                Name
                <input className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3" placeholder="Your name" />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Email
                <input className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3" placeholder="you@example.com" />
              </label>
            </div>

            <label className="mt-6 block text-sm font-medium text-slate-700">
              Message
              <textarea className="mt-2 min-h-[160px] w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3" placeholder="Tell us how we can help." />
            </label>

            <button type="button" className="btn-primary mt-6">Send message</button>
          </form>
        </div>
      </main>
      <Footer />
    </>
  );
}
