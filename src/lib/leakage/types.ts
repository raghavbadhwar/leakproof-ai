export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'INR' | string;

export type Citation = {
  sourceType: 'contract' | 'invoice' | 'usage' | 'calculation';
  sourceId: string;
  label: string;
  excerpt?: string;
};

export type Money = {
  amountMinor: number;
  currency: CurrencyCode;
};

export type ContractTerm = {
  id: string;
  customerId: string;
  type:
    | 'contract_start_date'
    | 'contract_end_date'
    | 'renewal_term'
    | 'notice_period'
    | 'base_fee'
    | 'billing_frequency'
    | 'minimum_commitment'
    | 'committed_seats'
    | 'seat_price'
    | 'usage_allowance'
    | 'overage_price'
    | 'discount'
    | 'discount_expiry'
    | 'annual_uplift'
    | 'amendment'
    | 'payment_terms'
    | 'special_billing_note';
  value: unknown;
  citation: Citation;
  confidence: number;
  reviewStatus: 'extracted' | 'approved' | 'edited' | 'needs_review' | 'rejected';
};

export type InvoiceRecord = {
  id: string;
  customerId: string;
  invoiceId: string;
  invoiceDate: string;
  lineItem: string;
  quantity?: number;
  unitPriceMinor?: number;
  amountMinor: number;
  currency: CurrencyCode;
  servicePeriodStart?: string;
  servicePeriodEnd?: string;
  paymentTermsDays?: number;
  citation: Citation;
};

export type UsageRecord = {
  id: string;
  customerId: string;
  periodStart: string;
  periodEnd: string;
  metricName: string;
  quantity: number;
  citation: Citation;
};

export type LeakageFinding = {
  id: string;
  customerId: string;
  type:
    | 'minimum_commitment_shortfall'
    | 'usage_overage_unbilled'
    | 'seat_underbilling'
    | 'expired_discount_still_applied'
    | 'missed_annual_uplift'
    | 'renewal_window_risk'
    | 'payment_terms_mismatch'
    | 'amendment_conflict';
  title: string;
  summary: string;
  outcomeType: 'recoverable_leakage' | 'prevented_future_leakage' | 'risk_alert';
  estimatedAmount: Money;
  confidence: number;
  status: 'draft' | 'needs_review' | 'approved' | 'dismissed' | 'customer_ready' | 'recovered' | 'not_recoverable';
  calculation: Record<string, unknown>;
  citations: Citation[];
};
