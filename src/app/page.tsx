import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="landing-page">
      <nav className="landing-nav">
        <Link href="/" className="landing-brand" aria-label="LeakProof AI home">
          <span className="brand-mark">LP</span>
          <span>LeakProof AI</span>
        </Link>
        <div className="landing-links">
          <Link href="/pricing">Pricing</Link>
          <Link href="/onboarding">Onboarding</Link>
          <Link href="/contact">Contact</Link>
          <Link className="button-link" href="/app">Open workspace</Link>
        </div>
      </nav>

      <section className="landing-hero">
        <div className="audit-scene" aria-hidden="true">
          <div className="scene-line scene-line-a" />
          <div className="scene-line scene-line-b" />
          <div className="scene-panel scene-ledger">
            <span>Contract ledger</span>
            <strong>Minimum commitment</strong>
            <div className="ledger-row"><span>Committed</span><b>USD 12,000</b></div>
            <div className="ledger-row muted-row"><span>Invoiced</span><b>USD 9,750</b></div>
            <div className="ledger-row recovery-row"><span>Recoverable</span><b>USD 2,250</b></div>
          </div>
          <div className="scene-panel scene-evidence">
            <span>Evidence linked</span>
            <strong>Usage exceeded allowance</strong>
            <p>Contract, invoice, and usage references matched.</p>
          </div>
          <div className="scene-panel scene-agent">
            <span>AI agent</span>
            <strong>Extracted terms</strong>
            <p>Human approval required before customer use.</p>
          </div>
        </div>

        <div className="landing-copy">
          <p className="eyebrow">Revenue leakage recovery</p>
          <h1>LeakProof AI</h1>
          <p className="landing-lede">
            A contract-backed revenue recovery workspace for finance teams that need evidence, calculations, and review control in one place.
          </p>
          <div className="landing-actions">
            <Link className="button-link" href="/app">Run an audit</Link>
            <Link className="button-link secondary" href="/contact">Request setup</Link>
          </div>
        </div>
      </section>

      <section className="landing-flow" aria-label="Audit workflow">
        {[
          ['01', 'Extract', 'AI reads contracts and highlights billing terms.'],
          ['02', 'Calculate', 'Code reconciles invoices, usage, and contract rules.'],
          ['03', 'Approve', 'Reviewers decide what becomes customer-ready.']
        ].map(([step, title, text]) => (
          <article key={title}>
            <span>{step}</span>
            <h2>{title}</h2>
            <p>{text}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
