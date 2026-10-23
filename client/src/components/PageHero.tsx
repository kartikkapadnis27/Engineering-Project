type PageHeroProps = {
  eyebrow?: string;
  title: string;
  subtitle: string;
};

export function PageHero({ eyebrow, title, subtitle }: PageHeroProps) {
  return (
    <section className="bg-slate-900 py-16 text-white">
      <div className="container">
        {eyebrow && <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-brand-100">{eyebrow}</p>}
        <h1 className="max-w-3xl text-4xl font-bold tracking-tight md:text-5xl">{title}</h1>
        <p className="mt-4 max-w-2xl text-lg text-slate-300">{subtitle}</p>
      </div>
    </section>
  );
}
