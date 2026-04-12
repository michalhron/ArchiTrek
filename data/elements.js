// === data/elements.js ===
/**
 * ArchiMate 3.1 — Element Definitions
 * Source: Chapters 4–9, element definition tables
 * https://pubs.opengroup.org/architecture/archimate32-doc/
 *
 * Used by ui/explainer.js to generate static, spec-grounded justifications.
 * Each entry:
 *   definition  — verbatim or close-paraphrase one-sentence spec definition
 *   section     — spec section reference
 *   aspect      — Active Structure | Behavior | Passive Structure | Composite | Motivation
 */

const ELEMENT_DEFINITIONS = {

  // ── MOTIVATION ─────────────────────────────────────────────────────────────

  "Stakeholder": {
    definition: "Represents the role of an individual, team, or organization that represents their interests in the effects of the architecture.",
    section: "§6.1.1", aspect: "Active Structure",
  },
  "Driver": {
    definition: "Represents an external or internal condition that motivates an organization to change.",
    section: "§6.2.1", aspect: "Motivation",
  },
  "Assessment": {
    definition: "Represents the result of an analysis of the state of affairs of the enterprise with respect to some driver.",
    section: "§6.2.2", aspect: "Motivation",
  },
  "Goal": {
    definition: "Represents a high-level statement of intent, direction, or desired end state for an organization and its stakeholders.",
    section: "§6.3.1", aspect: "Motivation",
  },
  "Outcome": {
    definition: "Represents an end result that has been achieved.",
    section: "§6.3.2", aspect: "Motivation",
  },
  "Principle": {
    definition: "Represents intent expressed as a general property that applies to any system in a certain context.",
    section: "§6.3.3", aspect: "Motivation",
  },
  "Requirement": {
    definition: "Represents need expressed as a property that applies to the specific system described by the architecture.",
    section: "§6.3.4", aspect: "Motivation",
  },
  "Constraint": {
    definition: "Represents a factor that limits the realization of goals.",
    section: "§6.3.5", aspect: "Motivation",
  },
  "Meaning": {
    definition: "Represents the knowledge or expertise present in, or the interpretation given to, a concept in a particular context.",
    section: "§6.4.1", aspect: "Passive Structure",
  },
  "Value": {
    definition: "Represents the relative worth, utility, or importance of a concept.",
    section: "§6.4.2", aspect: "Passive Structure",
  },

  // ── STRATEGY ───────────────────────────────────────────────────────────────

  "Resource": {
    definition: "Represents an asset owned or controlled by an individual or organization.",
    section: "§7.1.1", aspect: "Active Structure",
  },
  "Capability": {
    definition: "Represents an ability that an active structure element, such as an organization, person, or system, possesses.",
    section: "§7.2.1", aspect: "Behavior",
  },
  "Value Stream": {
    definition: "Represents a sequence of activities that create an overall result for a customer, stakeholder, or end user.",
    section: "§7.2.2", aspect: "Behavior",
  },
  "Course of Action": {
    definition: "Represents an approach or plan for configuring some capabilities and resources of the enterprise, undertaken to achieve a goal.",
    section: "§7.2.3", aspect: "Behavior",
  },

  // ── BUSINESS ───────────────────────────────────────────────────────────────

  "Business Actor": {
    definition: "Represents a business entity that is capable of performing behavior.",
    section: "§8.1.1", aspect: "Active Structure",
  },
  "Business Role": {
    definition: "Represents the responsibility for performing specific behavior, to which an actor can be assigned.",
    section: "§8.1.2", aspect: "Active Structure",
  },
  "Business Collaboration": {
    definition: "Represents an aggregate of two or more business roles that work together to perform collective behavior.",
    section: "§8.1.3", aspect: "Active Structure",
  },
  "Business Interface": {
    definition: "Represents a point of access where a business service is made available to the environment.",
    section: "§8.1.4", aspect: "Active Structure",
  },
  "Business Process": {
    definition: "Represents a sequence of business behaviors that achieves a specific result such as a defined set of products or services.",
    section: "§8.2.1", aspect: "Behavior",
  },
  "Business Function": {
    definition: "Represents a collection of business behavior based on a chosen set of criteria such as required business resources and/or competencies.",
    section: "§8.2.2", aspect: "Behavior",
  },
  "Business Interaction": {
    definition: "Represents a unit of collective business behavior performed by two or more business roles.",
    section: "§8.2.3", aspect: "Behavior",
  },
  "Business Event": {
    definition: "Represents an organizational state change.",
    section: "§8.2.4", aspect: "Behavior",
  },
  "Business Service": {
    definition: "Represents an explicitly defined exposed business behavior.",
    section: "§8.2.5", aspect: "Behavior",
  },
  "Business Object": {
    definition: "Represents a concept used within a particular business domain.",
    section: "§8.3.1", aspect: "Passive Structure",
  },
  "Contract": {
    definition: "Represents a formal or informal specification of an agreement between a provider and a consumer that specifies the rights and obligations associated with a product.",
    section: "§8.3.2", aspect: "Passive Structure",
  },
  "Representation": {
    definition: "Represents a perceptible form of the information carried by a business object.",
    section: "§8.3.3", aspect: "Passive Structure",
  },
  "Product": {
    definition: "Represents a coherent collection of services and/or passive structure elements, accompanied by a contract, which is offered as a whole to (internal or external) customers.",
    section: "§8.4.1", aspect: "Composite",
  },

  // ── APPLICATION ────────────────────────────────────────────────────────────

  "Application Component": {
    definition: "Represents an encapsulation of application functionality aligned to implementation structure, which is modular and replaceable.",
    section: "§9.1.1", aspect: "Active Structure",
  },
  "Application Collaboration": {
    definition: "Represents an aggregate of two or more application components that work together to perform collective application behavior.",
    section: "§9.1.2", aspect: "Active Structure",
  },
  "Application Interface": {
    definition: "Represents a point of access where application services are made available to a user, another application component, or a node.",
    section: "§9.1.3", aspect: "Active Structure",
  },
  "Application Function": {
    definition: "Represents automated behavior that can be performed by an application component.",
    section: "§9.2.1", aspect: "Behavior",
  },
  "Application Interaction": {
    definition: "Represents a unit of collective application behavior performed by two or more application components.",
    section: "§9.2.2", aspect: "Behavior",
  },
  "Application Process": {
    definition: "Represents a sequence of application behaviors in the application layer that achieves a specific result.",
    section: "§9.2.3", aspect: "Behavior",
  },
  "Application Event": {
    definition: "Represents an application state change.",
    section: "§9.2.4", aspect: "Behavior",
  },
  "Application Service": {
    definition: "Represents an explicitly defined exposed application behavior.",
    section: "§9.2.5", aspect: "Behavior",
  },
  "Data Object": {
    definition: "Represents data structured for automated processing.",
    section: "§9.3.1", aspect: "Passive Structure",
  },

  // ── TECHNOLOGY ─────────────────────────────────────────────────────────────

  "Node": {
    definition: "Represents a computational or physical resource that hosts, manipulates, or interacts with other computational or physical resources.",
    section: "§10.1.1", aspect: "Active Structure",
  },
  "Device": {
    definition: "Represents a physical IT resource upon which system software and artifacts may be stored or deployed for execution.",
    section: "§10.1.2", aspect: "Active Structure",
  },
  "System Software": {
    definition: "Represents software that provides or contributes to an environment for storing, executing, and using software or data deployed within it.",
    section: "§10.1.3", aspect: "Active Structure",
  },
  "Technology Collaboration": {
    definition: "Represents an aggregate of two or more nodes that work together to perform collective technology behavior.",
    section: "§10.1.4", aspect: "Active Structure",
  },
  "Technology Interface": {
    definition: "Represents a point of access where technology services offered by a node can be accessed.",
    section: "§10.1.5", aspect: "Active Structure",
  },
  "Path": {
    definition: "Represents a link between two or more nodes through which these nodes can exchange data, energy, or material.",
    section: "§10.1.6", aspect: "Active Structure",
  },
  "Communication Network": {
    definition: "Represents a set of structures that connects nodes for transmission, routing, and reception of data.",
    section: "§10.1.7", aspect: "Active Structure",
  },
  "Technology Function": {
    definition: "Represents a collection of technology behavior that can be performed by a node.",
    section: "§10.2.1", aspect: "Behavior",
  },
  "Technology Process": {
    definition: "Represents a sequence of technology behaviors in the technology layer that achieves a specific result.",
    section: "§10.2.2", aspect: "Behavior",
  },
  "Technology Interaction": {
    definition: "Represents a unit of collective technology behavior performed by two or more nodes.",
    section: "§10.2.3", aspect: "Behavior",
  },
  "Technology Event": {
    definition: "Represents a technology state change.",
    section: "§10.2.4", aspect: "Behavior",
  },
  "Technology Service": {
    definition: "Represents an explicitly defined exposed technology behavior.",
    section: "§10.2.5", aspect: "Behavior",
  },
  "Artifact": {
    definition: "Represents a piece of data that is used or produced in a software development process, or by deployment and operation of an IT system.",
    section: "§10.3.1", aspect: "Passive Structure",
  },

  // ── §10.4 Equipment & facility (Technology layer in this app) ────────────────

  "Equipment": {
    definition: "Represents one or more physical machines, tools, or instruments that can create, use, store, move, or transform materials.",
    section: "§10.4.1", aspect: "Active Structure",
  },
  "Facility": {
    definition: "Represents a physical structure or environment.",
    section: "§10.4.2", aspect: "Active Structure",
  },
  "Distribution Network": {
    definition: "Represents a physical network used to transport materials or energy.",
    section: "§10.4.3", aspect: "Active Structure",
  },
  "Material": {
    definition: "Represents tangible physical matter or physical elements.",
    section: "§10.4.4", aspect: "Passive Structure",
  },

  // ── IMPLEMENTATION & MIGRATION ─────────────────────────────────────────────

  "Work Package": {
    definition: "Represents a series of actions identified and designed to achieve specific results within specified time and resource constraints.",
    section: "§13.1.1", aspect: "Behavior",
  },
  "Deliverable": {
    definition: "Represents a precisely-defined result of a work package.",
    section: "§13.1.2", aspect: "Passive Structure",
  },
  "Implementation Event": {
    definition: "Represents a state change related to implementation or migration.",
    section: "§13.1.3", aspect: "Behavior",
  },
  "Plateau": {
    definition: "Represents a relatively stable state of the architecture that exists during a limited period of time.",
    section: "§13.1.4", aspect: "Composite",
  },
  "Gap": {
    definition: "Represents a statement of difference between two plateaus.",
    section: "§13.1.5", aspect: "Composite",
  },

  // ── COMPOSITE ──────────────────────────────────────────────────────────────

  "Location": {
    definition: "Represents a conceptual or physical place or position where concepts are located or where behavior is performed.",
    section: "§11.1.1", aspect: "Composite",
  },
  // "Grouping": {
  //   definition: "Represents an aggregation of concepts that belong together based on some common characteristic.",
  //   section: "§11.1.2", aspect: "Composite",
  // },

};
