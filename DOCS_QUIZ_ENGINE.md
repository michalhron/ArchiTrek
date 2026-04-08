# Procedural Quiz Engine — Handoff Memo (Version 2.0)

**Status:** Parked for academic-semester work. **Not part of v1.0 production** (pathfinding + thematic dictionaries).

**Source of truth (code):** Git branch `archive/quiz-engine-v1` contains:

- `logic/quizEngine.js` — generation + mutation + `buildSpotTheErrorQuiz()`
- `data/scenarios.js` — scenario terms for domains (e.g. hospital, airline)

Production `main` does not load these scripts; this document is the resume-from-zero guide.

---

## 1. Generation logic (`generateValidSubGraph`)

The engine builds a **small valid graph** (3–4 nodes in practice) so a single “spot the error” question can be shown.

### `findBestChainForSet` with `maxDepth: 1`

In `logic/quizEngine.js`, after sampling a pool of distinct ArchiMate **element types** from the scenario (filtered by the chosen **viewpoint**), the code calls:

```js
findBestChainForSet(graph, pool, {
  maxDepth: 1,
  allowAssociationFallback: false,
  includeDerived,
  maxPaths: 5,
  maxStates: 25000,
});
```

**Intent:** Each **segment** between consecutive waypoints is at most **one relationship hop** in the matrix sense. That yields a **chain of direct steps** (no multi-hop segments inside one “link” of the quiz diagram). The chain orders the chosen element types into a path the matrix allows; edges are then derived from the first path’s steps (`primaryCodeFromStep`).

**Why it matters:** The quiz UI is aimed at **3-node (2-edge) style** diagrams; keeping `maxDepth: 1` keeps each displayed arrow aligned with a single Appendix B / derived relationship step.

---

## 2. Mutation logic (“sabotage”) — `mutateGraphForExam`

After a valid graph exists, **one** intentional error is injected. Types are fixed in code as:

| `errorType` | Internal label | Behaviour |
|---------------|------------------|-----------|
| `relationshipViolation` | Relationship sabotage | Pick a random edge; replace its relationship **code** with a code from `REL_CODES_EXAM` that is **not** in `mergeMatrixRowForPair(from, to, includeDerived).merged` for that directed pair. Sets `isValid: false` on that edge. |
| `viewpointViolation` | Viewpoint sabotage | Requires a **restricted** viewpoint (`allowedElements` not null). Replaces an **endpoint** node’s element/label with a **scenario term** whose element type is **outside** the viewpoint palette, while trying to keep edges **matrix-consistent** (`edgesStillMatrixConsistent`). If the viewpoint allows all elements (e.g. “Layered”), mutation **cannot** run — returns a reason. |

Answer metadata is returned on `answerKey` (edge vs node, indices, allowed codes, human-readable `rule`, and `reference` strings pointing at Appendix B matrix vs Appendix C viewpoints).

---

## 3. Data contract — `data/scenarios.js`

### Top-level shape

- **`examScenarios`:** Optional per-domain maps `{ [ArchiMateElementType: string]: string[] }` of labels; consumed by `expandExamScenario()` into `{ label, element }[]`.
- **`SCENARIOS`:** Engine-facing map **`scenarioId` (lowercase string)** → object:

```ts
{
  domain: string;           // Human-readable domain name
  terms: Array<{ label: string, element: string }>;  // Thematic labels tied to element types
}
```

### Example keys

- `hospital` — built from `examScenarios.Hospital` via `expandExamScenario`.
- `airline` — hand-authored `terms` array.

### Consumption

`generateValidSubGraph(scenarioName, viewpointName, ...)` reads `SCENARIOS[scenarioName]` and intersects `terms` with the selected **viewpoint** allowed elements (see `viewpoints.js`). At least **three distinct element types** must remain usable or generation fails.

---

## 4. Public API — `buildSpotTheErrorQuiz`

```js
buildSpotTheErrorQuiz(scenarioName, viewpointName, errorType, options?)
```

- **`scenarioName`:** Key in `SCENARIOS` (e.g. `'hospital'`).
- **`viewpointName`:** Resolved via `VIEWPOINTS` (name or key).
- **`errorType`:** `'relationshipViolation'` | `'viewpointViolation'`.
- **`options`:** Optional `includeDerived`, `rng`, `maxAttempts` (passed through generation/mutation).

**Success return** includes `graph.nodes`, `graph.edges` (with UI-oriented fields), `answerKey`, and `meta` (scenario, viewpoint, violation type).

**No production UI** currently calls this; wire-up was planned for v2.0.

---

## 5. Unfinished business (v2.0)

### UI — 3-node quiz diagram

- Render **nodes** with domain **labels** and ArchiMate **element type** (mini diagram or simplified path strip).
- Render **two edges** with relationship name + code; visually distinguish invalid edge when `isValid === false` (or hide validity until “reveal”).
- Show **viewpoint context** string (`viewpointContext`) for the prompt.

### Answer checking

- **Relationship violation:** Student must identify the bad edge (or wrong code). Compare to `answerKey.kind === 'edge'` (indices, `wrongCode`, `allowedCodes`).
- **Viewpoint violation:** Student must identify the node that breaks the viewpoint. Compare to `answerKey.kind === 'node'` (`nodeIndex`, `element`, `previousElement`, etc.).
- Optional: expose “explain” using `answerKey.rule` + `reference`.

### Integration

- Re-add script tags (after `viewpoints.js`, before or after pathfinder as needed):

  ```html
  <script src="./data/scenarios.js"></script>
  <script src="./logic/quizEngine.js"></script>
  ```

- Ensure globals `SCENARIOS`, `VIEWPOINTS`, `ELEMENTS`, `MATRIX`, `RELATIONSHIPS`, `buildGraph`, `findBestChainForSet`, `mergeMatrixRowForPair` are available (same load order as today’s app shell).

---

## 6. Tests

There is **no** dedicated automated test file in `scripts/` for the quiz engine at archive time. Recommended for v2.0: small Node or browser tests that mock `rng` and assert deterministic `buildSpotTheErrorQuiz` payloads.

---

*Last updated for v1.0 production cut; procedural quiz deferred to Version 2.0.*
