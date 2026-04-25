import type { ContractTerm, InvoiceRecord, LeakageFinding, UsageRecord } from './types';

function approvedTerm<T>(terms: ContractTerm[], customerId: string, type: ContractTerm['type']): (ContractTerm & { value: T }) | undefined {
  return terms.find((term) => term.customerId === customerId && term.type === type && ['approved', 'edited'].includes(term.reviewStatus)) as (ContractTerm & { value: T }) | undefined;
}

function sumInvoicesForCustomer(invoices: InvoiceRecord[], customerId: string): number {
  return invoices
    .filter((invoice) => invoice.customerId === customerId)
    .reduce((sum, invoice) => sum + invoice.amountMinor, 0);
}

export function findMinimumCommitmentShortfall(input: {
  customerId: string;
  terms: ContractTerm[];
  invoices: InvoiceRecord[];
}): LeakageFinding | null {
  const minimum = approvedTerm<{ amountMinor: number; currency: string }>(input.terms, input.customerId, 'minimum_commitment');
  if (!minimum) return null;

  const customerInvoices = input.invoices.filter((invoice) => invoice.customerId === input.customerId);
  if (customerInvoices.length === 0) return null;

  const invoiceCurrency = customerInvoices[0]?.currency;
  if (!invoiceCurrency || invoiceCurrency !== minimum.value.currency) return null;

  const invoicedAmountMinor = sumInvoicesForCustomer(input.invoices, input.customerId);
  const shortfallMinor = minimum.value.amountMinor - invoicedAmountMinor;

  if (shortfallMinor <= 0) return null;

  return {
    id: `finding_minimum_${input.customerId}`,
    customerId: input.customerId,
    type: 'minimum_commitment_shortfall',
    title: 'Invoice total is below contractual minimum commitment',
    summary: `The approved minimum commitment is ${minimum.value.currency} ${minimum.value.amountMinor / 100}, but invoices total ${minimum.value.currency} ${invoicedAmountMinor / 100}.`,
    outcomeType: 'recoverable_leakage',
    estimatedAmount: {
      amountMinor: shortfallMinor,
      currency: minimum.value.currency
    },
    confidence: Math.min(0.95, minimum.confidence),
    status: 'draft',
    calculation: {
      formula: 'minimum_commitment - invoiced_amount',
      minimumCommitmentMinor: minimum.value.amountMinor,
      invoicedAmountMinor,
      shortfallMinor
    },
    citations: [minimum.citation, ...customerInvoices.map((invoice) => invoice.citation)]
  };
}

export function findUsageOverageUnbilled(input: {
  customerId: string;
  terms: ContractTerm[];
  usage: UsageRecord[];
  invoices: InvoiceRecord[];
}): LeakageFinding | null {
  const allowance = approvedTerm<{ metricName: string; quantity: number }>(input.terms, input.customerId, 'usage_allowance');
  const overagePrice = approvedTerm<{ amountMinor: number; currency: string; metricName: string }>(input.terms, input.customerId, 'overage_price');

  if (!allowance || !overagePrice) return null;
  if (allowance.value.metricName !== overagePrice.value.metricName) return null;

  const relevantUsage = input.usage.filter(
    (row) => row.customerId === input.customerId && row.metricName === allowance.value.metricName
  );
  if (relevantUsage.length === 0) return null;

  const totalUsage = relevantUsage.reduce((sum, row) => sum + row.quantity, 0);
  const overageQuantity = totalUsage - allowance.value.quantity;
  if (overageQuantity <= 0) return null;

  const expectedOverageMinor = Math.round(overageQuantity * overagePrice.value.amountMinor);
  const overageInvoiceRows = input.invoices.filter(
    (invoice) => invoice.customerId === input.customerId && /overage|usage/i.test(invoice.lineItem)
  );
  const billedOverageMinor = overageInvoiceRows.reduce((sum, invoice) => sum + invoice.amountMinor, 0);
  const unbilledMinor = expectedOverageMinor - billedOverageMinor;

  if (unbilledMinor <= 0) return null;

  return {
    id: `finding_usage_${input.customerId}`,
    customerId: input.customerId,
    type: 'usage_overage_unbilled',
    title: 'Usage exceeded allowance without full overage billing',
    summary: `Usage exceeded the allowance by ${overageQuantity} ${allowance.value.metricName}.`,
    outcomeType: 'recoverable_leakage',
    estimatedAmount: {
      amountMinor: unbilledMinor,
      currency: overagePrice.value.currency
    },
    confidence: Math.min(0.92, allowance.confidence, overagePrice.confidence),
    status: 'draft',
    calculation: {
      formula: '(usage - allowance) * overage_price - billed_overage',
      totalUsage,
      allowance: allowance.value.quantity,
      overageQuantity,
      overagePriceMinor: overagePrice.value.amountMinor,
      expectedOverageMinor,
      billedOverageMinor,
      unbilledMinor
    },
    citations: [allowance.citation, overagePrice.citation, ...relevantUsage.map((row) => row.citation), ...overageInvoiceRows.map((row) => row.citation)]
  };
}

export function findSeatUnderbilling(input: {
  customerId: string;
  terms: ContractTerm[];
  usage: UsageRecord[];
  invoices: InvoiceRecord[];
}): LeakageFinding | null {
  const seatPrice = approvedTerm<{ amountMinor: number; currency: string }>(input.terms, input.customerId, 'seat_price');
  if (!seatPrice) return null;

  const seatUsage = input.usage.filter((row) => row.customerId === input.customerId && /seat|user|license/i.test(row.metricName));
  if (seatUsage.length === 0) return null;

  const seatInvoiceRows = input.invoices.filter(
    (invoice) => invoice.customerId === input.customerId && /seat|user|license/i.test(invoice.lineItem)
  );
  if (seatInvoiceRows.length === 0) return null;

  const invoiceCurrency = seatInvoiceRows[0]?.currency;
  if (!invoiceCurrency || invoiceCurrency !== seatPrice.value.currency) return null;

  const actualSeats = Math.max(...seatUsage.map((row) => row.quantity));
  const billedSeats = seatInvoiceRows.reduce((sum, invoice) => sum + (invoice.quantity ?? 0), 0);
  const missingSeats = actualSeats - billedSeats;

  if (missingSeats <= 0) return null;

  const unbilledMinor = Math.round(missingSeats * seatPrice.value.amountMinor);

  return {
    id: `finding_seats_${input.customerId}`,
    customerId: input.customerId,
    type: 'seat_underbilling',
    title: 'Actual seats exceed billed seats',
    summary: `${actualSeats} seats were observed, but only ${billedSeats} seats were billed.`,
    outcomeType: 'recoverable_leakage',
    estimatedAmount: {
      amountMinor: unbilledMinor,
      currency: seatPrice.value.currency
    },
    confidence: Math.min(0.9, seatPrice.confidence),
    status: 'draft',
    calculation: {
      formula: '(actual_seats - billed_seats) * seat_price',
      actualSeats,
      billedSeats,
      missingSeats,
      seatPriceMinor: seatPrice.value.amountMinor,
      unbilledMinor
    },
    citations: [seatPrice.citation, ...seatUsage.map((row) => row.citation), ...seatInvoiceRows.map((row) => row.citation)]
  };
}

export function findExpiredDiscountStillApplied(input: {
  customerId: string;
  terms: ContractTerm[];
  invoices: InvoiceRecord[];
}): LeakageFinding | null {
  const discount = approvedTerm<{ percent: number }>(input.terms, input.customerId, 'discount');
  const discountExpiry = approvedTerm<{ date: string }>(input.terms, input.customerId, 'discount_expiry');
  if (!discount || !discountExpiry) return null;

  const expiryTime = Date.parse(`${discountExpiry.value.date}T00:00:00Z`);
  if (Number.isNaN(expiryTime)) return null;

  const discountRows = input.invoices.filter((invoice) => {
    const invoiceTime = Date.parse(`${invoice.invoiceDate}T00:00:00Z`);
    return (
      invoice.customerId === input.customerId &&
      invoiceTime > expiryTime &&
      (invoice.amountMinor < 0 || /discount|promo|promotional/i.test(invoice.lineItem))
    );
  });

  if (discountRows.length === 0) return null;

  const invoiceCurrency = discountRows[0]?.currency;
  if (!invoiceCurrency) return null;

  const stillAppliedMinor = discountRows.reduce((sum, invoice) => sum + Math.abs(invoice.amountMinor), 0);
  if (stillAppliedMinor <= 0) return null;

  return {
    id: `finding_discount_${input.customerId}`,
    customerId: input.customerId,
    type: 'expired_discount_still_applied',
    title: 'Expired discount still appears on invoices',
    summary: `A ${discount.value.percent}% discount expired on ${discountExpiry.value.date}, but discount invoice rows still appear after that date.`,
    outcomeType: 'prevented_future_leakage',
    estimatedAmount: {
      amountMinor: stillAppliedMinor,
      currency: invoiceCurrency
    },
    confidence: Math.min(0.88, discount.confidence, discountExpiry.confidence),
    status: 'draft',
    calculation: {
      formula: 'sum(abs(discount_invoice_rows_after_expiry))',
      discountPercent: discount.value.percent,
      expiryDate: discountExpiry.value.date,
      stillAppliedMinor
    },
    citations: [discount.citation, discountExpiry.citation, ...discountRows.map((row) => row.citation)]
  };
}

export function findMissedAnnualUplift(input: {
  customerId: string;
  terms: ContractTerm[];
  invoices: InvoiceRecord[];
}): LeakageFinding | null {
  const baseFee = approvedTerm<{ amountMinor: number; currency: string }>(input.terms, input.customerId, 'base_fee');
  const contractStart = approvedTerm<{ date: string }>(input.terms, input.customerId, 'contract_start_date');
  const annualUplift = approvedTerm<{ percent: number }>(input.terms, input.customerId, 'annual_uplift');
  if (!baseFee || !contractStart || !annualUplift) return null;

  const anniversary = addYears(contractStart.value.date, 1);
  if (!anniversary) return null;

  const postAnniversaryInvoices = input.invoices.filter((invoice) => {
    const invoiceTime = Date.parse(`${invoice.invoiceDate}T00:00:00Z`);
    return invoice.customerId === input.customerId && invoiceTime >= anniversary.getTime() && /platform|subscription|fee/i.test(invoice.lineItem);
  });

  if (postAnniversaryInvoices.length === 0) return null;

  const expectedAmountMinor = Math.round(baseFee.value.amountMinor * (1 + annualUplift.value.percent / 100));
  const shortfalls = postAnniversaryInvoices
    .map((invoice) => ({
      invoice,
      shortfallMinor: expectedAmountMinor - invoice.amountMinor
    }))
    .filter((row) => row.shortfallMinor > 0 && row.invoice.currency === baseFee.value.currency);

  if (shortfalls.length === 0) return null;

  const missedUpliftMinor = shortfalls.reduce((sum, row) => sum + row.shortfallMinor, 0);

  return {
    id: `finding_uplift_${input.customerId}`,
    customerId: input.customerId,
    type: 'missed_annual_uplift',
    title: 'Annual uplift was not reflected in invoice pricing',
    summary: `The contract calls for a ${annualUplift.value.percent}% annual uplift after ${contractStart.value.date}.`,
    outcomeType: 'recoverable_leakage',
    estimatedAmount: {
      amountMinor: missedUpliftMinor,
      currency: baseFee.value.currency
    },
    confidence: Math.min(0.88, baseFee.confidence, contractStart.confidence, annualUplift.confidence),
    status: 'draft',
    calculation: {
      formula: 'expected_post_uplift_fee - invoiced_fee',
      baseFeeMinor: baseFee.value.amountMinor,
      upliftPercent: annualUplift.value.percent,
      expectedAmountMinor,
      missedUpliftMinor
    },
    citations: [
      baseFee.citation,
      contractStart.citation,
      annualUplift.citation,
      ...shortfalls.map((row) => row.invoice.citation)
    ]
  };
}

export function findRenewalWindowRisk(input: {
  customerId: string;
  terms: ContractTerm[];
  asOfDate?: string;
}): LeakageFinding | null {
  const contractEnd = approvedTerm<{ date: string }>(input.terms, input.customerId, 'contract_end_date');
  const noticePeriod = approvedTerm<{ days: number }>(input.terms, input.customerId, 'notice_period');
  if (!contractEnd || !noticePeriod) return null;

  const endDate = parseUtcDate(contractEnd.value.date);
  const asOfDate = parseUtcDate(input.asOfDate ?? new Date().toISOString().slice(0, 10));
  if (!endDate || !asOfDate) return null;

  const noticeDeadline = new Date(endDate);
  noticeDeadline.setUTCDate(noticeDeadline.getUTCDate() - noticePeriod.value.days);
  const daysUntilDeadline = Math.ceil((noticeDeadline.getTime() - asOfDate.getTime()) / 86_400_000);
  if (daysUntilDeadline > 30) return null;

  return {
    id: `finding_renewal_${input.customerId}`,
    customerId: input.customerId,
    type: 'renewal_window_risk',
    title: daysUntilDeadline < 0 ? 'Renewal notice deadline may have been missed' : 'Renewal notice deadline is approaching',
    summary: `The contract ends on ${contractEnd.value.date} with ${noticePeriod.value.days} days notice required.`,
    outcomeType: 'risk_alert',
    estimatedAmount: {
      amountMinor: 0,
      currency: 'USD'
    },
    confidence: Math.min(0.86, contractEnd.confidence, noticePeriod.confidence),
    status: 'needs_review',
    calculation: {
      formula: 'contract_end_date - notice_period_days',
      contractEndDate: contractEnd.value.date,
      noticePeriodDays: noticePeriod.value.days,
      noticeDeadline: noticeDeadline.toISOString().slice(0, 10),
      daysUntilDeadline
    },
    citations: [contractEnd.citation, noticePeriod.citation]
  };
}

export function findAmendmentConflict(input: {
  customerId: string;
  terms: ContractTerm[];
}): LeakageFinding | null {
  const amendment = approvedTerm<{ supersedes?: string; effectiveDate?: string }>(input.terms, input.customerId, 'amendment');
  if (!amendment?.value.supersedes) return null;

  const original = input.terms.find(
    (term) =>
      term.customerId === input.customerId &&
      term.type === amendment.value.supersedes &&
      ['approved', 'edited'].includes(term.reviewStatus)
  );
  if (!original) return null;

  return {
    id: `finding_amendment_${input.customerId}_${amendment.value.supersedes}`,
    customerId: input.customerId,
    type: 'amendment_conflict',
    title: 'Potential amendment conflict requires human review',
    summary: `A later amendment may supersede the approved ${amendment.value.supersedes.replaceAll('_', ' ')} term.`,
    outcomeType: 'risk_alert',
    estimatedAmount: {
      amountMinor: 0,
      currency: 'USD'
    },
    confidence: Math.min(0.82, original.confidence, amendment.confidence),
    status: 'needs_review',
    calculation: {
      formula: 'compare_original_term_to_later_amendment',
      supersededTermType: amendment.value.supersedes,
      amendmentEffectiveDate: amendment.value.effectiveDate
    },
    citations: [original.citation, amendment.citation]
  };
}

export function reconcileLeakage(input: {
  customerId: string;
  terms: ContractTerm[];
  invoices: InvoiceRecord[];
  usage: UsageRecord[];
}): LeakageFinding[] {
  return [
    findMinimumCommitmentShortfall(input),
    findUsageOverageUnbilled(input),
    findSeatUnderbilling(input),
    findExpiredDiscountStillApplied(input),
    findMissedAnnualUplift(input),
    findRenewalWindowRisk(input),
    findAmendmentConflict(input)
  ].filter((finding): finding is LeakageFinding => Boolean(finding));
}

function addYears(date: string, years: number): Date | null {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setUTCFullYear(parsed.getUTCFullYear() + years);
  return parsed;
}

function parseUtcDate(date: string): Date | null {
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
