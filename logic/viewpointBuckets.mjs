export function getLayerBucketForPathMetaFromLayer(layerName) {
  let layer = String(layerName || "Unknown");
  if (layer === "Physical") layer = "Technology";
  if (layer === "Motivation" || layer === "Strategy" || layer === "Business") return "upper";
  if (layer === "Application") return "middle";
  if (layer === "Technology") return "lower";
  if (layer === "Implementation") return "project";
  if (layer === "Composite") return "composite";
  return "other";
}

export function normalizePerspectiveBucketSupport(raw, fallback) {
  if (raw == null || typeof raw !== "object") return { ...fallback };
  return {
    A: typeof raw.A === "boolean" ? raw.A : !!fallback.A,
    B: typeof raw.B === "boolean" ? raw.B : !!fallback.B,
    C: typeof raw.C === "boolean" ? raw.C : !!fallback.C,
  };
}

export function getViewpointPerspectiveSupport({ viewpoint, elementToLayer, overrides } = {}) {
  const vp = viewpoint && typeof viewpoint === "object" ? viewpoint : null;
  const map = elementToLayer && typeof elementToLayer === "object" ? elementToLayer : {};
  const allowAll = !vp || !!vp.allElements;
  const computed = allowAll
    ? { A: true, B: true, C: true }
    : (() => {
        let supportsUpperPalette = false;
        let supportsInfraPalette = false;
        const elements = Array.isArray(vp.elements) ? vp.elements : [];
        for (const elementName of elements) {
          const layer = map[elementName];
          const bucket = getLayerBucketForPathMetaFromLayer(layer);
          if (bucket === "upper") supportsUpperPalette = true;
          if (bucket === "middle" || bucket === "lower" || bucket === "project") supportsInfraPalette = true;
        }
        return {
          A: supportsUpperPalette,
          B: supportsInfraPalette,
          C: supportsUpperPalette && supportsInfraPalette,
        };
      })();
  return normalizePerspectiveBucketSupport(overrides, computed);
}

export function perspectiveSuggestionBuckets(sectionId, grouped) {
  if (sectionId === "A") return ["upper"];
  if (sectionId === "B") return ["middle", "lower", "project"];
  const countA = grouped?.byPerspective?.A?.length || 0;
  const countB = grouped?.byPerspective?.B?.length || 0;
  const countC = grouped?.byPerspective?.C?.length || 0;
  if (countC > 0) return [];
  if (countA > 0 && countB === 0) return ["middle", "lower", "project"];
  if (countB > 0 && countA === 0) return ["upper"];
  return ["upper", "middle", "lower", "project"];
}
