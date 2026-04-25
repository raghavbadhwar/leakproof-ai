import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="public-page">
      <nav className="public-nav">
        <strong>LeakProof AI</strong>
        <div>
          <Link href="/pricing">Pricing</Link>
          <Link href="/onboarding">Onboarding</Link>
          <Link href="/contact">Contact</Link>
          <Link className="button-link" href="/app">Open workspace</Link>
        </div>
      </nav>

      <section className="public-hero">
        <p className="eyebrow">Revenue leakage recovery</p>
        <h1>Find the revenue your contracts already earned.</h1>
        <p>
          Upload contracts, invoices, and usage files. Gemini extracts and retrieves evidence, deterministic code calculates leakage,
          and a human reviewer approves every customer-ready finding.
        </p>
        <div className="header-actions">
          <Link className="button-link" href="/app">Run an audit</Link>
          <Link className="button-link secondary" href="/contact">Request founder-led setup</Link>
        </div>
      </section>

      <section className="public-grid">
        {[
          ['Evidence index', 'Chunk documents, embed evidence with Gemini, and search source material without crossing tenant boundaries.'],
          ['Deterministic reconciliation', 'Minimum commitments, overages, seats, expired discounts, uplifts, and risks use integer minor-unit math.'],
          ['CFO-ready reports', 'Generate printable evidence packs with formulas, source citations, review status, and model provenance.']
        ].map(([title, text]) => (
          <article key={title} className="public-card">
            <h2>{title}</h2>
            <p>{text}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
