import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { PageHero } from '../components/PageHero';

export default function FaqPage() {
  return (
    <>
      <Header />
      <PageHero
        eyebrow="FAQ"
        title="Frequently asked questions"
        subtitle="Find answers about purchases, licenses, seller onboarding, and custom development." 
      />
      <main className="container py-12">
        <div className="space-y-4">
          {[
            ['How do I access my purchased project?', 'After successful payment, the order is marked paid and project access is enabled in your buyer dashboard.'],
            ['Are projects reviewed before publishing?', 'Yes. All seller-submitted projects are reviewed by the admin team before being approved publicly.'],
            ['Do you offer custom development?', 'Yes. We build websites, apps, dashboards, portals, and business software for various use cases.'],
            ['How are commissions handled?', 'The platform commission is calculated server-side using the configured commission rate and recorded with each order.']
          ].map(([question, answer]) => (
            <div key={question} className="card p-6">
              <h3 className="text-lg font-semibold text-slate-900">{question}</h3>
              <p className="mt-2 text-slate-600">{answer}</p>
            </div>
          ))}
        </div>
      </main>
      <Footer />
    </>
  );
}
