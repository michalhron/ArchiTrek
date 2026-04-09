// === data/derivationLogic.js ===
/**
 * Lightweight pedagogy lookup for §5.7 derived relationship explanations.
 * Keys are relationship codes (uppercase).
 *
 * `formula` is a short "chain math" string for the Derivation Logic panel.
 * `studentText` is a plain-language sentence appended to hop justification.
 */
const DERIVATION_LOGIC_BY_CODE = Object.freeze({
  V: {
    formula: "Structural + Dependency = Dependency",
    studentText:
      "This is a Derived relationship based on a structural chain that preserves a dependency relation.",
  },
  R: {
    formula: "Structural + Realization = Realization",
    studentText:
      "This is a Derived relationship where structural context keeps the Realization semantics intact.",
  },
  A: {
    formula: "Behavior + Passive access chain = Access",
    studentText:
      "This is a Derived relationship inferred from behavior operating on passive structure through an allowed chain.",
  },
  T: {
    formula: "Behavior chain + temporal dependency = Triggering",
    studentText:
      "This is a Derived relationship that preserves temporal causality across an intermediate behavior chain.",
  },
  F: {
    formula: "Behavior chain + transfer relation = Flow",
    studentText:
      "This is a Derived relationship where transfer semantics are maintained over an allowed intermediate chain.",
  },
  N: {
    formula: "Motivation influence chain = Influence",
    studentText:
      "This is a Derived relationship where influence is inferred transitively through permitted motivation links.",
  },
});
