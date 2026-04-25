import Link from 'next/link';

export default function ContactPage() {
  return (
    <main className="public-page narrow">
      <nav className="public-nav">
        <Link href="/">LeakProof AI</Link>
        <Link className="button-link" href="/app">Open app</Link>
      </nav>
      <section className="public-card">
        <p className="eyebrow">Request an audit</p>
        <h1>Prepare contracts, invoice exports, and usage data.</h1>
        <p>
          Use the workspace when credentials are configured, or send a request to schedule a founder-led audit setup call.
        </p>
        <a className="button-link" href="mailto:raghav1badhwar@gmail.com?subject=LeakProof%20AI%20audit%20request">Email audit request</a>
      </section>
    </main>
  );
}
