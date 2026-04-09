// === data/viewpoints.js ===
/**
 * ArchiMate 3.1 — Viewpoint Definitions
 * Source: Appendix C, Example Viewpoints
 * https://pubs.opengroup.org/architecture/archimate32-doc/ch-Example-Viewpoints.html
 *
 * When a viewpoint filter is active, elements outside its palette are greyed
 * out in the selectors and excluded from pathfinding.
 * The Layered viewpoint (allElements:true) permits everything — no filtering.
 *
 * Note: These are example viewpoints, not normative. Organisations may define
 * their own. Source: Appendix C opening paragraph.
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
  },

  technology: {
    name: "Technology", category: "Composition", section: "§C.1.4",
    scope: "Single layer / Multiple aspects",
    stakeholders: "Infrastructure Architects, Operational Managers",
    concerns: "Stability, security, dependencies, costs of the infrastructure",
    purpose: "Designing",
    elements: [
      "Location", "Node", "Device", "System Software",
      "Technology Collaboration", "Technology Interface",
      "Communication Network", "Path",
      "Technology Function", "Technology Process", "Technology Interaction",
      "Technology Service", "Technology Event", "Artifact",
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

  physical: {
    name: "Physical", category: "Composition", section: "§C.1.6",
    scope: "Multiple layers / Multiple aspects",
    stakeholders: "Infrastructure Architects, Operational Managers",
    concerns: "Relationships and dependencies of the physical environment and its relation to IT infrastructure",
    purpose: "Designing",
    elements: [
      "Location", "Node", "Device", "Equipment", "Facility",
      "Path", "Communication Network", "Distribution Network", "Material",
    ],
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
      "Data Object", "System Software", "Technology Interface",
    ],
  },

};

const VIEWPOINT_CATEGORIES = {
  Composition:  ["organization","applicationStructure","informationStructure","technology","layered","physical"],
  Support:      ["product","applicationUsage","technologyUsage"],
  Cooperation:  ["businessProcessCooperation","applicationCooperation"],
  Realization:  ["serviceRealization","implementationAndDeployment"],
};

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
// === data/metamodel.js ===
/**
 * ArchiMate 3.1 — Metamodel Aspect Compatibility Rules
 * Source: Chapter 4 (§4.2–§4.4), The ArchiMate Framework
 * https://pubs.opengroup.org/architecture/archimate32-doc/ch-Introduction.html
 *
 * The ArchiMate metamodel organises elements into three ASPECTS:
 *   Active Structure  — entities that perform behavior (actors, components, nodes)
 *   Behavior          — activities performed by active structure (processes, functions, services)
 *   Passive Structure — objects acted upon by behavior (data, business objects, artifacts)
 *
 * And three LAYERS (plus Motivation, Strategy, Implementation):
 *   Business / Application / Technology
 *
 * This file encodes:
 *   1. ASPECT_RULES  — which relationship CATEGORIES are permitted between aspect pairs
 *   2. CATEGORY_RULES — which specific relationships belong to each category
 *   3. NEGATIVE_REASONS — why a connection between two aspects is invalid
 *   4. POSITIVE_REASONS — why a connection between two aspects is valid
 *
 * Used by ui/explainer.js to generate pedagogically grounded explanations.
 */

// ─────────────────────────────────────────────────────────────────────────────
// ASPECT DEFINITIONS
// Maps the 'aspect' field from ELEMENTS to a canonical id and display label.
// ─────────────────────────────────────────────────────────────────────────────

const ASPECTS = {
  "Active Structure": {
    id: "active",
    label: "Active Structure",
    description: "Entities that have the ability to perform behavior — organizations, actors, application components, nodes, devices.",
    color: "#dce8f5",
  },
  "Behavior": {
    id: "behavior",
    label: "Behavior",
    description: "Units of activity performed by one or more active structure elements — processes, functions, services, interactions, events.",
    color: "#fff8d0",
  },
  "Passive Structure": {
    id: "passive",
    label: "Passive Structure",
    description: "Objects on which behavior is performed — business objects, data objects, artifacts, materials.",
    color: "#e0f0e0",
  },
  "Motivation": {
    id: "motivation",
    label: "Motivation",
    description: "Elements that express intentions, rationale, and drivers — goals, requirements, constraints, principles.",
    color: "#f0e0f0",
  },
  "Composite": {
    id: "composite",
    label: "Composite",
    description: "Elements that can aggregate or group other elements regardless of aspect — grouping, location, product, plateau.",
    color: "#f0f0f0",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// ASPECT COMPATIBILITY RULES
// Key format: "fromAspect→toAspect"
// Value: array of permitted relationship CATEGORIES (from RELATIONSHIP_CATEGORIES)
//        plus specific codes that are particularly natural for this pair.
//
// Source: §4.2 (metamodel figure), §5 relationship rules, Appendix B patterns.
// ─────────────────────────────────────────────────────────────────────────────

const ASPECT_RULES = {

  // ── Active Structure → * ──────────────────────────────────────────────────

  "active→active": {
    permitted: ["Structural", "Dependency", "Other"],
    naturalCodes: ["I", "C", "G", "S", "V"],
    explanation: "Active structure elements may be composed, aggregated, assigned to one another, and may serve each other via interfaces.",
    section: "§4.2, §5.1, §5.2",
  },
  "active→behavior": {
    permitted: ["Structural", "Dependency", "Dynamic", "Other"],
    naturalCodes: ["I", "V"],
    explanation: "Active structure elements are assigned to the behavior they perform. This is the core structural link in the ArchiMate metamodel — an actor performs a process, a component executes a function.",
    section: "§4.2, §5.1.3",
  },
  "active→passive": {
    permitted: ["Dependency"],
    naturalCodes: ["A"],
    explanation: "Active structure elements can access passive structure elements — they create, read, write, or delete them.",
    section: "§4.2, §5.2.2",
  },
  "active→motivation": {
    permitted: ["Structural", "Dependency"],
    naturalCodes: ["R", "N"],
    explanation: "Active structure elements can realize or influence motivation elements — for example, a business role realizes a requirement, or a system influences a goal.",
    section: "§4.3, §6",
  },
  "active→composite": {
    permitted: ["Structural", "Dependency", "Other"],
    naturalCodes: ["I", "V"],
    explanation: "Active structure elements may be assigned to or serve composite elements such as products or locations.",
    section: "§4.2",
  },

  // ── Behavior → * ─────────────────────────────────────────────────────────

  "behavior→behavior": {
    permitted: ["Structural", "Dependency", "Dynamic", "Other"],
    naturalCodes: ["T", "F", "V", "R"],
    explanation: "Behavior elements may trigger each other, exchange flows, realize higher-level behavior, or serve one another. This is how process chains and service hierarchies are modelled.",
    section: "§4.2, §5.2.1, §5.3",
  },
  "behavior→active": {
    permitted: ["Structural", "Dependency", "Other"],
    naturalCodes: ["I", "V"],
    explanation: "Behavior elements may be assigned back to active structure, or may serve active structure elements. For example, a service is assigned to an interface.",
    section: "§4.2, §5.1.3",
  },
  "behavior→passive": {
    permitted: ["Dependency"],
    naturalCodes: ["A", "R"],
    explanation: "Behavior elements access or realize passive structure elements — a process reads a data object, a function produces a business object.",
    section: "§4.2, §5.2.2",
  },
  "behavior→motivation": {
    permitted: ["Structural", "Dependency"],
    naturalCodes: ["R", "N"],
    explanation: "Behavior elements (processes, functions, services) can realize or influence motivation elements — a capability realizes a requirement, a process influences a goal.",
    section: "§4.3, §6",
  },
  "behavior→composite": {
    permitted: ["Structural", "Dependency"],
    naturalCodes: ["R", "V"],
    explanation: "Behavior elements may realize or serve composite elements such as products.",
    section: "§4.2",
  },

  // ── Passive Structure → * ─────────────────────────────────────────────────

  "passive→passive": {
    permitted: ["Structural", "Dependency", "Other"],
    naturalCodes: ["C", "G", "S", "A", "R"],
    explanation: "Passive structure elements may be composed, aggregated, specialized, and may realize one another across layers — for example, a Data Object realizes a Business Object.",
    section: "§4.2, §5.1",
  },
  "passive→active": {
    permitted: [],
    naturalCodes: [],
    explanation: "Passive structure elements do not directly connect to active structure elements in the ArchiMate metamodel. Passive elements are acted upon — they do not perform or assign.",
    section: "§4.2",
    invalid: true,
  },
  "passive→behavior": {
    permitted: [],
    naturalCodes: [],
    explanation: "Passive structure elements do not directly trigger or serve behavior elements. It is the behavior that acts on passive structure, not the other way around.",
    section: "§4.2",
    invalid: true,
  },
  "passive→motivation": {
    permitted: ["Structural", "Dependency"],
    naturalCodes: ["R", "N"],
    explanation: "Passive structure elements can realize motivation elements — for example, a contract realizes a requirement, or a business object influences a goal.",
    section: "§4.3",
  },

  // ── Motivation → * ───────────────────────────────────────────────────────

  "motivation→motivation": {
    permitted: ["Structural", "Dependency", "Other"],
    naturalCodes: ["N", "R", "C", "G", "S"],
    explanation: "Motivation elements influence and realize each other — drivers trigger assessments, goals are realized by requirements, principles constrain requirements.",
    section: "§6",
  },
  "motivation→active": {
    permitted: [],
    naturalCodes: [],
    explanation: "Motivation elements do not directly connect downward to active structure elements in the metamodel. Core elements realize or influence motivation elements, not the reverse.",
    section: "§4.3",
    invalid: true,
  },
  "motivation→behavior": {
    permitted: [],
    naturalCodes: [],
    explanation: "Motivation elements do not connect directly to behavior elements. The relationship runs the other way: behavior elements realize motivation elements.",
    section: "§4.3",
    invalid: true,
  },
  "motivation→passive": {
    permitted: [],
    naturalCodes: [],
    explanation: "Motivation elements do not connect directly to passive structure elements in the standard metamodel.",
    section: "§4.3",
    invalid: true,
  },

  // ── Composite → * ────────────────────────────────────────────────────────

  "composite→active": {
    permitted: ["Structural", "Dependency"],
    naturalCodes: ["C", "G", "V"],
    explanation: "Composite elements (e.g. Product, Location) may aggregate or serve active structure elements.",
    section: "§4.2",
  },
  "composite→behavior": {
    permitted: ["Structural", "Dependency"],
    naturalCodes: ["C", "G", "R"],
    explanation: "Composite elements may aggregate behavior elements — for example a Product aggregates a Business Service.",
    section: "§4.2",
  },
  "composite→passive": {
    permitted: ["Structural", "Dependency"],
    naturalCodes: ["C", "G"],
    explanation: "Composite elements may aggregate passive structure elements — for example a Product aggregates a Contract.",
    section: "§4.2",
  },
  "composite→composite": {
    permitted: ["Structural", "Other"],
    naturalCodes: ["C", "G", "S"],
    explanation: "Composite elements may be composed, aggregated, or specialized.",
    section: "§4.2",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// LAYER CROSS-CONNECTIONS
// Explains why cross-layer relationships are valid (Serving/Realization pattern).
// Source: §4.2, the ArchiMate layer model.
// ─────────────────────────────────────────────────────────────────────────────

const LAYER_RULES = {
  "Technology→Application": {
    pattern: "Serving / Realization",
    explanation: "Technology layer elements serve or realize Application layer elements. A Node or Device hosts an Application Component; a Technology Service is used by an Application Service.",
    section: "§4.2, §10",
  },
  "Application→Business": {
    pattern: "Serving / Realization",
    explanation: "Application layer elements serve or realize Business layer elements. An Application Service is used by a Business Process; an Application Component realizes a Business Function.",
    section: "§4.2, §9",
  },
  "Technology→Business": {
    pattern: "Derived Serving",
    explanation: "A derived cross-layer relationship. Technology serves Business indirectly via the Application layer. Per §5.7 derivation rules, if Tech serves App and App serves Business, Tech derivedly serves Business.",
    section: "§4.2, §5.7",
  },
  "Physical→Technology": {
    pattern: "Serving / Realization",
    explanation: "Physical layer elements (Equipment, Facility) serve or realize Technology layer elements. Equipment hosts Devices; a Facility contains Nodes.",
    section: "§4.2, §10.4",
  },
  "Strategy→Business": {
    pattern: "Realization",
    explanation: "Strategy elements are realized by Business layer elements. A Capability is realized by a Business Process or Function; a Course of Action is realized by Business behavior.",
    section: "§4.2, §7",
  },
  "Motivation→Strategy": {
    pattern: "Influence / Realization",
    explanation: "Motivation elements influence or are realized by Strategy elements. A Requirement is realized by a Capability; a Goal is influenced by a Value Stream.",
    section: "§4.3, §6–§7",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// RELATIONSHIP CATEGORY RULES
// Which relationship types belong to which metamodel category.
// Used by the explanation to say e.g. "Triggering is a Dynamic relationship,
// only permitted between Behavior elements."
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORY_ASPECT_CONSTRAINTS = {
  "Structural": {
    label: "Structural",
    description: "Define how elements are made up of, or are assigned to, other elements.",
    permittedFromAspects: ["active", "behavior", "passive", "composite", "motivation"],
    permittedToAspects:   ["active", "behavior", "passive", "composite", "motivation"],
    note: "Structural relationships (Composition, Aggregation, Assignment, Realization) are broadly permitted but follow directionality rules.",
  },
  "Dynamic": {
    label: "Dynamic",
    description: "Model causal or temporal dependencies between behavior elements.",
    permittedFromAspects: ["behavior"],
    permittedToAspects:   ["behavior"],
    note: "Triggering and Flow are Dynamic relationships. They are ONLY permitted between Behavior elements. Attempting to trigger a Passive or Active Structure element directly is not valid in the metamodel.",
  },
  "Dependency": {
    label: "Dependency",
    description: "Express how elements are used by, or influence, other elements.",
    permittedFromAspects: ["active", "behavior", "passive", "composite", "motivation"],
    permittedToAspects:   ["active", "behavior", "passive", "composite", "motivation"],
    note: "Dependency relationships (Serving, Access, Influence, Association) follow directionality rules. Access is specifically from active/behavior to passive structure.",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// SPECIFIC RELATIONSHIP DIRECTIONALITY RULES
// Additional rules beyond aspect compatibility, used for fine-grained explanations.
// Source: §5.x individual relationship sections.
// ─────────────────────────────────────────────────────────────────────────────

const RELATIONSHIP_DIRECTIONALITY = {
  "I": {
    rule: "Assignment goes FROM active structure TO behavior, or FROM active structure TO passive structure.",
    invalidExample: "A Passive Structure element cannot assign a Behavior element.",
    section: "§5.1.3",
  },
  "A": {
    rule: "Access goes FROM behavior or active structure TO passive structure only.",
    invalidExample: "A Passive Structure element cannot access another element — it is the object of access, not the subject.",
    section: "§5.2.2",
  },
  "T": {
    rule: "Triggering is only valid between Behavior elements.",
    invalidExample: "An Active Structure or Passive Structure element cannot trigger or be triggered directly.",
    section: "§5.3.1",
  },
  "F": {
    rule: "Flow is only valid between Behavior elements.",
    invalidExample: "Flow cannot originate from or arrive at a Passive or Active Structure element directly.",
    section: "§5.3.2",
  },
  "V": {
    rule: "Serving goes FROM the serving element TO the element being served. Direction is server → client.",
    invalidExample: "The direction of Serving is from the provider to the consumer, not the reverse.",
    section: "§5.2.1",
  },
  "R": {
    rule: "Realization goes FROM the more concrete element TO the more abstract element.",
    invalidExample: "A motivation element does not realize a core element — it is the core element that realizes the motivation element.",
    section: "§5.1.4",
  },
};
