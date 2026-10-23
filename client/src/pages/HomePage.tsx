import { ArrowRight, BadgeCheck, Bot, BriefcaseBusiness, ChartNoAxesCombined, CheckCircle2, CircleDollarSign, Code2, GraduationCap, IndianRupee, Search, ShieldCheck, ShoppingCart, Sparkles, Star, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { categories } from '../data/projects';

const trustItems = [
  { label: 'Verified Projects', icon: BadgeCheck },
  { label: 'Secure Payments', icon: CircleDollarSign },
  { label: 'Secure Downloads', icon: ShieldCheck },
  { label: 'Seller Support', icon: BriefcaseBusiness },
  { label: 'Customer Support', icon: CheckCircle2 },
  { label: 'Transparent Pricing', icon: TrendingUp }
];

const howBuyers = [
  'Browse curated software projects',
  'Preview demos and screenshots',
  'Pay the owner directly via UPI',
  'Download or access instantly' 
];

const howSellers = [
  'Create a seller account',
  'Upload your project details',
  'Get approval from admin',
  'Earn from successful sales'
];

const platformFeatures = [
  {
    title: 'AI Smart Price Engine',
    description: 'Get a fair valuation for every line of code.',
    icon: Sparkles,
    colors: 'border-sky-100 bg-sky-50 text-sky-700',
    iconColors: 'bg-sky-100 text-sky-700'
  },
  {
    title: 'Secure P2P Marketplace',
    description: 'Buy and sell directly, with protection.',
    icon: ShieldCheck,
    colors: 'border-violet-100 bg-violet-50 text-violet-700',
    iconColors: 'bg-violet-100 text-violet-700'
  },
  {
    title: 'Validated Source Code',
    description: 'Projects are reviewed before they go live.',
    icon: BadgeCheck,
    colors: 'border-amber-100 bg-amber-50 text-amber-700',
    iconColors: 'bg-amber-100 text-amber-700'
  },
  {
    title: 'AI Viva Simulator',
    description: 'Practice project questions with confidence.',
    icon: Bot,
    colors: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    iconColors: 'bg-emerald-100 text-emerald-700'
  },
  {
    title: 'Developer Analytics',
    description: 'Track your sales and project performance.',
    icon: ChartNoAxesCombined,
    colors: 'border-orange-100 bg-orange-50 text-orange-700',
    iconColors: 'bg-orange-100 text-orange-700'
  },
  {
    title: 'Live Fintech Chart',
    description: 'Follow earnings and commission trends.',
    icon: TrendingUp,
    colors: 'border-rose-100 bg-rose-50 text-rose-700',
    iconColors: 'bg-rose-100 text-rose-700'
  }
];

export default function HomePage() {
  return (
    <>
      <Header />
      <main>
        <section className="relative overflow-hidden bg-gradient-to-br from-white via-sky-50/70 to-blue-50">
          <div className="pointer-events-none absolute -left-32 top-12 h-72 w-72 rounded-full bg-sky-100/60 blur-3xl" />
          <div className="pointer-events-none absolute -right-24 bottom-0 h-80 w-80 rounded-full bg-blue-100/60 blur-3xl" />
          <div className="container relative grid gap-12 py-12 sm:py-16 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:gap-10 lg:py-20">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white/80 px-3.5 py-1.5 text-xs font-semibold tracking-wide text-sky-800 shadow-sm">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                India&apos;s engineering project marketplace
              </span>

              <h1 className="mt-6 max-w-3xl text-4xl font-extrabold leading-[1.1] tracking-tight text-slate-950 sm:text-5xl lg:text-[3.5rem]">
                Explore Engineering <span className="text-sky-600">Projects</span>
              </h1>
              <p lang="mr" className="mt-4 text-base font-semibold text-sky-800 sm:text-lg">
                Engineering Projects Hub: Buy or Sell!
              </p>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
                The ultimate P2P marketplace for validated engineering source code, secure transactions, and AI-driven insights.
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                <Link to="/projects" className="group inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-600/20 transition hover:-translate-y-0.5 hover:bg-sky-700">
                  Explore projects <ArrowRight size={17} className="transition group-hover:translate-x-0.5" />
                </Link>
                <Link to="/sell-project" className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-200 hover:bg-sky-50">
                  <Code2 size={17} className="text-sky-600" /> Post a project
                </Link>
              </div>

              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {platformFeatures.map(({ title, description, icon: Icon, colors, iconColors }) => (
                  <article key={title} className={`group flex min-h-[106px] items-start gap-3.5 rounded-2xl border p-4 shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-md ${colors}`}>
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconColors}`}>
                      <Icon size={20} strokeWidth={2} />
                    </span>
                    <div>
                      <h2 className="text-sm font-bold leading-5 text-slate-900">{title}</h2>
                      <p className="mt-1 text-xs leading-5 text-slate-600">{description}</p>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-[540px] lg:pl-3">
              <div className="absolute -inset-4 rounded-[3rem] bg-gradient-to-br from-sky-200/70 via-white to-indigo-100/70 blur-xl" />
              <div className="relative rounded-[2.5rem] border border-white/80 bg-white/80 p-3 shadow-[0_28px_80px_-30px_rgba(14,116,144,0.35)] backdrop-blur">
                <div className="relative overflow-hidden rounded-[2rem] bg-sky-100">
                  <img
                    src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1200&q=85"
                    alt="Engineering students collaborating around a laptop"
                    className="h-[350px] w-full object-cover sm:h-[440px]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/45 via-transparent to-sky-950/10" />
                  <div className="absolute bottom-5 left-5 right-5 rounded-2xl border border-white/50 bg-white/90 p-4 shadow-lg backdrop-blur-md sm:bottom-6 sm:left-6 sm:right-6">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-sky-700">Built by students</p>
                        <p className="mt-1 text-sm font-bold text-slate-900 sm:text-base">Ideas that move engineering forward</p>
                      </div>
                      <div className="flex -space-x-2" aria-label="Student community">
                        {['A', 'S', 'R'].map((initial, index) => (
                          <span key={initial} className={`grid h-9 w-9 place-items-center rounded-full border-2 border-white text-xs font-bold text-white ${['bg-sky-600', 'bg-violet-500', 'bg-emerald-500'][index]}`}>
                            {initial}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="absolute -left-3 top-10 flex h-12 w-12 items-center justify-center rounded-2xl border border-white bg-white text-sky-700 shadow-lg sm:-left-7 sm:top-16 sm:h-14 sm:w-14">
                <Code2 size={24} />
              </div>
              <div className="absolute -right-2 top-24 flex h-12 w-12 items-center justify-center rounded-full border border-white bg-amber-50 text-amber-700 shadow-lg sm:-right-6 sm:top-28 sm:h-14 sm:w-14">
                <IndianRupee size={22} />
              </div>
              <div className="absolute -left-3 bottom-24 flex h-12 w-12 items-center justify-center rounded-full border border-white bg-emerald-50 text-emerald-700 shadow-lg sm:-left-7 sm:bottom-28 sm:h-14 sm:w-14">
                <ChartNoAxesCombined size={22} />
              </div>
              <div className="absolute -right-2 bottom-20 flex h-12 w-12 items-center justify-center rounded-2xl border border-white bg-violet-50 text-violet-700 shadow-lg sm:-right-6 sm:bottom-24 sm:h-14 sm:w-14">
                <ShoppingCart size={22} />
              </div>
              <div className="absolute right-8 -top-4 flex h-11 w-11 items-center justify-center rounded-full border border-white bg-rose-50 text-rose-600 shadow-lg sm:right-12 sm:-top-5 sm:h-12 sm:w-12">
                <Bot size={21} />
              </div>

              <div className="absolute -bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-slate-100 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-lg sm:bottom-5">
                <GraduationCap size={16} className="text-sky-600" />
                <span>Made for the next generation of engineers</span>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-slate-50 py-16">
          <div className="container">
            <div className="mb-8 flex items-end justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-600">Popular Categories</p>
                <h2 className="mt-2 section-title">Explore by category</h2>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {categories.map((category) => (
                <div key={category} className="card flex items-center justify-between p-4">
                  <span className="font-medium text-slate-800">{category}</span>
                  <ArrowRight size={16} className="text-slate-400" />
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="developer-zone" className="bg-slate-100 py-20">
          <div className="container grid gap-10 lg:grid-cols-2">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-600">How it works</p>
              <h2 className="mt-3 section-title">Built for buyers and sellers</h2>
            </div>

            <div className="grid gap-8 md:grid-cols-2">
              <div className="card p-6">
                <h3 className="mb-4 text-xl font-semibold text-slate-900">For Buyers</h3>
                <ul className="space-y-3 text-sm text-slate-600">
                  {howBuyers.map((step, index) => (
                    <li key={step} className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">{index + 1}</span>
                      {step}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="card p-6">
                <h3 className="mb-4 text-xl font-semibold text-slate-900">For Sellers</h3>
                <ul className="space-y-3 text-sm text-slate-600">
                  {howSellers.map((step, index) => (
                    <li key={step} className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">{index + 1}</span>
                      {step}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="py-20">
          <div className="container">
            <div className="mb-8 text-center">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-600">Why choose us</p>
              <h2 className="mt-2 section-title">Built on trust and quality</h2>
            </div>

            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {trustItems.map(({ label, icon: Icon }) => (
                <div key={label} className="card p-6 text-center">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                    <Icon size={22} />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900">{label}</h3>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-slate-900 py-20 text-white">
          <div className="container grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-100">Custom software</p>
              <h2 className="mt-3 text-3xl font-bold md:text-4xl">Need a project built specifically for you?</h2>
            </div>
            <Link to="/custom-software" className="btn-primary bg-white text-brand-700 hover:bg-slate-100">Request Custom Software</Link>
          </div>
        </section>

        <section className="py-20">
          <div className="container">
            <div className="mb-8 text-center">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-600">Testimonials</p>
              <h2 className="mt-2 section-title">What customers say</h2>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              {[
                { name: 'Riya M.', quote: 'The platform feels premium and the delivery process was quick and reliable.', score: 5 },
                { name: 'Aman K.', quote: 'We found a high-quality management system that saved our team weeks of work.', score: 5 },
                { name: 'Nihar S.', quote: 'As a seller, the approval workflow and dashboard are clear and professional.', score: 5 }
              ].map((item) => (
                <div key={item.name} className="card p-6">
                  <div className="mb-4 flex gap-1 text-amber-500">
                    {Array.from({ length: item.score }).map((_, idx) => (
                      <Star key={idx} size={16} fill="currentColor" />
                    ))}
                  </div>
                  <p className="text-slate-700">“{item.quote}”</p>
                  <div className="mt-5 font-semibold text-slate-900">{item.name}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-slate-50 py-20">
          <div className="container max-w-4xl">
            <div className="mb-8 text-center">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-600">FAQ</p>
              <h2 className="mt-2 section-title">Frequently asked questions</h2>
            </div>

            <div className="space-y-4">
              {[
                'How does delivery work after purchase?',
                'Are projects reviewed before publishing?',
                'Do you support custom development work?',
                'How are seller commissions calculated?'
              ].map((q) => (
                <div key={q} className="card p-5 text-left font-medium text-slate-700">{q}</div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
