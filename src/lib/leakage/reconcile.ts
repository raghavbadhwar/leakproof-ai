import type { ContractTerm, InvoiceRecord, LeakageFinding, UsageRecord } from './types';

type BillingFrequency = 'monthly' | 'quarterly' | 'annual' | 'one_time';

type BillingPeriod = {
  key: string;
  label: string;
  startDate: string;
  endDate: string;
};

type PeriodAmount = {
  period: BillingPeriod;
  amountMinor: number;
  invoices: InvoiceRecord[];
};

type InvoicePaymentTermsEvidence = {
  days: number;
  source: 'payment_terms_days' | 'due_date' | 'line_item_text';
};

const APPROVED_STATUSES: Array<ContractTerm['reviewStatus']> = ['approved', 'edited'];
const MS_PER_DAY = 86_400_000;

function approvedTerm<T>(terms: ContractTerm[], customerId: string, type: ContractTerm['type']): (ContractTerm & { value: T }) | undefined {
  return terms.find((term) => term.customerId === customerId && term.type === type && APPROVED_STATUSES.includes(term.reviewStatus)) as
    | (ContractTerm & { value: T })
    | undefined;
}

export function findMinimumCommitmentShortfall(input: {
  customerId: string;
  terms: ContractTerm[];
  invoices: InvoiceRecord[];
}): LeakageFinding | null {
  const minimum = approvedTerm<{ amountMinor: number; currency: string; frequency?: string; period?: string; billingFrequency?: string }>(
    input.terms,
    input.customerId,
    'minimum_commitment'
  );
  if (!minimum || !isIntegerMoney(minimum.value.amountMinor)) return null;

  const frequency = billingFrequencyFor(input.terms, input.customerId, [minimum.value], 'monthly');
  const contractStart = approvedTerm<{ date: string }>(input.terms, input.customerId, 'contract_start_date');
  const customerInvoices = input.invoices.filter(
    (invoice) => invoice.customerId === input.customerId && invoice.currency === minimum.value.currency && isBillableMoneyInvoiceRow(invoice)
  );
  if (customerInvoices.length === 0) return null;

  const periodAmounts = groupInvoiceAmountsByPeriod(customerInvoices, frequency, contractStart?.value.date);
  const periodShortfalls = periodAmounts
    .map((bucket) => ({
      period: bucket.period,
      invoicedAmountMinor: bucket.amountMinor,
      shortfallMinor: minimum.value.amountMinor - bucket.amountMinor,
      invoiceIds: bucket.invoices.map((invoice) => invoice.id)
    }))
    .filter((row) => row.shortfallMinor > 0);

  if (periodShortfalls.length === 0) return null;

  const shortfallMinor = sumMinor(periodShortfalls.map((row) => row.shortfallMinor));
  const shortfallInvoiceIds = new Set(periodShortfalls.flatMap((row) => row.invoiceIds));
  const citedInvoices = customerInvoices.filter((invoice) => shortfallInvoiceIds.has(invoice.id));

  return recoverableFinding({
    id: `finding_minimum_${input.customerId}`,
    customerId: input.customerId,
    type: 'minimum_commitment_shortfall',
    title: 'Invoice total is below contractual minimum commitment',
    summary: `The approved ${frequencyLabel(frequency)} minimum commitment was underbilled in ${periodShortfalls.length} billing period(s).`,
    outcomeType: 'recoverable_leakage',
    estimatedAmount: {
      amountMinor: shortfallMinor,
      currency: minimum.value.currency
    },
    confidence: Math.min(0.95, minimum.confidence),
    status: 'draft',
    calculation: {
      formula: 'period_minimum_commitment - period_invoiced_amount',
      financeAssumption: 'Billing periods do not offset each other unless an approved carry-forward term exists.',
      billingFrequency: frequency,
      minimumCommitmentMinor: minimum.value.amountMinor,
      periodShortfalls,
      shortfallMinor
    },
    citations: [minimum.citation, ...citedInvoices.map((invoice) => invoice.citation)]
  });
}

export function findUsageOverageUnbilled(input: {
  customerId: string;
  terms: ContractTerm[];
  usage: UsageRecord[];
  invoices: InvoiceRecord[];
}): LeakageFinding | null {
  const allowance = approvedTerm<{ metricName: string; quantity: number; frequency?: string; period?: string }>(
    input.terms,
    input.customerId,
    'usage_allowance'
  );
  const overagePrice = approvedTerm<{ amountMinor: number; currency: string; metricName: string; frequency?: string; period?: string }>(
    input.terms,
    input.customerId,
    'overage_price'
  );

  if (!allowance || !overagePrice || !isIntegerMoney(overagePrice.value.amountMinor)) return null;
  if (allowance.value.metricName !== overagePrice.value.metricName) return null;

  const frequency = billingFrequencyFor(input.terms, input.customerId, [allowance.value, overagePrice.value], 'monthly');
  const contractStart = approvedTerm<{ date: string }>(input.terms, input.customerId, 'contract_start_date');
  const relevantUsage = input.usage.filter(
    (row) => row.customerId === input.customerId && row.metricName === allowance.value.metricName
  );
  if (relevantUsage.length === 0) return null;

  const usageByPeriod = groupUsageByPeriod(relevantUsage, frequency, contractStart?.value.date);
  const overageInvoiceRows = input.invoices.filter(
    (invoice) =>
      invoice.customerId === input.customerId &&
      invoice.currency === overagePrice.value.currency &&
      isBillableMoneyInvoiceRow(invoice) &&
      /overage|usage/i.test(invoice.lineItem)
  );
  const billedOverageByPeriod = groupInvoiceAmountsByPeriod(overageInvoiceRows, frequency, contractStart?.value.date);
  const billedByKey = new Map(billedOverageByPeriod.map((bucket) => [bucket.period.key, bucket]));

  const periodShortfalls = Array.from(usageByPeriod.values())
    .map((bucket) => {
      const overageQuantity = bucket.quantity - allowance.value.quantity;
      const expectedOverageMinor = overageQuantity > 0 ? multiplyMinorByDecimalQuantity(overagePrice.value.amountMinor, overageQuantity) : 0;
      const billedBucket = billedByKey.get(bucket.period.key);
      const billedOverageMinor = billedBucket?.amountMinor ?? 0;
      return {
        period: bucket.period,
        totalUsage: bucket.quantity,
        allowance: allowance.value.quantity,
        overageQuantity,
        expectedOverageMinor,
        billedOverageMinor,
        unbilledMinor: expectedOverageMinor - billedOverageMinor,
        usageIds: bucket.rows.map((row) => row.id),
        invoiceIds: billedBucket?.invoices.map((invoice) => invoice.id) ?? []
      };
    })
    .filter((row) => row.overageQuantity > 0 && row.unbilledMinor > 0);

  if (periodShortfalls.length === 0) return null;

  const unbilledMinor = sumMinor(periodShortfalls.map((row) => row.unbilledMinor));
  const citedUsageIds = new Set(periodShortfalls.flatMap((row) => row.usageIds));
  const citedInvoiceIds = new Set(periodShortfalls.flatMap((row) => row.invoiceIds));
  const citedUsage = relevantUsage.filter((row) => citedUsageIds.has(row.id));
  const citedInvoices = overageInvoiceRows.filter((invoice) => citedInvoiceIds.has(invoice.id));

  return recoverableFinding({
    id: `finding_usage_${input.customerId}`,
    customerId: input.customerId,
    type: 'usage_overage_unbilled',
    title: 'Usage exceeded allowance without full overage billing',
    summary: `Usage exceeded the allowance in ${periodShortfalls.length} billing period(s).`,
    outcomeType: 'recoverable_leakage',
    estimatedAmount: {
      amountMinor: unbilledMinor,
      currency: overagePrice.value.currency
    },
    confidence: Math.min(0.92, allowance.confidence, overagePrice.confidence),
    status: 'draft',
    calculation: {
      formula: 'sum_by_period(max(usage - allowance, 0) * overage_price - billed_overage)',
      financeAssumption: 'Overage is reconciled per billing period; another period cannot offset an unbilled overage.',
      billingFrequency: frequency,
      overagePriceMinor: overagePrice.value.amountMinor,
      periodShortfalls,
      unbilledMinor
    },
    citations: [allowance.citation, overagePrice.citation, ...citedUsage.map((row) => row.citation), ...citedInvoices.map((row) => row.citation)]
  });
}

export function findSeatUnderbilling(input: {
  customerId: string;
  terms: ContractTerm[];
  usage: UsageRecord[];
  invoices: InvoiceRecord[];
}): LeakageFinding | null {
  const seatPrice = approvedTerm<{ amountMinor: number; currency: string; frequency?: string; period?: string }>(
    input.terms,
    input.customerId,
    'seat_price'
  );
  if (!seatPrice || !isIntegerMoney(seatPrice.value.amountMinor)) return null;

  const frequency = billingFrequencyFor(input.terms, input.customerId, [seatPrice.value], 'monthly');
  const contractStart = approvedTerm<{ date: string }>(input.terms, input.customerId, 'contract_start_date');
  const seatUsage = input.usage.filter((row) => row.customerId === input.customerId && /seat|user|license/i.test(row.metricName));
  if (seatUsage.length === 0) return null;

  const seatInvoiceRows = input.invoices.filter(
    (invoice) =>
      invoice.customerId === input.customerId &&
      invoice.currency === seatPrice.value.currency &&
      isSeatBillingEvidenceRow(invoice) &&
      /seat|user|license/i.test(invoice.lineItem)
  );
  if (seatInvoiceRows.length === 0) return null;

  const usageByPeriod = groupUsageByPeriod(seatUsage, frequency, contractStart?.value.date);
  const invoiceQuantityByPeriod = groupInvoiceQuantitiesByPeriod(seatInvoiceRows, frequency, contractStart?.value.date);

  const periodShortfalls = Array.from(usageByPeriod.values())
    .map((bucket) => {
      const actualSeats = Math.max(...bucket.rows.map((row) => row.quantity));
      const billedBucket = invoiceQuantityByPeriod.get(bucket.period.key);
      const billedSeats = billedBucket?.quantity ?? 0;
      const missingSeats = actualSeats - billedSeats;
      return {
        period: bucket.period,
        actualSeats,
        billedSeats,
        missingSeats,
        unbilledMinor: missingSeats > 0 ? multiplyMinorByDecimalQuantity(seatPrice.value.amountMinor, missingSeats) : 0,
        usageIds: bucket.rows.map((row) => row.id),
        invoiceIds: billedBucket?.invoices.map((invoice) => invoice.id) ?? []
      };
    })
    .filter((row) => row.missingSeats > 0 && row.invoiceIds.length > 0);

  if (periodShortfalls.length === 0) return null;

  const unbilledMinor = sumMinor(periodShortfalls.map((row) => row.unbilledMinor));
  const citedUsageIds = new Set(periodShortfalls.flatMap((row) => row.usageIds));
  const citedInvoiceIds = new Set(periodShortfalls.flatMap((row) => row.invoiceIds));
  const citedUsage = seatUsage.filter((row) => citedUsageIds.has(row.id));
  const citedInvoices = seatInvoiceRows.filter((invoice) => citedInvoiceIds.has(invoice.id));

  return recoverableFinding({
    id: `finding_seats_${input.customerId}`,
    customerId: input.customerId,
    type: 'seat_underbilling',
    title: 'Actual seats exceed billed seats',
    summary: `Actual seats exceeded billed seats in ${periodShortfalls.length} billing period(s).`,
    outcomeType: 'recoverable_leakage',
    estimatedAmount: {
      amountMinor: unbilledMinor,
      currency: seatPrice.value.currency
    },
    confidence: Math.min(0.9, seatPrice.confidence),
    status: 'draft',
    calculation: {
      formula: 'sum_by_period((actual_seats - billed_seats) * seat_price)',
      financeAssumption: 'Seat counts are reconciled inside each service period; later invoices do not cure earlier underbilling.',
      billingFrequency: frequency,
      seatPriceMinor: seatPrice.value.amountMinor,
      periodShortfalls,
      unbilledMinor
    },
    citations: [seatPrice.citation, ...citedUsage.map((row) => row.citation), ...citedInvoices.map((row) => row.citation)]
  });
}

export function findExpiredDiscountStillApplied(input: {
  customerId: string;
  terms: ContractTerm[];
  invoices: InvoiceRecord[];
}): LeakageFinding | null {
  const discount = approvedTerm<{ percent: number }>(input.terms, input.customerId, 'discount');
  const discountExpiry = approvedTerm<{ date: string }>(input.terms, input.customerId, 'discount_expiry');
  if (!discount || !discountExpiry) return null;

  const expiryDate = parseUtcDate(discountExpiry.value.date);
  if (!expiryDate) return null;

  const discountRows = input.invoices.filter((invoice) => {
    const invoiceEffectiveDate = parseUtcDate(invoicePeriodDate(invoice));
    return (
      invoice.customerId === input.customerId &&
      invoiceEffectiveDate !== null &&
      invoiceEffectiveDate.getTime() > expiryDate.getTime() &&
      isIntegerMoney(invoice.amountMinor) &&
      (invoice.amountMinor < 0 || /discount|promo|promotional/i.test(invoice.lineItem))
    );
  });

  if (discountRows.length === 0) return null;

  const invoiceCurrency = discountRows[0]?.currency;
  if (!invoiceCurrency || discountRows.some((row) => row.currency !== invoiceCurrency)) return null;

  const stillAppliedMinor = sumMinor(discountRows.map((invoice) => Math.abs(invoice.amountMinor)));
  if (stillAppliedMinor <= 0) return null;

  return recoverableFinding({
    id: `finding_discount_${input.customerId}`,
    customerId: input.customerId,
    type: 'expired_discount_still_applied',
    title: 'Expired discount still appears on invoices',
    summary: `A ${discount.value.percent}% discount expired on ${discountExpiry.value.date}, but discount invoice rows still appear after that date.`,
    outcomeType: 'recoverable_leakage',
    estimatedAmount: {
      amountMinor: stillAppliedMinor,
      currency: invoiceCurrency
    },
    confidence: Math.min(0.88, discount.confidence, discountExpiry.confidence),
    status: 'draft',
    calculation: {
      formula: 'sum(abs(discount_invoice_rows_after_expiry))',
      financeAssumption: 'A discount row with a service period start after expiry is treated as recoverable leakage.',
      discountPercent: discount.value.percent,
      expiryDate: discountExpiry.value.date,
      stillAppliedMinor
    },
    citations: [discount.citation, discountExpiry.citation, ...discountRows.map((row) => row.citation)]
  });
}

export function findMissedAnnualUplift(input: {
  customerId: string;
  terms: ContractTerm[];
  invoices: InvoiceRecord[];
}): LeakageFinding | null {
  const baseFee = approvedTerm<{ amountMinor: number; currency: string; frequency?: string; period?: string }>(input.terms, input.customerId, 'base_fee');
  const contractStart = approvedTerm<{ date: string }>(input.terms, input.customerId, 'contract_start_date');
  const annualUplift = approvedTerm<{ percent: number }>(input.terms, input.customerId, 'annual_uplift');
  if (!baseFee || !contractStart || !annualUplift || !isIntegerMoney(baseFee.value.amountMinor)) return null;

  const anniversary = addYears(contractStart.value.date, 1);
  if (!anniversary) return null;

  const frequency = billingFrequencyFor(input.terms, input.customerId, [baseFee.value], 'monthly');
  if (frequency === 'one_time') return null;

  const postAnniversaryInvoices = input.invoices.filter((invoice) => {
    const invoiceEffectiveDate = parseUtcDate(invoicePeriodDate(invoice));
    return (
      invoice.customerId === input.customerId &&
      invoice.currency === baseFee.value.currency &&
      invoiceEffectiveDate !== null &&
      invoiceEffectiveDate.getTime() >= anniversary.getTime() &&
      isBillableMoneyInvoiceRow(invoice) &&
      isRecurringUpliftInvoiceRow(invoice)
    );
  });

  if (postAnniversaryInvoices.length === 0) return null;

  const expectedAmountMinor = applyPercentIncreaseMinor(baseFee.value.amountMinor, annualUplift.value.percent);
  const periodAmounts = groupInvoiceAmountsByPeriod(postAnniversaryInvoices, frequency, contractStart.value.date);
  const periodShortfalls = periodAmounts
    .map((bucket) => ({
      period: bucket.period,
      expectedAmountMinor,
      invoicedAmountMinor: bucket.amountMinor,
      shortfallMinor: expectedAmountMinor - bucket.amountMinor,
      invoiceIds: bucket.invoices.map((invoice) => invoice.id)
    }))
    .filter((row) => row.shortfallMinor > 0);

  if (periodShortfalls.length === 0) return null;

  const missedUpliftMinor = sumMinor(periodShortfalls.map((row) => row.shortfallMinor));
  const citedInvoiceIds = new Set(periodShortfalls.flatMap((row) => row.invoiceIds));
  const citedInvoices = postAnniversaryInvoices.filter((invoice) => citedInvoiceIds.has(invoice.id));

  return recoverableFinding({
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
      formula: 'sum_by_period(expected_post_uplift_fee - invoiced_fee)',
      financeAssumption: 'Annual uplift is applied to each post-anniversary billing period.',
      billingFrequency: frequency,
      baseFeeMinor: baseFee.value.amountMinor,
      upliftPercent: annualUplift.value.percent,
      expectedAmountMinor,
      periodShortfalls,
      missedUpliftMinor
    },
    citations: [
      baseFee.citation,
      contractStart.citation,
      annualUplift.citation,
      ...citedInvoices.map((row) => row.citation)
    ]
  });
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
  const daysUntilDeadline = Math.ceil((noticeDeadline.getTime() - asOfDate.getTime()) / MS_PER_DAY);
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

export function findPaymentTermsMismatch(input: {
  customerId: string;
  terms: ContractTerm[];
  invoices: InvoiceRecord[];
}): LeakageFinding | null {
  const paymentTerms = approvedTerm<{ days?: number; netDays?: number; dueDays?: number } | string>(
    input.terms,
    input.customerId,
    'payment_terms'
  );
  if (!paymentTerms) return null;

  const expectedDays = paymentTermDays(paymentTerms.value);
  if (expectedDays === null) return null;

  const mismatchedInvoices = input.invoices
    .filter((invoice) => invoice.customerId === input.customerId && !isCreditOrRefundInvoiceRow(invoice))
    .map((invoice) => ({ invoice, termsEvidence: invoicePaymentTermsEvidence(invoice) }))
    .filter(
      (
        row
      ): row is {
        invoice: InvoiceRecord;
        termsEvidence: NonNullable<ReturnType<typeof invoicePaymentTermsEvidence>>;
      } => row.termsEvidence !== null && row.termsEvidence.days !== expectedDays
    );

  if (mismatchedInvoices.length === 0) return null;

  return {
    id: `finding_payment_terms_${input.customerId}`,
    customerId: input.customerId,
    type: 'payment_terms_mismatch',
    title: 'Invoice payment terms do not match the contract',
    summary: `Contract payment terms are Net ${expectedDays}, but ${mismatchedInvoices.length} invoice row(s) reference different terms.`,
    outcomeType: 'risk_alert',
    estimatedAmount: {
      amountMinor: 0,
      currency: mismatchedInvoices[0]?.invoice.currency ?? 'USD'
    },
    confidence: Math.min(0.84, paymentTerms.confidence),
    status: 'needs_review',
    calculation: {
      formula: 'invoice_payment_terms_days != contract_payment_terms_days',
      contractPaymentTermsDays: expectedDays,
      mismatches: mismatchedInvoices.map((row) => ({
        invoiceId: row.invoice.invoiceId,
        invoiceTermsDays: row.termsEvidence.days,
        evidenceSource: row.termsEvidence.source,
        dueDate: row.invoice.dueDate,
        paidAt: row.invoice.paidAt,
        paidDays: invoicePaidDays(row.invoice)
      }))
    },
    citations: [paymentTerms.citation, ...mismatchedInvoices.map((row) => row.invoice.citation)]
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
      APPROVED_STATUSES.includes(term.reviewStatus)
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
    findPaymentTermsMismatch(input),
    findAmendmentConflict(input)
  ]
    .filter((finding): finding is LeakageFinding => Boolean(finding))
    .filter(isReportableFinding);
}

function recoverableFinding(finding: LeakageFinding): LeakageFinding | null {
  return isReportableFinding(finding) ? finding : null;
}

function isReportableFinding(finding: LeakageFinding): boolean {
  if (finding.outcomeType !== 'recoverable_leakage') return true;
  return (
    finding.estimatedAmount.amountMinor > 0 &&
    finding.citations.some((citation) => citation.sourceType === 'invoice' || citation.sourceType === 'usage')
  );
}

function billingFrequencyFor(
  terms: ContractTerm[],
  customerId: string,
  candidates: unknown[],
  fallback: BillingFrequency
): BillingFrequency {
  for (const candidate of candidates) {
    const frequency = normalizeBillingFrequency(candidate);
    if (frequency) return frequency;
  }

  const billingTerm = approvedTerm<unknown>(terms, customerId, 'billing_frequency');
  return normalizeBillingFrequency(billingTerm?.value) ?? fallback;
}

function normalizeBillingFrequency(value: unknown): BillingFrequency | null {
  if (typeof value === 'string') return normalizeFrequencyText(value);
  if (!value || typeof value !== 'object') return null;

  const record = value as Record<string, unknown>;
  return (
    normalizeFrequencyText(record.frequency) ??
    normalizeFrequencyText(record.billingFrequency) ??
    normalizeFrequencyText(record.billing_frequency) ??
    normalizeFrequencyText(record.period) ??
    null
  );
}

function normalizeFrequencyText(value: unknown): BillingFrequency | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replaceAll('-', '_').replaceAll(' ', '_');
  if (['month', 'monthly', 'per_month'].includes(normalized)) return 'monthly';
  if (['quarter', 'quarterly', 'per_quarter'].includes(normalized)) return 'quarterly';
  if (['year', 'yearly', 'annual', 'annually', 'per_year'].includes(normalized)) return 'annual';
  if (['one_time', 'oneoff', 'one_off', 'once'].includes(normalized)) return 'one_time';
  return null;
}

function groupInvoiceAmountsByPeriod(invoices: InvoiceRecord[], frequency: BillingFrequency, contractStartDate?: string): PeriodAmount[] {
  const buckets = new Map<string, PeriodAmount>();
  for (const invoice of invoices) {
    const period = periodForDate(invoicePeriodDate(invoice), frequency, contractStartDate);
    if (!period) continue;

    const bucket = buckets.get(period.key) ?? { period, amountMinor: 0, invoices: [] };
    bucket.amountMinor = addMinor(bucket.amountMinor, invoice.amountMinor);
    bucket.invoices.push(invoice);
    buckets.set(period.key, bucket);
  }

  return Array.from(buckets.values()).sort((a, b) => a.period.startDate.localeCompare(b.period.startDate));
}

function groupInvoiceQuantitiesByPeriod(
  invoices: InvoiceRecord[],
  frequency: BillingFrequency,
  contractStartDate?: string
): Map<string, { period: BillingPeriod; quantity: number; invoices: InvoiceRecord[] }> {
  const buckets = new Map<string, { period: BillingPeriod; quantity: number; invoices: InvoiceRecord[] }>();
  for (const invoice of invoices) {
    const period = periodForDate(invoicePeriodDate(invoice), frequency, contractStartDate);
    if (!period) continue;

    const bucket = buckets.get(period.key) ?? { period, quantity: 0, invoices: [] };
    bucket.quantity += invoice.quantity ?? 0;
    bucket.invoices.push(invoice);
    buckets.set(period.key, bucket);
  }
  return buckets;
}

function groupUsageByPeriod(
  usage: UsageRecord[],
  frequency: BillingFrequency,
  contractStartDate?: string
): Map<string, { period: BillingPeriod; quantity: number; rows: UsageRecord[] }> {
  const buckets = new Map<string, { period: BillingPeriod; quantity: number; rows: UsageRecord[] }>();
  for (const row of usage) {
    const period = periodForDate(row.periodStart, frequency, contractStartDate);
    if (!period) continue;

    const bucket = buckets.get(period.key) ?? { period, quantity: 0, rows: [] };
    bucket.quantity += row.quantity;
    bucket.rows.push(row);
    buckets.set(period.key, bucket);
  }
  return buckets;
}

function invoicePeriodDate(invoice: InvoiceRecord): string {
  return invoice.servicePeriodStart ?? invoice.servicePeriodEnd ?? invoice.invoiceDate;
}

function isBillableMoneyInvoiceRow(invoice: InvoiceRecord): boolean {
  return isIntegerMoney(invoice.amountMinor) && invoice.amountMinor > 0 && !isCreditOrRefundInvoiceRow(invoice);
}

function isSeatBillingEvidenceRow(invoice: InvoiceRecord): boolean {
  return !isCreditOrRefundInvoiceRow(invoice) && (invoice.quantity ?? 0) > 0;
}

function isCreditOrRefundInvoiceRow(invoice: InvoiceRecord): boolean {
  return /\b(credit[-\s]*note|credit[-\s]*memo|refund|reversal|write[-\s]?off)\b/i.test(invoice.lineItem);
}

function isRecurringUpliftInvoiceRow(invoice: InvoiceRecord): boolean {
  if (/\b(one[-\s]?time|one[-\s]?off|setup|implementation|onboarding|professional services)\b/i.test(invoice.lineItem)) {
    return false;
  }

  return /\b(platform|subscription|recurring|monthly|annual|license|base\s*fee|uplift|escalation|price\s*increase|fee)\b/i.test(invoice.lineItem);
}

function periodForDate(date: string, frequency: BillingFrequency, contractStartDate?: string): BillingPeriod | null {
  const parsed = parseUtcDate(date);
  if (!parsed) return null;

  // Finance assumption: one-time charges are reconciled as one bucket because there is no recurring period to offset.
  if (frequency === 'one_time') {
    return { key: 'one_time', label: 'One-time', startDate: date, endDate: date };
  }

  if (frequency === 'monthly') {
    const start = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1));
    const end = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 0));
    return periodFromDates('month', start, end);
  }

  if (frequency === 'quarterly') {
    const quarterStartMonth = Math.floor(parsed.getUTCMonth() / 3) * 3;
    const start = new Date(Date.UTC(parsed.getUTCFullYear(), quarterStartMonth, 1));
    const end = new Date(Date.UTC(parsed.getUTCFullYear(), quarterStartMonth + 3, 0));
    return periodFromDates('quarter', start, end);
  }

  const contractStart = contractStartDate ? parseUtcDate(contractStartDate) : null;
  if (contractStart) {
    const start = annualPeriodStartForDate(parsed, contractStart);
    const end = new Date(start);
    end.setUTCFullYear(end.getUTCFullYear() + 1);
    end.setUTCDate(end.getUTCDate() - 1);
    return periodFromDates('annual', start, end);
  }

  const start = new Date(Date.UTC(parsed.getUTCFullYear(), 0, 1));
  const end = new Date(Date.UTC(parsed.getUTCFullYear(), 11, 31));
  return periodFromDates('annual', start, end);
}

function periodFromDates(prefix: string, start: Date, end: Date): BillingPeriod {
  const startDate = formatDate(start);
  const endDate = formatDate(end);
  return {
    key: `${prefix}:${startDate}:${endDate}`,
    label: `${startDate} to ${endDate}`,
    startDate,
    endDate
  };
}

function annualPeriodStartForDate(date: Date, contractStart: Date): Date {
  // Annual terms use the contract anniversary year when start-date evidence exists; otherwise callers use calendar years.
  let start = new Date(Date.UTC(date.getUTCFullYear(), contractStart.getUTCMonth(), contractStart.getUTCDate()));
  if (start.getTime() > date.getTime()) {
    start = new Date(Date.UTC(date.getUTCFullYear() - 1, contractStart.getUTCMonth(), contractStart.getUTCDate()));
  }
  return start;
}

function paymentTermDays(value: { days?: number; netDays?: number; dueDays?: number } | string): number | null {
  if (typeof value === 'string') return daysFromText(value);
  return firstInteger(value.days, value.netDays, value.dueDays);
}

function invoicePaymentTermsEvidence(invoice: InvoiceRecord): InvoicePaymentTermsEvidence | null {
  const explicitDays = firstInteger(invoice.paymentTermsDays);
  if (explicitDays !== null) return { days: explicitDays, source: 'payment_terms_days' };

  const dueDateDays = invoiceDueDateDays(invoice);
  if (dueDateDays !== null) return { days: dueDateDays, source: 'due_date' };

  const textDays = daysFromText(invoice.lineItem);
  return textDays === null ? null : { days: textDays, source: 'line_item_text' };
}

function invoiceDueDateDays(invoice: InvoiceRecord): number | null {
  if (!invoice.dueDate) return null;
  return daysBetweenDates(invoice.invoiceDate, invoice.dueDate);
}

function invoicePaidDays(invoice: InvoiceRecord): number | undefined {
  if (!invoice.paidAt) return undefined;
  return daysBetweenDates(invoice.invoiceDate, invoice.paidAt) ?? undefined;
}

function daysBetweenDates(startDate: string, endDate: string): number | null {
  const start = parseUtcDate(startDate);
  const end = parseUtcDate(endDate);
  if (!start || !end) return null;

  const days = (end.getTime() - start.getTime()) / MS_PER_DAY;
  if (!Number.isInteger(days) || days < 0) return null;
  return days;
}

function daysFromText(value: string): number | null {
  const match = value.match(/\bnet\s*(\d{1,3})\b/i) ?? value.match(/\bdue\s*(?:in|within)?\s*(\d{1,3})\s*days?\b/i);
  if (!match?.[1]) return null;
  return Number.parseInt(match[1], 10);
}

function firstInteger(...values: Array<number | undefined>): number | null {
  for (const value of values) {
    if (value !== undefined && Number.isInteger(value) && value >= 0) return value;
  }
  return null;
}

function addYears(date: string, years: number): Date | null {
  const parsed = parseUtcDate(date);
  if (!parsed) return null;
  parsed.setUTCFullYear(parsed.getUTCFullYear() + years);
  return parsed;
}

function parseUtcDate(date: string): Date | null {
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function frequencyLabel(frequency: BillingFrequency): string {
  if (frequency === 'one_time') return 'one-time';
  return frequency;
}

function isIntegerMoney(amountMinor: number): boolean {
  return Number.isSafeInteger(amountMinor);
}

function addMinor(left: number, right: number): number {
  const sum = left + right;
  if (!Number.isSafeInteger(sum)) {
    throw new Error('Money calculation exceeded safe integer range.');
  }
  return sum;
}

function sumMinor(values: number[]): number {
  return values.reduce((sum, value) => addMinor(sum, value), 0);
}

function multiplyMinorByDecimalQuantity(amountMinor: number, quantity: number): number {
  const quantityText = String(quantity);
  if (!/^-?\d+(\.\d+)?$/.test(quantityText)) return 0;
  const [whole, fraction = ''] = quantityText.split('.');
  const scale = 10n ** BigInt(fraction.length);
  const units = BigInt(whole) * scale + BigInt(fraction || '0') * BigInt(quantity < 0 ? -1 : 1);
  const numerator = BigInt(amountMinor) * units;
  return Number(roundDiv(numerator, scale));
}

function applyPercentIncreaseMinor(amountMinor: number, percent: number): number {
  const basisPoints = decimalPercentToBasisPoints(percent);
  const upliftMinor = roundDiv(BigInt(amountMinor) * BigInt(basisPoints), 10_000n);
  return Number(BigInt(amountMinor) + upliftMinor);
}

function decimalPercentToBasisPoints(percent: number): number {
  const text = String(percent);
  if (!/^-?\d+(\.\d+)?$/.test(text)) return 0;
  const negative = text.startsWith('-');
  const [whole, fraction = ''] = text.replace('-', '').split('.');
  const padded = fraction.padEnd(2, '0').slice(0, 2);
  const basisPoints = Number.parseInt(whole, 10) * 100 + Number.parseInt(padded || '0', 10);
  return negative ? -basisPoints : basisPoints;
}

function roundDiv(numerator: bigint, denominator: bigint): bigint {
  const half = denominator / 2n;
  return numerator >= 0n ? (numerator + half) / denominator : (numerator - half) / denominator;
}
