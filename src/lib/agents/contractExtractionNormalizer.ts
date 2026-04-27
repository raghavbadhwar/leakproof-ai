import { contractExtractionSchema, contractTermTypeSchema, type ContractExtraction } from './contractSchema';

type JsonRecord = Record<string, unknown>;
type BillingPeriodValue = 'monthly' | 'quarterly' | 'annual' | 'one_time';

type NormalizerContext = {
  sourceDocumentId: string;
  sourceLabelsById?: Record<string, string>;
};

type NormalizedTerm = ContractExtraction['terms'][number];

const CONFIDENCE_BY_LABEL: Record<string, number> = {
  high: 0.9,
  medium: 0.65,
  low: 0.35
};

const TERM_TYPE_ALIASES: Array<{ type: NormalizedTerm['term_type']; patterns: RegExp[] }> = [
  { type: 'customer_name', patterns: [/customer name/, /client name/, /account name/, /customer\s*:/, /client\s*:/] },
  { type: 'supplier_name', patterns: [/supplier name/, /vendor name/, /provider name/, /supplier\s*:/, /vendor\s*:/, /provider\s*:/] },
  { type: 'contract_start_date', patterns: [/effective date/, /start date/, /commencement/] },
  { type: 'contract_end_date', patterns: [/end date/, /expiration/, /expiry/] },
  { type: 'renewal_term', patterns: [/renewal/] },
  { type: 'notice_period', patterns: [/notice/] },
  { type: 'base_fee', patterns: [/base fee/, /platform fee/, /subscription fee/, /recurring fee/] },
  { type: 'billing_frequency', patterns: [/billing frequency/, /invoice frequency/] },
  { type: 'committed_seats', patterns: [/committed seats/, /minimum seats/, /licensed users/] },
  { type: 'seat_price', patterns: [/seat price/, /per seat/, /per user/, /license price/] },
  { type: 'usage_allowance', patterns: [/usage allowance/, /monthly allowance/, /included usage/, /included api/, /includes?.*api calls?/, /included.*api calls?/] },
  { type: 'overage_price', patterns: [/overage/, /excess usage/, /additional usage/] },
  { type: 'minimum_commitment', patterns: [/minimum.*commitment/, /monthly minimum/, /minimum spend/] },
  { type: 'discount_expiry', patterns: [/discount.*expir/, /discount.*until/, /promotion.*until/, /promo.*until/] },
  { type: 'discount', patterns: [/discount/, /promotion/, /promo/] },
  { type: 'annual_uplift', patterns: [/annual.*uplift/, /annual.*increase/, /fee increase/, /escalat/] },
  { type: 'amendment', patterns: [/amendment/] },
  { type: 'conflict', patterns: [/conflict/, /inconsisten/, /supersede/, /notwithstanding/] },
  { type: 'payment_terms', patterns: [/payment terms/, /net \d+/, /due within/] },
  { type: 'special_billing_note', patterns: [/billing note/, /special billing/, /special term/] }
];

export function normalizeContractExtraction(raw: unknown, context: NormalizerContext): ContractExtraction {
  const directParse = contractExtractionSchema.safeParse(raw);
  if (directParse.success) return upgradeStructuredExtraction(directParse.data, context);

  const rawTerms = readRawTerms(raw);
  const normalizedTerms = rawTerms.flatMap((term) => normalizeRawTerm(term, context));

  return contractExtractionSchema.parse({ terms: normalizedTerms });
}

function upgradeStructuredExtraction(extraction: ContractExtraction, context: NormalizerContext): ContractExtraction {
  return {
    terms: extraction.terms.map((term) => {
      const citation = withContextualCitationLabel(term.citation, context);
      const text = cleanText([
        stringifyValue(term.value),
        stringifyValue(term.normalized_value),
        term.source_excerpt,
        citation.excerpt,
        citation.label
      ].filter(Boolean).join(' '));
      const inferredType = inferStructuredTermType(term.term_type, text);

      if (!inferredType || inferredType === term.term_type) {
        return {
          ...term,
          citation
        };
      }

      const normalizedValue = normalizeValueForTerm(inferredType, undefined, text);
      return {
        ...term,
        citation,
        term_type: inferredType,
        normalized_value: normalizedValue.value,
        currency: normalizedValue.currency ?? term.currency,
        period: normalizedValue.period ?? term.period,
        needs_review: term.needs_review || normalizedValue.needsReview,
        reasoning_summary: cleanText(`${term.reasoning_summary} Reclassified from a generic billing note based on the source excerpt.`)
      } as NormalizedTerm;
    })
  };
}

function inferStructuredTermType(
  currentType: NormalizedTerm['term_type'],
  text: string
): NormalizedTerm['term_type'] | null {
  const specificType = inferSpecificFinancialTermType(text);
  if (specificType) return specificType;

  if (currentType === 'special_billing_note') return inferTermType('', text);

  return currentType;
}

function readRawTerms(raw: unknown): JsonRecord[] {
  if (Array.isArray(raw)) return raw.filter(isRecord);
  if (!isRecord(raw)) return [];

  const terms = raw.terms ?? raw.extracted_terms ?? raw.contract_terms ?? raw.results;
  if (!Array.isArray(terms)) return [];

  return terms.filter(isRecord);
}

function normalizeRawTerm(rawTerm: JsonRecord, context: NormalizerContext): NormalizedTerm[] {
  const name = readString(rawTerm, ['term_type', 'termType', 'type', 'term_name', 'termName', 'name', 'label']) ?? '';
  const rawValue = rawTerm.value ?? rawTerm.term_value ?? rawTerm.termValue ?? rawTerm.normalized_value ?? rawTerm.normalizedValue;
  const textValue = stringifyValue(rawValue);
  const hasCitation = hasUsableCitation(rawTerm.citation);
  const sourceExcerpt = cleanText(
    readString(rawTerm, ['source_excerpt', 'sourceExcerpt', 'excerpt', 'source_text', 'sourceText']) ??
      readCitationExcerpt(rawTerm.citation) ??
      textValue ??
      name
  );
  const confidence = normalizeConfidence(rawTerm.confidence);
  const citation = normalizeCitation(rawTerm, context, name, sourceExcerpt);
  const reasoningSummary = cleanText(
    readString(rawTerm, ['reasoning_summary', 'reasoningSummary', 'reasoning', 'rationale', 'summary']) ??
      'Normalized from AI extraction output; review the source excerpt before approval.'
  );

  const baseTerm = {
    value: rawValue ?? textValue ?? name,
    citation,
    source_excerpt: sourceExcerpt,
    confidence,
    reasoning_summary: reasoningSummary
  };

  const inferredType = inferTermType(name, cleanText(`${textValue ?? ''} ${sourceExcerpt}`));
  if (!inferredType) {
    return [
      {
        ...baseTerm,
        term_type: 'special_billing_note',
        normalized_value: { text: textValue ?? sourceExcerpt },
        needs_review: true
      } as NormalizedTerm
    ];
  }

  const normalizedValue = normalizeValueForTerm(inferredType, rawValue, textValue ?? sourceExcerpt);
  const needsReview = normalizeNeedsReview(
    rawTerm.needs_review ?? rawTerm.needsReview,
    confidence,
    normalizedValue.needsReview || !hasCitation
  );
  const primaryTerm: NormalizedTerm = {
    ...baseTerm,
    term_type: inferredType,
    normalized_value: normalizedValue.value,
    currency: normalizedValue.currency,
    period: normalizedValue.period,
    needs_review: needsReview
  } as NormalizedTerm;

  const splitDiscountExpiry = splitDiscountExpiryTerm(inferredType, rawValue, textValue ?? sourceExcerpt, primaryTerm);
  if (splitDiscountExpiry) return splitDiscountExpiry;

  return [primaryTerm];
}

function inferTermType(name: string, fallbackText: string): NormalizedTerm['term_type'] | null {
  const direct = contractTermTypeSchema.safeParse(name);
  const combinedText = `${name} ${fallbackText}`;
  const specificType = inferSpecificFinancialTermType(combinedText);
  if (specificType) return specificType;

  if (direct.success && direct.data !== 'special_billing_note') return direct.data;

  const label = normalizeLabel(name).trim();
  if (/^(customer|client|customer name|client name|account name)$/.test(label)) return 'customer_name';
  if (/^(supplier|vendor|provider|supplier name|vendor name|provider name)$/.test(label)) return 'supplier_name';

  const text = normalizeLabel(combinedText);
  return TERM_TYPE_ALIASES.find((alias) => alias.patterns.some((pattern) => pattern.test(text)))?.type ?? direct.data ?? null;
}

function inferSpecificFinancialTermType(text: string): NormalizedTerm['term_type'] | null {
  const normalized = normalizeLabel(text);

  if (/minimum.*commitment|monthly minimum|minimum spend/.test(normalized) && parseMoney(text)) {
    return 'minimum_commitment';
  }

  if (/overage|above.*allowance|additional.*api calls?|excess usage/.test(normalized) && parseMoney(text)) {
    return 'overage_price';
  }

  if (/usage allowance|monthly allowance|included usage|included api|includes?.*api calls?|included.*api calls?/.test(normalized) && parseQuantity(text)) {
    return 'usage_allowance';
  }

  return null;
}

function normalizeValueForTerm(
  termType: NormalizedTerm['term_type'],
  rawValue: unknown,
  text: string
): { value: NormalizedTerm['normalized_value']; currency?: string; period?: string; needsReview: boolean } {
  const reviewValue = unresolvedValue(text, `Could not normalize ${termType} into the required internal value shape.`);
  switch (termType) {
    case 'minimum_commitment':
    case 'base_fee':
    case 'seat_price': {
      const money = parseMoney(text);
      const period = readPeriod(text);
      return {
        value: money ? compactValue({ amountMinor: money.amountMinor, currency: money.currency, period }) : reviewValue,
        currency: money?.currency,
        period,
        needsReview: !money
      };
    }
    case 'overage_price': {
      const money = parseMoney(text);
      const metricName = parseMetricName(text);
      return {
        value: money ? { amountMinor: money.amountMinor, currency: money.currency, metricName } : reviewValue,
        currency: money?.currency,
        needsReview: !money
      };
    }
    case 'usage_allowance': {
      const quantity = parseQuantity(text);
      const period = readPeriod(text);
      return {
        value: quantity ? compactValue({ metricName: parseMetricName(text), quantity, period }) : reviewValue,
        period,
        needsReview: !quantity
      };
    }
    case 'committed_seats': {
      const quantity = parseQuantity(text);
      return { value: quantity ? { quantity } : reviewValue, needsReview: !quantity };
    }
    case 'discount':
    case 'annual_uplift': {
      const percent = parsePercent(text);
      return { value: percent === null ? reviewValue : { percent }, needsReview: percent === null };
    }
    case 'discount_expiry':
    case 'contract_start_date':
    case 'contract_end_date': {
      const date = parseDateText(text);
      return { value: date ? { date } : reviewValue, needsReview: !date };
    }
    case 'notice_period':
    case 'renewal_term': {
      const duration = parseDuration(text);
      return { value: duration ?? reviewValue, needsReview: !duration };
    }
    case 'payment_terms': {
      const dueDays = parsePaymentDueDays(text);
      return { value: dueDays === null ? reviewValue : { dueDays }, needsReview: dueDays === null };
    }
    case 'billing_frequency': {
      const frequency = readPeriod(text);
      return {
        value: frequency ? { frequency } : reviewValue,
        period: frequency,
        needsReview: !frequency
      };
    }
    case 'customer_name':
    case 'supplier_name':
    case 'special_billing_note':
      return { value: { text }, period: readPeriod(text), needsReview: false };
    case 'amendment': {
      const date = parseDateText(text);
      return { value: compactValue({ text, effectiveDate: date ?? undefined }), needsReview: false };
    }
    case 'conflict': {
      const conflictTargets = readConflictTargets(rawValue);
      return {
        value: conflictTargets.length ? { text, conflictsWith: conflictTargets } : reviewValue,
        needsReview: conflictTargets.length === 0
      };
    }
    default:
      return { value: { text }, period: readPeriod(text), needsReview: false };
  }
}

function splitDiscountExpiryTerm(
  inferredType: NormalizedTerm['term_type'],
  rawValue: unknown,
  text: string,
  primaryTerm: NormalizedTerm
): NormalizedTerm[] | null {
  if (inferredType !== 'discount' && inferredType !== 'discount_expiry') return null;

  const discount = parsePercent(text);
  const expiry = parseDateText(text);
  if (discount === null || !expiry) return null;

  return [
    {
      ...primaryTerm,
      term_type: 'discount',
      value: rawValue ?? text,
      normalized_value: { percent: discount },
      needs_review: primaryTerm.needs_review
    } as NormalizedTerm,
    {
      ...primaryTerm,
      term_type: 'discount_expiry',
      value: rawValue ?? text,
      normalized_value: { date: expiry },
      needs_review: primaryTerm.needs_review,
      reasoning_summary: `${primaryTerm.reasoning_summary} Expiry date was separated from the discount term.`
    } as NormalizedTerm
  ];
}

function normalizeCitation(rawTerm: JsonRecord, context: NormalizerContext, labelSeed: string, excerpt: string): NormalizedTerm['citation'] {
  const rawCitation = rawTerm.citation;
  if (isRecord(rawCitation)) {
    const sourceType = readString(rawCitation, ['sourceType', 'source_type']);
    const sourceId = readString(rawCitation, ['sourceId', 'source_id', 'id', 'chunkId', 'chunk_id']) ?? context.sourceDocumentId;
    const label = labelForSource(
      context,
      sourceId,
      readString(rawCitation, ['label', 'section', 'name']) ?? (labelSeed || 'Contract source')
    );
    return {
      sourceType: sourceType === 'invoice' || sourceType === 'usage' || sourceType === 'calculation' ? sourceType : 'contract',
      sourceId,
      label,
      excerpt: cleanText(readString(rawCitation, ['excerpt']) ?? excerpt)
    };
  }

  const citationText = typeof rawCitation === 'string' ? rawCitation.trim() : '';
  const sourceId = citationText || context.sourceDocumentId;
  return {
    sourceType: 'contract',
    sourceId,
    label: labelForSource(context, sourceId, citationText || labelSeed || 'Contract source'),
    excerpt: cleanText(excerpt)
  };
}

function withContextualCitationLabel(citation: NormalizedTerm['citation'], context: NormalizerContext): NormalizedTerm['citation'] {
  return {
    ...citation,
    label: labelForSource(context, citation.sourceId, citation.label)
  };
}

function labelForSource(context: NormalizerContext, sourceId: string, fallback: string): string {
  const sourceLabel = context.sourceLabelsById?.[sourceId]?.trim();
  const fallbackLabel = cleanLabel(fallback || 'Contract source');
  if (!sourceLabel) return fallbackLabel;
  if (fallbackLabel === sourceId || fallbackLabel === 'Contract source' || fallbackLabel === sourceLabel) return sourceLabel;
  if (fallbackLabel.includes(sourceLabel)) return fallbackLabel;
  return `${sourceLabel} - ${fallbackLabel}`;
}

function hasUsableCitation(citation: unknown): boolean {
  if (typeof citation === 'string') return citation.trim().length > 0;
  if (!isRecord(citation)) return false;
  return Boolean(
    readString(citation, ['sourceId', 'source_id', 'id', 'chunkId', 'chunk_id']) ||
      readString(citation, ['label', 'section', 'name']) ||
      readString(citation, ['excerpt'])
  );
}

function normalizeConfidence(rawConfidence: unknown): number {
  if (typeof rawConfidence === 'number' && Number.isFinite(rawConfidence)) {
    return Math.max(0, Math.min(1, rawConfidence > 1 ? rawConfidence / 100 : rawConfidence));
  }

  if (typeof rawConfidence === 'string') {
    const label = rawConfidence.trim().toLowerCase();
    if (label in CONFIDENCE_BY_LABEL) return CONFIDENCE_BY_LABEL[label];
    const parsed = Number(label.replace('%', ''));
    if (Number.isFinite(parsed)) return Math.max(0, Math.min(1, parsed > 1 ? parsed / 100 : parsed));
  }

  return 0.5;
}

function normalizeNeedsReview(rawNeedsReview: unknown, confidence: number, valueNeedsReview: boolean): boolean {
  if (typeof rawNeedsReview === 'boolean') return rawNeedsReview || valueNeedsReview;
  if (typeof rawNeedsReview === 'string') {
    const normalized = rawNeedsReview.trim().toLowerCase();
    if (['true', 'yes', 'y'].includes(normalized)) return true;
    if (['false', 'no', 'n'].includes(normalized)) return valueNeedsReview;
  }
  return valueNeedsReview || confidence < 0.75;
}

function parseMoney(text: string): { amountMinor: number; currency: string } | null {
  const currency = parseCurrency(text);
  const amountMatch = text.match(/(?:USD|EUR|GBP|INR|\$|€|£|₹)\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i) ?? text.match(/([0-9][0-9,]*(?:\.[0-9]+)?)\s*(?:USD|EUR|GBP|INR)/i);
  if (!amountMatch?.[1]) return null;

  const amount = Number(amountMatch[1].replaceAll(',', ''));
  if (!Number.isFinite(amount)) return null;

  return { amountMinor: Math.round(amount * 100), currency };
}

function parseCurrency(text: string): string {
  if (/\bEUR\b|€/.test(text)) return 'EUR';
  if (/\bGBP\b|£/.test(text)) return 'GBP';
  if (/\bINR\b|₹/.test(text)) return 'INR';
  return 'USD';
}

function parseQuantity(text: string): number | null {
  const match = text.match(/([0-9][0-9,]*)/);
  if (!match?.[1]) return null;
  const quantity = Number(match[1].replaceAll(',', ''));
  return Number.isFinite(quantity) ? quantity : null;
}

function parsePercent(text: string): number | null {
  const match = text.match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
  if (!match?.[1]) return null;
  const percent = Number(match[1]);
  return Number.isFinite(percent) ? percent : null;
}

function parseDateText(text: string): string | null {
  const isoMatch = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (isoMatch?.[1]) return isoMatch[1];

  const longDateMatch = text.match(/\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2},?\s+20\d{2}\b/i);
  if (!longDateMatch?.[0]) return null;

  const parts = longDateMatch[0].match(/^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(20\d{2})$/);
  if (!parts?.[1] || !parts[2] || !parts[3]) return null;

  const month = monthNumber(parts[1]);
  if (!month) return null;

  return `${parts[3]}-${String(month).padStart(2, '0')}-${String(Number(parts[2])).padStart(2, '0')}`;
}

function parseDuration(text: string): { quantity: number; unit: 'days' | 'months' | 'years' } | null {
  const match = text.match(/(?:net\s*)?(\d+)\s*(day|days|month|months|year|years)/i);
  if (!match?.[1] || !match[2]) return null;

  const quantity = Number(match[1]);
  if (!Number.isInteger(quantity) || quantity <= 0) return null;

  const unitLabel = match[2].toLowerCase();
  const unit = unitLabel.startsWith('day') ? 'days' : unitLabel.startsWith('month') ? 'months' : 'years';
  return { quantity, unit };
}

function parsePaymentDueDays(text: string): number | null {
  const netMatch = text.match(/\bnet\s*(\d+)\b/i);
  const withinMatch = text.match(/\bdue\s+within\s+(\d+)\s+days?\b/i);
  const match = netMatch ?? withinMatch;
  if (!match?.[1]) return null;

  const dueDays = Number(match[1]);
  return Number.isInteger(dueDays) && dueDays >= 0 ? dueDays : null;
}

function monthNumber(month: string): number | null {
  const normalized = month.toLowerCase().slice(0, 3);
  const months: Record<string, number> = {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12
  };
  return months[normalized] ?? null;
}

function parseMetricName(text: string): string {
  if (/api\s*calls?/i.test(text)) return 'api_calls';
  if (/seat|user|license/i.test(text)) return 'seats';
  if (/gb|gigabyte/i.test(text)) return 'gb';
  return 'usage_units';
}

function readPeriod(text: string): BillingPeriodValue | undefined {
  if (/monthly|per month|\/month/i.test(text)) return 'monthly';
  if (/annual|yearly|per year|\/year/i.test(text)) return 'annual';
  if (/quarterly/i.test(text)) return 'quarterly';
  if (/one[-\s]?time|upfront/i.test(text)) return 'one_time';
  return undefined;
}

function readConflictTargets(rawValue: unknown): string[] {
  if (!isRecord(rawValue)) return [];
  const conflictsWith = rawValue.conflictsWith ?? rawValue.conflicts_with ?? rawValue.supersedes;
  if (Array.isArray(conflictsWith)) {
    return conflictsWith.filter((value): value is string => typeof value === 'string' && value.trim().length > 0).map((value) => cleanText(value).slice(0, 160));
  }
  if (typeof conflictsWith === 'string' && conflictsWith.trim()) return [cleanText(conflictsWith).slice(0, 160)];
  return [];
}

function readCitationExcerpt(citation: unknown): string | undefined {
  if (!isRecord(citation)) return undefined;
  return readString(citation, ['excerpt']);
}

function readString(record: JsonRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function stringifyValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (isRecord(value)) return JSON.stringify(value);
  return undefined;
}

function normalizeLabel(value: string): string {
  return value.toLowerCase().replaceAll(/[_-]+/g, ' ');
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 700) || 'Contract source excerpt unavailable.';
}

function cleanLabel(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 200) || 'Contract source';
}

function unresolvedValue(rawText: string, reason: string): NormalizedTerm['normalized_value'] {
  return {
    kind: 'unresolved',
    rawText: cleanText(rawText),
    reason
  };
}

function compactValue<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
