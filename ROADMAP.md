# ArchiTrek roadmap

ArchiTrek shows students how two ArchiMate element types can be connected, and why. The roadmap follows one idea from the original design: abstraction is a choice. A derived relationship is a shortcut over a chain of primary relationships, and a student should be able to move between the shortcut and the chain on the diagram itself.

## Now: correct relationship data

Branch `fix/matrix-provenance`.

- Bring the production build files into the repo (`data/source/`, `scripts/build-matrix.mjs`). Today they exist only on the live site.
- Rebuild the direct / derived / potential classification from the case-significant Appendix B table in AlbertoDMendoza/archimate_ontology. Valid versus potential is decided by running DR1–DR8 and PDR1–PDR12.
- Document the sources, the upstream commit and how to regenerate in the README.
- Deploy only after the demo states are re-checked.

Why: about 16% of codes were classified differently from upstream. This changes route order, the Ground-Truth and Simplified labels, and Academic mode. The allowed set was already correct.

## Next: expand and contract on the diagram

Both features live in the right-click menu that already offers Relationship type, Flip direction, Report feedback and Pin direction. They are inverses of each other, so they should share one data model.

### Expand a derived arrow

Right-click a derived arrow and choose **Expand into primary relationships**.

- Show the chains of direct relationships that derive this arrow. For each chain, show the rule (for example DR2, weakest link) and the intermediate elements.
- If there is more than one chain, rank them with the same hop costs the search uses.
- Picking a chain replaces the arrow on the diagram with that chain. Undo restores the arrow.
- If the arrow rests on a potential derivation (PDR), say so on the chain. The specification says such a result "might be relevant but may also be wrong".
- For a direct arrow, the same menu item becomes **Show possible intermediaries**. It shows chains that would also connect the two elements, without replacing anything.

### Hide an element

Right-click an element in the middle of a route and choose **Hide and connect neighbours**.

- Replace the two hops around the element with one derived relationship, using the derivation rules. For two structural hops that is the weaker of the two (DR2).
- If only a PDR rule produces it, mark the new arrow Potential.
- If no rule produces a relationship, do not hide. Say why: these two neighbours cannot be connected by a derived relationship.
- Keep the hidden element attached to the new arrow, as a small marker, so that Expand brings it back.

### What both features need

- Per-hop derivation provenance: which rule produced a derived relationship, and from which premises. Upstream records this as `derivationRule` and `derivedFrom`, so the engine can follow the same shape.
- One shared undo stack for expand, hide, flip and relationship-type changes.
- Share links and exports that keep the expanded or contracted state.

### Done when

- A student can take Node → Business Function Route 1, expand every derived hop down to primary relationships, and contract it back to the original route.
- Every derived arrow can name its rule.
- Hiding an element that has no valid derivation across it explains why instead of failing silently.

## Later

- **Predict-first mode.** Hide the hop explanation until the student has committed to an answer. This turns design principle DP1 (explanation timing) into a feature instead of a paper worksheet step.
- **Report triage.** Link each report to the hop's rule and derivation, so the public board can be grouped by rule.
- **Keep the archimate-generator skill in sync.** It carries its own copy of the matrix and three notation errors: the realization arrowhead, the Value Stream icon and the Capability icon.

## Implementation notes

Read against `ui/app.js` and `logic/` on `fix/matrix-provenance` (production code, commit 47a07d8 plus the restyle).

**Where the menu lives.** `initEdgeContextMenu()` in `ui/app.js` builds one `div.edge-context-menu` and appends five items: the Relationship type submenu, the Flip direction submenu, Report feedback, Pin current direction and Unpin forced direction (`menu.append(relWrap, flipWrap, reportBtn, pinBtn, unpinBtn)`). It opens only from a `contextmenu` event on a relationship label (`.rel-label-hit` inside `.clickable-arrow[data-hop]`). Expand fits as a sixth item there. Hide needs a second trigger, because there is no context menu on element nodes today: the listener returns early unless the target is a relationship label.

**What a hop knows.** `getHopMeta(hopIndex)` returns `{ hopIndex, from, to, step, relationshipCodes, currentCode }`. It reads the hop from `flattenSegments(state.segments, state.activePathIdx)`. `step` comes from `pathStepFromEdge()` in `logic/pathfinder.js` and carries `codes`, `isDirect`, `matrixDirectCodes`, `matrixDerivedCodes`, `matrixDerivedPotentialCodes` and, for PDR-only edges, `isPotentialDerived`. So a hop knows which bucket each code is in (direct, valid derived, potential), but not which rule produced it or from what premises.

**Is the intermediate chain kept anywhere? No.** `buildGraph()` in `logic/graph.js` turns each `MATRIX` row into at most one direct and one derived edge between the two endpoint types. The UCS search in `logic/pathfinder.js` (`ucsSegment`, `findPaths`) walks those edges as single hops. A derived hop is a matrix cell, not a contracted chain, so there is nothing to expand at run time. `data/derivationLogic.js` only holds generic per-code text (for example "Structural + Dependency = Dependency"), not the chain behind a particular hop.

**What Expand needs.**

- A provenance table, generated offline the same way `scripts/build-buckets.py` already runs upstream's rules. When the rules run with `fixture-direct.ttl` as input, each derived type-level triple carries `archimate:derivationRule` and `archimate:derivedFrom`. These can be emitted to a data file keyed `from|to|code`, holding a list of `{ rule, via, premises:[[from,code,to],…] }`.
- `getHopMeta` (or a sibling) to look up that table for the hop's `currentCode`.
- Ranking of chains with the search's own costs: `hopWeight` and `pathTotalWeight` in `logic/pathfinder.js`.
- A per-route edit layer. Replacing a hop with a chain changes the route. Today `state.segments` is rebuilt by every search, so expansions need their own state (for example `state.pathEdits[activePathIdx]`). The renderer and `flattenSegments` would then apply them.

**What Hide needs.**

- The same provenance table, read in reverse: given `(a, code1, b)` and `(b, code2, c)`, find the derived `(a, ?, c)` whose premises match. Only codes present in the table are allowed. If there is no match, the menu explains why instead of hiding.
- A context menu on element nodes in the middle of a route.
- A marker on the new arrow that records the hidden element, so Expand can restore it.

**Shared pieces.**

- Undo: `logic/store.js` already keeps a snapshot undo stack (20 entries, with `beginUndoCoalesce` / `endUndoCoalesce`), so expand and hide can push snapshots there once their state lives in the store.
- Share links: `buildSharedRoutingPayload()` only encodes `edgeConstraints` (`ec`) and `userChoices` (`uc`), so it needs a third key for path edits.
- Exports: `logic/pathExport.js` and `ui/controllers/exportController.js` export the flattened route, so they would pick up edits once `flattenSegments` applies them.
