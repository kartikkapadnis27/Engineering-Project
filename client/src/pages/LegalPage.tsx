import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { PageHero } from '../components/PageHero';

export default function LegalPage({ title = 'Terms & Conditions', content = 'This is a placeholder policy page for the marketplace.' }: { title?: string; content?: string }) {
  return (
    <>
      <Header />
      <PageHero eyebrow="Legal" title={title} subtitle="This page is designed to be replaced with the final business policy text." />
      <main className="container py-12">
        <div className="card p-8 text-slate-700">
          <p>{content}</p>
          <ul className="mt-6 space-y-3">
            <li>• All product and seller policies should be reviewed before production launch.</li>
            <li>• Platform owners must keep these pages aligned with their final legal and business requirements.</li>
            <li>• Commercial use, licensing, and copyright rules should be confirmed with appropriate legal counsel.</li>
          </ul>
        </div>
      </main>
      <Footer />
    </>
  );
}
