const MRP_MARGIN_PERCENT = 0.47;
const MRP_ROUNDING_STEP = 25;

export const parseNumericValue = (value: unknown): number | null => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;

    const cleaned = String(value)
        .replace(/[₹$€£¥]/g, '')
        .replace(/\s+/g, '')
        .replace(/\/-$/, '')
        .replace(/\/$/, '')
        .replace(/-$/, '')
        .trim();

    const match = cleaned.match(/^-?\d+(\.\d+)?/);
    if (!match) return null;

    const parsed = parseFloat(match[0]);
    return Number.isNaN(parsed) ? null : parsed;
};

export const calculateMrpFromRate = (rateOrCost: unknown): number | null => {
    const baseRate = parseNumericValue(rateOrCost);
    if (baseRate === null) return null;

    const priceWithMargin = baseRate + (baseRate * MRP_MARGIN_PERCENT);
    return Math.ceil(priceWithMargin / MRP_ROUNDING_STEP) * MRP_ROUNDING_STEP;
};
