import { describe, expect, test } from "vitest";
import {
  cognitivePenaltyMultiplier,
  normalizeCognitiveLoadOptions,
  scoreRelationshipPath,
} from "../logic/pathfindingMath.mjs";

describe("cognitive penalty scoring", () => {
  test("multiplier stays 1 inside grace period", () => {
    const opts = normalizeCognitiveLoadOptions({
      cognitiveLoadPenalty: true,
      penaltyGracePeriod: 3,
      penaltyGrowthFactor: 2.5,
    });
    expect(cognitivePenaltyMultiplier(1, opts)).toBe(1);
    expect(cognitivePenaltyMultiplier(2, opts)).toBe(1);
    expect(cognitivePenaltyMultiplier(3, opts)).toBe(1);
  });

  test("7-hop direct route can exceed 100-cost association bridge under strict penalty", () => {
    const opts = {
      cognitiveLoadPenalty: true,
      penaltyGracePeriod: 0,
      penaltyGrowthFactor: 2.5,
    };
    const sevenHopDirectCost = scoreRelationshipPath(7, 1, opts);
    const associationBridgeCost = 100;
    expect(sevenHopDirectCost).toBeGreaterThan(associationBridgeCost);
  });

  test("penalty can be disabled", () => {
    const opts = { cognitiveLoadPenalty: false };
    expect(scoreRelationshipPath(7, 1, opts)).toBe(7);
  });
});
