// === data/relationships.js ===
/**
 * ArchiMate 3.1 — Relationship Type Definitions
 * Source: Chapter 5, Relationships and Relationship Connectors
 * https://pubs.opengroup.org/architecture/archimate32-doc/ch-Relationships-and-Relationship-Connectors.html
 */

const RELATIONSHIPS = {
  C: { code:"C", name:"Composition", category:"Structural", section:"§5.1.1",
    definition:"Represents that an element consists of one or more other concepts.",
    description:"Whole/part relationship with existence dependency. If a composite is deleted, its parts are (normally) deleted as well. Always allowed between two instances of the same element type. The whole or part of the source is composed of the whole of the target.",
    notation:{ line:"solid", startMarker:"diamond-filled", endMarker:"none" },
    roleNames:{ forward:"composed of", backward:"composed in" } },

  G: { code:"G", name:"Aggregation", category:"Structural", section:"§5.1.2",
    definition:"Represents that an element combines one or more other concepts.",
    description:"Unlike composition, aggregation does not imply existence dependency. Always allowed between two instances of the same element type. The whole or part of the source aggregates the whole of the target concept.",
    notation:{ line:"solid", startMarker:"diamond-open", endMarker:"none" },
    roleNames:{ forward:"aggregates", backward:"aggregated in" } },

  I: { code:"I", name:"Assignment", category:"Structural", section:"§5.1.3",
    definition:"Represents the allocation of responsibility, performance of behavior, storage, or execution.",
    description:"Links active structure elements with units of behavior that are performed by them, business actors with business roles they fulfil, and nodes with technology passive structure elements. Always points from active structure to behavior, or from active/behavior to passive structure.",
    notation:{ line:"solid", startMarker:"circle-filled", endMarker:"arrow-filled" },
    roleNames:{ forward:"assigned to", backward:"has assigned" } },

  R: { code:"R", name:"Realization", category:"Structural", section:"§5.1.4",
    definition:"Represents that an element plays a critical role in the creation, achievement, sustenance, or operation of a more abstract element.",
    description:"More abstract elements ('what'/'logical') are realized by more tangible elements ('how'/'physical'). Used for run-time realization, e.g. a business process realizes a business service, a data object realizes a business object, or a core element realizes a motivation element. For weaker effects, use Influence instead.",
    notation:{ line:"dashed", startMarker:"none", endMarker:"arrow-open" },
    roleNames:{ forward:"realizes", backward:"realized by" } },

  V: { code:"V", name:"Serving", category:"Dependency", section:"§5.2.1",
    definition:"Represents that an element provides its functionality to another element.",
    description:"Describes how services or interfaces offered by a behavior or active structure element serve entities in their environment. Direction is from server to client, abstracting from whether the service is delivered proactively or reactively. Previously called 'used by' in earlier ArchiMate versions.",
    notation:{ line:"solid", startMarker:"none", endMarker:"arrow-open" },
    roleNames:{ forward:"serves", backward:"served by" } },

  A: { code:"A", name:"Access", category:"Dependency", section:"§5.2.2",
    definition:"Represents the ability of behavior and active structure elements to observe or act upon passive structure elements.",
    description:"Indicates that a process, function, interaction, service, or event creates, reads, writes, modifies, or deletes a passive structure element. Direction is always from active structure/behavior to passive structure at the metamodel level, though the arrowhead notation may vary to indicate read, write, or read-write access.",
    notation:{ line:"dashed", startMarker:"none", endMarker:"arrow-open" },
    roleNames:{ forward:"accesses", backward:"accessed by" } },

  N: { code:"N", name:"Influence", category:"Dependency", section:"§5.2.3",
    definition:"Represents that an element affects the implementation or achievement of some motivation element.",
    description:"Used when an architectural element influences—positively or negatively—the achievement of a motivation element such as a goal or principle. Attributes can indicate sign and strength (e.g. {++, +, 0, -, --}). Use Realization when the effect is critical to the target's existence; use Influence for non-critical contributions.",
    notation:{ line:"dashed", startMarker:"none", endMarker:"arrow-open" },
    roleNames:{ forward:"influences", backward:"influenced by" } },

  O: { code:"O", name:"Association", category:"Dependency", section:"§5.2.4",
    definition:"Represents an unspecified relationship, or one that is not represented by another ArchiMate relationship.",
    description:"Always allowed between any two elements, or between a relationship and an element. Useful for initial high-level models where relationships are denoted generically and later refined. Undirected by default, but may be directed.",
    notation:{ line:"solid", startMarker:"none", endMarker:"none" },
    roleNames:{ forward:"associated to", backward:"associated from" } },

  T: { code:"T", name:"Triggering", category:"Dynamic", section:"§5.3.1",
    definition:"Represents a temporal or causal relationship between elements.",
    description:"Models the temporal or causal precedence of behavior elements: some part of the source should be completed before the target can start. Does not require that the source actively starts the target — a passive condition can also constitute a trigger.",
    notation:{ line:"solid", startMarker:"none", endMarker:"arrow-filled" },
    roleNames:{ forward:"triggers", backward:"triggered by" } },

  F: { code:"F", name:"Flow", category:"Dynamic", section:"§5.3.2",
    definition:"Represents transfer from one element to another.",
    description:"Models the flow of information, goods, or money between behavior elements. A flow relationship does not imply a causal relationship — the whole or some part of the source transfers something to the whole or some part of the target.",
    notation:{ line:"dashed", startMarker:"none", endMarker:"arrow-filled" },
    roleNames:{ forward:"flows to", backward:"flows from" } },

  S: { code:"S", name:"Specialization", category:"Other", section:"§5.4.1",
    definition:"Represents that an element is a particular kind of another element.",
    description:"Inspired by UML generalization but applicable to a wider range of ArchiMate concepts. Always allowed between two instances of the same element type. The whole of the generic element is specialized by the specialized element.",
    notation:{ line:"solid", startMarker:"none", endMarker:"triangle-open" },
    roleNames:{ forward:"specializes", backward:"specialized by" } },
};

const RELATIONSHIP_CATEGORIES = {
  Structural: ["C","G","I","R"],
  Dependency: ["V","A","N","O"],
  Dynamic:    ["T","F"],
  Other:      ["S"],
};

/** Always permitted between two instances of the same element type (§5 rules). */
const ALWAYS_PERMITTED_SAME_TYPE = ["S","C","G"];

/** Association is universal (§5.2.4); not listed per cell in Appendix B. Pathfinder adds O arcs with a penalty unless the user allows fallback. */
const EXCLUDED_FROM_PATHFINDING = ["O"];
