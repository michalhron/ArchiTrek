// === data/metamodel.js ===
/**
 * ArchiMate 3.2 — Metamodel aspect compatibility rules
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
 *   2. CATEGORY_ASPECT_CONSTRAINTS — relationship-category semantics vs aspects
 *   3. LAYER_RULES — cross-layer serving / realization patterns
 *   4. RELATIONSHIP_DIRECTIONALITY — §5.x direction rules for selected codes
 *
 * Used by ui/app.js and ui/renderer.js for explanations and metamodel UI.
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
