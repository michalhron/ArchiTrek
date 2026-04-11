import { describe, expect, test } from "vitest";
import {
  getViewpointPerspectiveSupport,
  perspectiveSuggestionBuckets,
} from "../logic/viewpointBuckets.mjs";

describe("viewpoint perspective buckets", () => {
  const layers = {
    Goal: "Motivation",
    Capability: "Strategy",
    BusinessProcess: "Business",
    ApplicationComponent: "Application",
    Node: "Technology",
  };

  test("upper-only viewpoint supports A only", () => {
    const support = getViewpointPerspectiveSupport({
      viewpoint: { allElements: false, elements: ["Goal", "Capability", "BusinessProcess"] },
      elementToLayer: layers,
    });
    expect(support).toEqual({ A: true, B: false, C: false });
  });

  test("mixed palette supports A/B/C", () => {
    const support = getViewpointPerspectiveSupport({
      viewpoint: { allElements: false, elements: ["BusinessProcess", "ApplicationComponent", "Node"] },
      elementToLayer: layers,
    });
    expect(support).toEqual({ A: true, B: true, C: true });
  });

  test("suggestion bucket policy follows section occupancy", () => {
    const groupedAOnly = { byPerspective: { A: [1], B: [], C: [] } };
    const groupedBOnly = { byPerspective: { A: [], B: [1], C: [] } };
    const groupedC = { byPerspective: { A: [], B: [], C: [1] } };
    expect(perspectiveSuggestionBuckets("A", groupedAOnly)).toEqual(["upper"]);
    expect(perspectiveSuggestionBuckets("B", groupedAOnly)).toEqual(["middle", "lower"]);
    expect(perspectiveSuggestionBuckets("C", groupedAOnly)).toEqual(["middle", "lower"]);
    expect(perspectiveSuggestionBuckets("C", groupedBOnly)).toEqual(["upper"]);
    expect(perspectiveSuggestionBuckets("C", groupedC)).toEqual([]);
  });
});
