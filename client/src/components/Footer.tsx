import { Link } from 'react-router-dom';

export function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-slate-950 text-slate-300">
      <div className="container grid gap-10 py-12 md:grid-cols-4">
        <div>
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-600 text-xs font-extrabold tracking-tight text-white">EP</div>
            <div className="text-xl font-bold text-white">Engineering Project</div>
          </div>
          <p className="max-w-xs text-sm text-slate-400">
            A professional marketplace for software projects, digital products, and custom development services.
          </p>
        </div>

        <div>
          <h4 className="mb-4 text-sm font-semibold uppercase tracking-[0.12em] text-slate-100">Marketplace</h4>
          <ul className="space-y-2 text-sm text-slate-400">
            <li><Link to="/projects">Projects</Link></li>
            <li><Link to="/categories">Categories</Link></li>
            <li><Link to="/sell-project">Sell Your Project</Link></li>
            <li><Link to="/custom-software">Custom Software</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="mb-4 text-sm font-semibold uppercase tracking-[0.12em] text-slate-100">Company</h4>
          <ul className="space-y-2 text-sm text-slate-400">
            <li><Link to="/about">About</Link></li>
            <li><Link to="/contact">Contact</Link></li>
            <li><Link to="/faq">FAQ</Link></li>
            <li><Link to="/support">Support</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="mb-4 text-sm font-semibold uppercase tracking-[0.12em] text-slate-100">Policies</h4>
          <ul className="space-y-2 text-sm text-slate-400">
            <li><Link to="/terms">Terms</Link></li>
            <li><Link to="/privacy">Privacy</Link></li>
            <li><Link to="/refund-policy">Refund Policy</Link></li>
            <li><Link to="/license-policy">License Policy</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-800">
        <div className="container flex flex-col items-center justify-between gap-3 py-5 text-sm text-slate-400 md:flex-row">
          <p>© 2026 Engineering Project. All rights reserved.</p>
          <p>Built for students, developers, freelancers, and businesses.</p>
        </div>
      </div>
    </footer>
  );
}
