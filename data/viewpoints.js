// === data/viewpoints.js ===
/**
 * ArchiMate 3.1 — Appendix C example viewpoints (palette + metadata).
 * Covers §C.1 (basic), §C.2 (motivation), §C.3 (strategy), §C.4 (implementation & migration).
 * https://pubs.opengroup.org/architecture/archimate32-doc/ch-Example-Viewpoints.html
 *
 * File layout
 * ------------
 * 1. VIEWPOINTS           — one object per viewpoint key (expand here first).
 * 2. getViewpointSelectGroups — optgroup order for the UI (derived from key order + category).
 * 3. VIEWPOINT_PERSPECTIVE_SUPPORT_OVERRIDES — optional A/B/C tab overrides.
 * 4. Helpers              — relationship allowlists, Association pedagogy, strength caps.
 *
 * Active viewpoint: greys out non-palette elements in selectors and filters pathfinding.
 * Layered (`allElements: true`) permits the full metamodel for elements.
 *
 * Metamodel aspect rules (ASPECT_RULES, …) live in data/metamodel.js.
 */

const VIEWPOINTS = {

  // ── COMPOSITION ───────────────────────────────────────────────────────────

  organization: {
    name: "Organization", category: "Composition", section: "§C.1.1",
    scope: "Single layer / Single aspect",
    stakeholders: "Enterprise, Process and Domain Architects, managers, employees, shareholders",
    concerns: "Identification of competencies, authority, and responsibilities",
    purpose: "Designing, deciding, informing",
    elements: [
      "Business Actor", "Business Role", "Business Collaboration",
      "Business Interface", "Location",
    ],
  },

  applicationStructure: {
    name: "Application Structure", category: "Composition", section: "§C.1.2",
    scope: "Single layer / Multiple aspects",
    stakeholders: "Application and Solution Architects",
    concerns: "Application structure, consistency and completeness, reduction of complexity",
    purpose: "Designing",
    elements: [
      "Application Component", "Application Interface",
      "Application Collaboration", "Data Object",
    ],
  },

  informationStructure: {
    name: "Information Structure", category: "Composition", section: "§C.1.3",
    scope: "Multiple layers / Single aspect",
    stakeholders: "Domain and Information Architects",
    concerns: "Structure and dependencies of data and information, consistency and completeness",
    purpose: "Designing",
    elements: [
      "Business Object", "Representation", "Data Object", "Artifact", "Meaning",
    ],
    /**
     * Optional messaging for §5.2.4 Association and strength badges when both ends
     * stay inside this viewpoint’s palette. Omit on other viewpoints.
     */
    pedagogy: {
      sanctionAssociationWithinPalette: true,
      associationSanctionReason:
        "The Information Structure viewpoint includes both elements; Association (§5.2.4) fits links between information and meaning concepts.",
      directStrengthPaletteCap: {
        title: "Direct in Appendix B — in viewpoint scope.",
        reason:
          "Appendix B lists a direct relationship for this pair. Under the Information Structure viewpoint both elements are in palette, so the strength badge is viewpoint-scoped—not “maximal” rigor across all layers.",
      },
    },
  },

  technology: {
    name: "Technology", category: "Composition", section: "§C.1.4, §C.1.6",
    scope: "Multiple layers / Multiple aspects",
    stakeholders: "Infrastructure Architects, Operational Managers",
    concerns: "Stability, security, dependencies, and costs of technology infrastructure (including equipment and facility elements from the ArchiMate specification)",
    purpose: "Designing",
    elements: [
      "Location", "Node", "Device", "System Software",
      "Technology Collaboration", "Technology Interface",
      "Communication Network", "Path",
      "Technology Function", "Technology Process", "Technology Interaction",
      "Technology Service", "Technology Event", "Artifact",
      "Equipment", "Facility", "Distribution Network", "Material",
    ],
  },

  layered: {
    name: "Layered", category: "Composition", section: "§C.1.5",
    scope: "Multiple layers / Multiple aspects",
    stakeholders: "All architects",
    concerns: "Overview of the full architecture across all layers",
    purpose: "Designing, informing",
    elements: [],       // empty = ALL core elements permitted
    allElements: true,  // flag used by the UI to skip filtering
  },

  // ── SUPPORT ───────────────────────────────────────────────────────────────

  product: {
    name: "Product", category: "Support", section: "§C.1.7",
    scope: "Multiple layers / Multiple aspects",
    stakeholders: "Product Managers, Business Architects",
    concerns: "Value of products for customers, product composition",
    purpose: "Designing, deciding",
    elements: [
      "Business Actor", "Business Role", "Business Collaboration",
      "Business Interface", "Business Process", "Business Function",
      "Business Interaction", "Business Event", "Business Service",
      "Business Object", "Product", "Contract",
      "Application Component", "Application Collaboration",
      "Application Interface", "Application Process", "Application Function",
      "Application Interaction", "Application Event", "Application Service",
    ],
  },

  applicationUsage: {
    name: "Application Usage", category: "Support", section: "§C.1.8",
    scope: "Multiple layers / Multiple aspects",
    stakeholders: "Enterprise, Process, and Application Architects, Operational Managers",
    concerns: "Consistency and completeness, reduction of complexity",
    purpose: "Designing, deciding",
    elements: [
      "Business Actor", "Business Role", "Business Collaboration",
      "Business Process", "Business Function", "Business Interaction",
      "Business Event", "Business Object",
      "Application Component", "Application Collaboration",
      "Application Interface", "Application Process", "Application Function",
      "Application Interaction", "Application Event", "Application Service",
      "Data Object",
    ],
  },

  technologyUsage: {
    name: "Technology Usage", category: "Support", section: "§C.1.9",
    scope: "Multiple layers / Multiple aspects",
    stakeholders: "Application, Infrastructure Architects, Operational Managers",
    concerns: "Dependencies, performance, scalability",
    purpose: "Designing",
    elements: [
      "Application Component", "Application Collaboration",
      "Application Process", "Application Function", "Application Interaction",
      "Application Event", "Data Object",
      "Node", "Device", "Technology Collaboration", "System Software",
      "Technology Interface", "Communication Network", "Path",
      "Technology Process", "Technology Function", "Technology Interaction",
      "Technology Service", "Technology Event", "Artifact",
    ],
  },

  // ── COOPERATION ───────────────────────────────────────────────────────────

  businessProcessCooperation: {
    name: "Business Process Cooperation", category: "Cooperation", section: "§C.1.10",
    scope: "Multiple layers / Multiple aspects",
    stakeholders: "Process and Domain Architects, Operational Managers",
    concerns: "Dependencies between business processes, consistency and completeness, responsibilities",
    purpose: "Designing, deciding",
    elements: [
      "Business Actor", "Business Role", "Business Collaboration",
      "Location", "Business Interface",
      "Business Process", "Business Function", "Business Interaction",
      "Business Event", "Business Service", "Business Object", "Representation",
      "Application Component", "Application Collaboration",
      "Application Interface", "Application Process", "Application Function",
      "Application Interaction", "Application Event", "Application Service",
      "Data Object",
    ],
  },

  applicationCooperation: {
    name: "Application Cooperation", category: "Cooperation", section: "§C.1.11",
    scope: "Application layer / Multiple aspects",
    stakeholders: "Enterprise, Process, Application, and Domain Architects",
    concerns: "Relationships and dependencies between applications, orchestration/choreography of services",
    purpose: "Designing",
    elements: [
      "Location",
      "Application Component", "Application Collaboration",
      "Application Interface", "Application Process", "Application Function",
      "Application Interaction", "Application Event", "Application Service",
      "Data Object",
    ],
  },

  // ── REALIZATION ───────────────────────────────────────────────────────────

  serviceRealization: {
    name: "Service Realization", category: "Realization", section: "§C.1.12",
    scope: "Multiple layers / Multiple aspects",
    stakeholders: "Business and Application Architects, Operational Managers",
    concerns: "How business services are realized by underlying processes and applications",
    purpose: "Designing",
    elements: [
      "Business Actor", "Business Role", "Business Collaboration",
      "Business Interface", "Business Process", "Business Function",
      "Business Interaction", "Business Event", "Business Service",
      "Business Object", "Representation",
      "Application Component", "Application Collaboration",
      "Application Interface", "Application Process", "Application Function",
      "Application Interaction", "Application Event", "Application Service",
      "Data Object",
    ],
  },

  implementationAndDeployment: {
    name: "Implementation and Deployment", category: "Realization", section: "§C.1.13",
    scope: "Multiple layers / Multiple aspects",
    stakeholders: "Application and Infrastructure Architects",
    concerns: "How applications are mapped onto the underlying technology",
    purpose: "Designing",
    elements: [
      "Application Component", "Application Collaboration",
      "Application Interface", "Application Process", "Application Function",
      "Application Interaction", "Application Event", "Application Service",
      "Data Object",
      "Node", "Device", "System Software",
      "Technology Collaboration", "Technology Interface",
      "Technology Process", "Technology Function",
      "Technology Interaction", "Technology Event", "Technology Service",
      "Artifact",
      "Path", "Communication Network",
    ],
  },

  implementationAndMigration: {
    name: "Implementation and Migration", category: "Strategy and Motivation", section: "§C.1.14",
    scope: "Multiple layers / Multiple aspects",
    stakeholders: "Enterprise Architects, Process Architects, Application Architects, Infrastructure Architects, Domain Architects, Employees, Shareholders",
    concerns: "Architecture vision and policies, motivation; Project portfolio management; Architecture landscape; Migration planning",
    purpose: "Deciding, Planning",
    elements: [
      "Work Package", "Deliverable", "Implementation Event",
      "Plateau", "Gap",
      "Location",
    ],
  },

  // ── MOTIVATION (Appendix C.2) ─────────────────────────────────────────────

  stakeholder: {
    name: "Stakeholder", category: "Motivation", section: "§C.2.1",
    scope: "Motivation layer / Multiple aspects",
    stakeholders: "Stakeholders, business managers, enterprise and ICT architects, business analysts, requirements engineers",
    concerns: "Architecture mission and strategy; motivation",
    purpose: "Designing, deciding, informing",
    elements: [
      "Stakeholder", "Driver", "Assessment", "Goal",
      "Location",
    ],
  },

  goalRealization: {
    name: "Goal Realization", category: "Motivation", section: "§C.2.2",
    scope: "Motivation layer / Multiple aspects",
    stakeholders: "Enterprise and ICT architects, business analysts, requirements engineers",
    concerns: "Architecture mission and strategy; motivation",
    purpose: "Designing, deciding, informing",
    elements: [
      "Stakeholder", "Driver", "Assessment",
      "Goal", "Outcome", "Principle", "Requirement", "Constraint",
      "Meaning", "Value",
      "Location",
    ],
  },

  requirementsRealization: {
    name: "Requirements Realization", category: "Motivation", section: "§C.2.3",
    scope: "Multiple layers / Multiple aspects",
    stakeholders: "Enterprise and ICT architects, business analysts, requirements engineers",
    concerns: "Architecture mission and strategy; motivation",
    purpose: "Designing, deciding, informing",
    elements: [
      "Stakeholder", "Driver", "Assessment",
      "Goal", "Outcome", "Principle", "Requirement", "Constraint",
      "Meaning", "Value",
      "Business Service", "Application Service", "Technology Service",
      "Business Process", "Application Process",
      "Business Function", "Application Function",
      "Business Role", "Application Component",
      "Node", "Device",
      "Product", "Contract",
      "Location",
    ],
  },

  motivationViewpoint: {
    name: "Motivation", category: "Motivation", section: "§C.2.4",
    scope: "Motivation layer / Multiple aspects",
    stakeholders: "Enterprise and ICT architects, business analysts, requirements engineers",
    concerns: "Architecture mission and strategy; motivation",
    purpose: "Designing, deciding, informing",
    elements: [
      "Stakeholder", "Driver", "Assessment",
      "Goal", "Outcome", "Principle", "Requirement", "Constraint",
      "Meaning", "Value",
      "Location",
    ],
  },

  // ── STRATEGY (Appendix C.3) ───────────────────────────────────────────────

  strategy: {
    name: "Strategy", category: "Strategy", section: "§C.3.1",
    scope: "Strategy layer / Multiple aspects",
    stakeholders: "CIO, CTO, enterprise and business architects",
    concerns: "Developing a viable business strategy; Strategic direction and choices",
    purpose: "Designing, deciding, informing",
    elements: [
      "Resource", "Capability", "Value Stream", "Course of Action",
      "Stakeholder", "Driver", "Assessment",
      "Goal", "Outcome",
      "Location",
    ],
  },

  capabilityMap: {
    name: "Capability Map", category: "Strategy", section: "§C.3.2",
    scope: "Strategy layer / Multiple aspects",
    stakeholders: "CIO, CTO, enterprise and business architects",
    concerns: "Architecture strategy and motivation; Capability-based planning",
    purpose: "Designing, deciding, informing",
    elements: [
      "Capability", "Resource", "Value Stream", "Course of Action",
      "Goal", "Outcome",
      "Location",
    ],
  },

  valueStreamViewpoint: {
    name: "Value Stream", category: "Strategy", section: "§C.3.3",
    scope: "Strategy layer / Multiple aspects",
    stakeholders: "CIO, CTO, enterprise and business architects",
    concerns: "Value creation for stakeholders; End-to-end value delivery",
    purpose: "Designing, deciding, informing",
    elements: [
      "Value Stream", "Capability", "Resource", "Course of Action",
      "Goal", "Outcome",
      "Location",
    ],
  },

  outcomeRealization: {
    name: "Outcome Realization", category: "Strategy", section: "§C.3.4",
    scope: "Multiple layers / Multiple aspects",
    stakeholders: "CIO, CTO, enterprise and business architects",
    concerns: "Architecture strategy and motivation; Business outcomes",
    purpose: "Designing, deciding, informing",
    elements: [
      "Outcome", "Goal",
      "Capability", "Resource", "Value Stream", "Course of Action",
      "Business Service", "Application Service",
      "Business Process", "Application Process",
      "Location",
    ],
  },

  resourceMap: {
    name: "Resource Map", category: "Strategy", section: "§C.3.5",
    scope: "Strategy layer / Multiple aspects",
    stakeholders: "CIO, CTO, enterprise and business architects",
    concerns: "Architecture strategy and motivation; Resource portfolio",
    purpose: "Designing, deciding, informing",
    elements: [
      "Resource", "Capability", "Value Stream", "Course of Action",
      "Location",
    ],
  },

  // ── IMPLEMENTATION & MIGRATION (Appendix C.4) ────────────────────────────

  project: {
    name: "Project", category: "Implementation and Migration", section: "§C.4.1",
    scope: "Multiple layers / Multiple aspects",
    stakeholders: "Operational managers, enterprise and ICT architects, employees, shareholders",
    concerns: "Project portfolio management; Architecture implementation",
    purpose: "Deciding, planning",
    elements: [
      "Work Package", "Deliverable", "Implementation Event",
      "Plateau",
      "Business Actor", "Business Role",
      "Location",
    ],
  },

  migrationViewpoint: {
    name: "Migration", category: "Implementation and Migration", section: "§C.4.2",
    scope: "Multiple layers / Multiple aspects",
    stakeholders: "Enterprise architects, operational managers, ICT architects, employees, shareholders",
    concerns: "Migration planning; Architecture landscape",
    purpose: "Deciding, planning",
    elements: [
      "Plateau", "Gap",
      "Work Package", "Deliverable", "Implementation Event",
      "Location",
    ],
  },

};

/**
 * Builds optgroups for the viewpoint selector. Category order follows first
 * occurrence in {@link VIEWPOINTS} enumeration order (Appendix C order). Keys
 * within each group follow the same object key order.
 *
 * @returns {{ label: string, keys: string[] }[]}
 */
function getViewpointSelectGroups() {
  if (typeof VIEWPOINTS === "undefined" || !VIEWPOINTS) return [];
  const order = [];
  const byCat = new Map();
  for (const [key, vp] of Object.entries(VIEWPOINTS)) {
    if (!vp || typeof vp !== "object") continue;
    const label = String(vp.category || "Other").trim() || "Other";
    if (!byCat.has(label)) {
      byCat.set(label, []);
      order.push(label);
    }
    byCat.get(label).push(key);
  }
  return order.map((label) => ({ label, keys: byCat.get(label) || [] }));
}

/**
 * Optional overrides for viewpoint perspective support (A/B/C) used by the
 * perspective tabs. Leave a bucket undefined to keep computed defaults.
 *
 * Example:
 *   applicationUsage: { A: false }
 */
const VIEWPOINT_PERSPECTIVE_SUPPORT_OVERRIDES = Object.freeze({
});

/**
 * Resolve optional viewpoint-specific relationship vocabulary.
 *
 * Viewpoints may define either:
 * - relationshipCodes: ["I","V",...]
 * - relationshipCategories: ["Structural","Dependency",...]
 *
 * If neither is defined, returns null so pathfinding falls back to matrix-only
 * relationship gating (element palette filtering still applies).
 *
 * @param {string|null|undefined} viewpointKey
 * @returns {Set<string>|null}
 */
function getViewpointRelationshipAllowance(viewpointKey) {
  const key = viewpointKey ? String(viewpointKey) : "";
  if (!key) return null;
  const vp = VIEWPOINTS?.[key];
  if (!vp || vp.allElements) return null;

  const out = new Set();
  const codes = Array.isArray(vp.relationshipCodes) ? vp.relationshipCodes : [];
  for (const raw of codes) {
    const c = String(raw || "").trim().toUpperCase();
    if (c) out.add(c);
  }

  const cats = Array.isArray(vp.relationshipCategories) ? vp.relationshipCategories : [];
  for (const raw of cats) {
    const cat = String(raw || "").trim();
    const rels = RELATIONSHIP_CATEGORIES?.[cat];
    if (!Array.isArray(rels)) continue;
    for (const code of rels) out.add(String(code || "").toUpperCase());
  }

  return out.size ? out : null;
}

/**
 * True when both ends of a hop are in this viewpoint’s element palette and the
 * viewpoint opts in via `pedagogy.sanctionAssociationWithinPalette`.
 *
 * @param {string|null|undefined} viewpointKey
 * @param {string} fromEl
 * @param {string} toEl
 */
function associationPedagogySanctionedForViewpointPalette(viewpointKey, fromEl, toEl) {
  const key = viewpointKey ? String(viewpointKey) : "";
  if (!key || !fromEl || !toEl) return false;
  const vp = VIEWPOINTS?.[key];
  if (!vp || vp.allElements) return false;
  if (vp.pedagogy?.sanctionAssociationWithinPalette !== true) return false;
  const els = vp.elements;
  if (!Array.isArray(els) || els.length === 0) return false;
  const set = new Set(els);
  return set.has(fromEl) && set.has(toEl);
}

/**
 * Whether a §5.2.4 graph Association hop should not be labeled as “informal only” in pedagogy:
 * Value/Meaning on either end, viewpoint palette pairs (see VIEWPOINTS[].pedagogy), or explicit viewpoint O allowlist.
 *
 * @param {{ isAssociation?: boolean, element?: string }|null|undefined} step
 * @param {{ from?: string, to?: string }|null|undefined} semanticHop
 * @param {{ allowedRelationshipCodes?: Set<string>|null, viewpointKey?: string|null, resolvedPrimaryCode?: string }|undefined} [opts]
 */
function isAssociationHopPedagogySanctioned(step, semanticHop, opts) {
  if (step?.isAssociation !== true) return false;
  const fromEl = semanticHop?.from ?? "";
  const toEl = step?.element ?? semanticHop?.to ?? "";
  const vkOpt = opts?.viewpointKey;
  const vk =
    vkOpt != null && String(vkOpt).trim() !== ""
      ? String(vkOpt)
      : typeof window !== "undefined" && window.state?.viewpoint != null
        ? String(window.state.viewpoint)
        : "";
  if (vk && associationPedagogySanctionedForViewpointPalette(vk, fromEl, toEl)) return true;
  if (fromEl === "Value" || fromEl === "Meaning" || toEl === "Value" || toEl === "Meaning") {
    return true;
  }
  const allowed = opts?.allowedRelationshipCodes;
  if (allowed && typeof allowed.has === "function" && allowed.has("O")) return true;
  if ((!allowed || allowed.size === 0) && typeof getViewpointRelationshipAllowance === "function" && vk) {
    const a = getViewpointRelationshipAllowance(vk);
    if (a && a.has("O")) return true;
  }
  return false;
}

/**
 * Short reason line for {@link classifyHopSemanticTier} when Association is pedagogy-sanctioned.
 */
function associationPedagogySanctionReason(step, semanticHop, opts) {
  const fromEl = semanticHop?.from ?? "";
  const toEl = step?.element ?? semanticHop?.to ?? "";
  const vkOpt = opts?.viewpointKey;
  const vk =
    vkOpt != null && String(vkOpt).trim() !== ""
      ? String(vkOpt)
      : typeof window !== "undefined" && window.state?.viewpoint != null
        ? String(window.state.viewpoint)
        : "";
  if (vk && associationPedagogySanctionedForViewpointPalette(vk, fromEl, toEl)) {
    const custom = VIEWPOINTS?.[vk]?.pedagogy?.associationSanctionReason;
    if (typeof custom === "string" && custom.trim()) return custom.trim();
    return "Association (§5.2.4) is treated as in-scope for this viewpoint when both elements are in its palette.";
  }
  if (fromEl === "Value" || fromEl === "Meaning" || toEl === "Value" || toEl === "Meaning") {
    return "Association (§5.2.4) is an ordinary way to relate to Value or Meaning in motivation modeling.";
  }
  return "The active viewpoint explicitly allows Association (O) among its permitted relationship codes.";
}

/**
 * Downgrades a hop that would be “Strong (direct Appendix B)” to Valid when both endpoints are
 * in a viewpoint palette that defines `pedagogy.directStrengthPaletteCap`. Matrix truth is unchanged.
 *
 * @param {{ from?: string, to?: string }|null|undefined} semanticHop
 * @param {{ element?: string }|null|undefined} step
 * @param {{ viewpointKey?: string|null }|undefined} [opts]
 * @returns {{ strength: string, title: string, reason: string, badgeMapping: string, viewpointPaletteCap: boolean, skipRouteChainDowngrade: boolean }|null}
 */
function viewpointPaletteCapsDirectStrengthTier(semanticHop, step, opts) {
  const fromEl = semanticHop?.from ?? "";
  const toEl = step?.element ?? semanticHop?.to ?? "";
  const vkOpt = opts?.viewpointKey;
  const vk =
    vkOpt != null && String(vkOpt).trim() !== ""
      ? String(vkOpt)
      : typeof window !== "undefined" && window.state?.viewpoint != null
        ? String(window.state.viewpoint)
        : "";
  if (!vk || !fromEl || !toEl) return null;
  if (!associationPedagogySanctionedForViewpointPalette(vk, fromEl, toEl)) return null;
  const cap = VIEWPOINTS?.[vk]?.pedagogy?.directStrengthPaletteCap;
  if (!cap || typeof cap !== "object") return null;
  const title = typeof cap.title === "string" ? cap.title.trim() : "";
  const reason = typeof cap.reason === "string" ? cap.reason.trim() : "";
  if (!title || !reason) return null;
  return {
    strength: "Valid",
    title,
    reason,
    badgeMapping: "Viewpoint",
    viewpointPaletteCap: true,
    skipRouteChainDowngrade: true,
  };
}
