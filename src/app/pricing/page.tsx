import Link from 'next/link';

export default function PricingPage() {
  return (
    <main className="public-page narrow">
      <nav className="public-nav">
        <Link href="/">LeakProof AI</Link>
        <Link className="button-link" href="/contact">Request audit</Link>
      </nav>
      <section className="public-card">
        <p className="eyebrow">Manual audit billing</p>
        <h1>Founder-led audits first. No checkout required.</h1>
        <p>Start with a scoped revenue leakage audit, then convert recurring monitoring once the evidence and recovery workflow is proven.</p>
        <div className="pricing-table">
          <div><strong>Starter audit</strong><span>USD 1,500 to 3,000</span></div>
          <div><strong>Success option</strong><span>5 to 10 percent of verified recoverable leakage</span></div>
          <div><strong>Monitoring</strong><span>Quoted after the first audit based on volume</span></div>
        </div>
      </section>
    </main>
  );
}
