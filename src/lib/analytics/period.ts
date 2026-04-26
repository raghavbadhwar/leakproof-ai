export type AnalyticsPeriodFilter = {
  periodStart: string | null;
  periodEnd: string | null;
};

export function parseAnalyticsDateFilter(value: string | null): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error('invalid_date_filter');
  }
  return value;
}

export function isWithinAnalyticsPeriod(value: string | null | undefined, filter: AnalyticsPeriodFilter): boolean {
  if (!filter.periodStart && !filter.periodEnd) return true;
  if (!value) return false;
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return false;
  if (filter.periodStart && timestamp < Date.parse(`${filter.periodStart}T00:00:00Z`)) return false;
  if (filter.periodEnd && timestamp > Date.parse(`${filter.periodEnd}T23:59:59Z`)) return false;
  return true;
}

export function filterByAnalyticsPeriod<T>(
  items: T[],
  filter: AnalyticsPeriodFilter,
  dateFor: (item: T) => string | null | undefined
): T[] {
  return items.filter((item) => isWithinAnalyticsPeriod(dateFor(item), filter));
}
