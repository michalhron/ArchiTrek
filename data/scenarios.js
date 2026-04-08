// === data/scenarios.js ===
/**
 * Study / exam scenario data: domain labels mapped to ArchiMate element types.
 * Add domains in examScenarios (per-type label lists) and/or SCENARIOS.terms.
 */

/**
 * @param {Record<string, string[]>|undefined|null} byElement
 * @returns {{ label: string, element: string }[]}
 */
function expandExamScenario(byElement) {
  const terms = [];
  if (!byElement || typeof byElement !== "object") return terms;
  for (const [element, labels] of Object.entries(byElement)) {
    if (!Array.isArray(labels)) continue;
    for (const label of labels) {
      if (label != null && String(label).trim()) {
        terms.push({ label: String(label).trim(), element });
      }
    }
  }
  return terms;
}

/** Bulk label lists by ArchiMate element type (expand into SCENARIOS.hospital). */
const examScenarios = {
  Hospital: {
    "Business Role": ["Attending Physician", "Triage Nurse", "Hospital Administrator"],
    "Business Actor": ["Patient", "Insurance Adjuster"],
    "Business Process": ["Admit Patient", "Discharge Patient", "Process Claim"],
    "Business Service": ["Emergency Care", "Outpatient Surgery"],
    "Application Component": [
      "EHR (Electronic Health Record) System",
      "Billing Module",
      "Lab Results Database",
    ],
    "Data Object": ["Patient Chart", "Insurance Claim Record"],
    Node: ["Hospital Server", "Mobile Tablet"],
    Value: ["Patient Safety", "Data Privacy"],
  },
  Airline: {
    // Extend here later; SCENARIOS.airline.terms holds the hand-authored list for now.
  },
};

/**
 * Engine-facing scenarios: scenario id → { domain, terms }.
 * Keys are lowercase ids passed to generateValidSubGraph('hospital', ...).
 */
const SCENARIOS = {
  hospital: {
    domain: "Hospital",
    terms: expandExamScenario(examScenarios.Hospital),
  },
  airline: {
    domain: "Airline Operations",
    terms: [
      { label: "Flight Crew", element: "Business Role" },
      { label: "Gate Agent", element: "Business Role" },
      { label: "Passenger", element: "Business Actor" },
      { label: "Check-in Passenger", element: "Business Process" },
      { label: "Board Flight", element: "Business Process" },
      { label: "Baggage Routing", element: "Business Function" },
      { label: "Flight Booking", element: "Business Service" },
      { label: "Reservation System (GDS)", element: "Application Component" },
      { label: "Mobile Boarding App", element: "Application Component" },
      { label: "Flight Manifest", element: "Data Object" },
      { label: "E-Ticket", element: "Data Object" },
      { label: "Check-in Kiosk", element: "Node" },
      { label: "Luggage Scanner", element: "Equipment" },
      { label: "On-time Departure", element: "Value" },
      { label: "Safety Compliance", element: "Constraint" },
    ],
  },
};
