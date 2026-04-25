import Link from 'next/link';

export default function OnboardingPage() {
  return (
    <main className="public-page narrow">
      <nav className="public-nav">
        <Link href="/">LeakProof AI</Link>
        <Link className="button-link" href="/app">Open workspace</Link>
      </nav>
      <section className="public-card">
        <p className="eyebrow">Onboarding checklist</p>
        <h1>What the first audit needs</h1>
        <ol className="check-list">
          <li>Signed contracts, order forms, or statements of work.</li>
          <li>Invoice CSVs for the same customers and periods.</li>
          <li>Usage or seat exports with dates and account identifiers.</li>
          <li>A finance reviewer who can approve, dismiss, or mark findings for review.</li>
        </ol>
      </section>
    </main>
  );
}
