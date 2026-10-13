import {paymentAmount, paymentRate} from "./calculation.mjs?v=20261013-4";

// Only derived public calculation values belong in the detail view.
export function calculationDetails(usd, offer, cbr) {
  if (!Number.isFinite(usd) || usd < 0.01 || usd > 1e9) return null;
  const total = paymentAmount(usd, offer, cbr);
  const rate = paymentRate(offer, cbr);
  if (total === null || rate === null) return null;
  const base = offer.currency === "RUB" ? usd * cbr.rate : usd;
  return {
    usd, total, rate, currency: offer.currency,
    percentage: offer.cost * 100,
    difference: total - base,
    cbrRate: offer.currency === "RUB" ? cbr.rate : null,
  };
}
