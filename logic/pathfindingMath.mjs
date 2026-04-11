export function clampPenaltyGracePeriod(n) {
  const x = Math.round(Number(n));
  if (!Number.isFinite(x)) return 3;
  return Math.max(0, Math.min(24, x));
}

export function clampPenaltyGrowthFactor(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 2.5;
  return Math.max(1.01, Math.min(10, x));
}

export function normalizeCognitiveLoadOptions(options = {}) {
  const o = options && typeof options === "object" ? options : {};
  return {
    cognitiveLoadPenalty: o.cognitiveLoadPenalty !== false,
    penaltyGracePeriod: clampPenaltyGracePeriod(o.penaltyGracePeriod),
    penaltyGrowthFactor: clampPenaltyGrowthFactor(o.penaltyGrowthFactor),
  };
}

export function cognitivePenaltyMultiplier(depth1Based, options = {}) {
  const o = normalizeCognitiveLoadOptions(options);
  if (!o.cognitiveLoadPenalty) return 1;
  const d = Math.max(1, Number(depth1Based) || 1);
  const k = Math.max(0, d - o.penaltyGracePeriod);
  return Math.pow(o.penaltyGrowthFactor, k);
}

export function scoreRelationshipPath(hopCount, hopWeight = 1, options = {}) {
  const n = Math.max(0, Math.floor(Number(hopCount) || 0));
  const w = Math.max(0, Number(hopWeight) || 0);
  let total = 0;
  for (let i = 1; i <= n; i++) {
    total += w * cognitivePenaltyMultiplier(i, options);
  }
  return total;
}
