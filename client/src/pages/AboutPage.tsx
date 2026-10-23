import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { PageHero } from '../components/PageHero';

export default function AboutPage() {
  return (
    <>
      <Header />
      <PageHero
        eyebrow="About"
        title="Built for software creators and digital businesses"
        subtitle="CodeMarket helps students, developers, freelancers, and businesses buy, sell, and custom-build software products with trust and transparency."
      />
      <main className="container py-12">
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="card p-8">
            <h2 className="text-2xl font-bold text-slate-900">Our mission</h2>
            <p className="mt-4 text-slate-600">We believe digital products should be simple to discover, secure to buy, and easy to scale. CodeMarket is designed to bridge creators and buyers in a premium, professional marketplace.</p>
          </div>
          <div className="card p-8">
            <h2 className="text-2xl font-bold text-slate-900">What we support</h2>
            <ul className="mt-4 space-y-2 text-slate-600">
              <li>• Ready-made software projects</li>
              <li>• Seller verification and review flow</li>
              <li>• Custom software development</li>
              <li>• Support and maintenance services</li>
            </ul>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
