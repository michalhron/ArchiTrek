# Teaching with ArchiTrek

ArchiTrek was built for an enterprise architecture course. Students who learn ArchiMate soon hit the same question: how can I connect these two boxes? The relationship table answers whether a link is allowed. It does not say through what. This page describes a 60 to 90 minute session that uses ArchiTrek to close that gap, with links you can open in class.

The session assumes students have already modelled a layered case and seen a solution. The examples use a car insurance company: a mainframe in the computer centre runs SAP ERP, whose Financial Accounting module supports Financial Transaction Processing in the finance department.

## Before class

- Open [architrek.hronmichal.net](https://architrek.hronmichal.net) on the projector machine and bookmark the links below.
- Ask students to bring one laptop per pair. ArchiTrek needs a laptop or desktop screen.
- Set Semantic rigor to Academic and leave it there for assignments. See [reading-results.md](reading-results.md#semantic-rigor).

## Bookmarks

| Name | Use | Link |
|---|---|---|
| A | Node to Business Function | [open](https://architrek.hronmichal.net/?mode=ordered&path=2&wp0=Node&wp1=Business+Function) |
| B | The same, pinned through Application Component | [open](https://architrek.hronmichal.net/?mode=ordered&path=3&wp0=Node&wp1=Application+Component&wp2=Business+Function) |
| C | Value Stream to Capability, for reporting | [open](https://architrek.hronmichal.net/?mode=ordered&path=2&wp0=Value+Stream&wp1=Capability) |
| D | Device to Business Service, for the pair exercise | [open](https://architrek.hronmichal.net/?mode=ordered&path=2&wp0=Device&wp1=Business+Service) |

Any search becomes a link like these. Use Copy share link in the download menu, or edit the `wp0`, `wp1`, `wp2` parameters by hand. `path` is the number of waypoints.

## Session plan

### 1. One question to start (5 min)

Ask: can a Node connect directly to a Business Function? Show the normal way to answer it, the cell in the Appendix B table. The cell holds six letters for flow, assignment, association, realization, triggering and serving. Only association is in capitals, which means direct. The other five are derived: allowed, but only through a chain the table does not show.

### 2. Count the arrows in the solution (10 min)

Walk the solution bottom to top. The mainframe is assigned to the SAP software, which realizes the SAP ERP system, which contains Financial Accounting, which is assigned to Bookkeeping, which realizes the Bookkeeping Service, which serves Financial Transaction Processing. Six relationships, three layers.

Think, pair, share:

1. Which relationship types does the solution use to get from one layer to the next?
2. Arrow 1 goes from the mainframe straight to SAP. Which box did the solution leave out?
3. Your CFO wants one arrow from the mainframe to the business function. What can you draw?

Possible answers: realization from technology to application and serving from application to business. The operating system is left out, so arrow 1 is a shortcut. For the CFO, a derived serving relationship, at the price of losing which software, function and service it runs through.

### 3. Why arrow 1 is a shortcut (5 min)

Show rule DR2: two structural relationships in a row give you the weaker of the two. The mainframe is composed of its operating system, which is assigned to the SAP software. Assignment is weaker than composition, so the shortcut is an assignment. The full set of rules, with examples from the same case, is in [derivation-rules.md](derivation-rules.md).

### 4. Demo: ask the tool (10 min)

Open bookmark A and click Find Path. Count the routes out loud before clicking any. Open Route 1 and walk the hops with the cursor. Ask where the application layer went.

Talk through the four kinds of link (direct, derived, potential, association) and their hop costs. The search takes three direct hops before one derived hop.

<p align="center"><img src="assets/evidence.svg" alt="Direct, derived, potential and association links with hop costs 1, 5, 20 and 100." width="100%"></p>

### 5. Demo: looser rules (5 min)

Open Edit path, then Options, and move Semantic rigor from Academic to Discovery. Click Find Path again. More routes appear, and some carry weaker evidence. The question did not change. What changed is how much you accept as an answer. Put it back to Academic in front of the class.

<p align="center"><img src="assets/rigor.svg" alt="Academic, Pragmatic and Discovery, and which gates each one opens." width="100%"></p>

### 6. Steering the search (5 min)

Open bookmark B. Pinning Application Component in the middle forces the route through the layer the case actually uses. Ask which element from the solution you would pin to get the Bookkeeping Service into the route. Answer: an Application Service.

### 7. Pairs on laptops (10 min)

One laptop per pair. Customers buy the Car Insurance Service on the web site, and the web site runs on a server, which in ArchiMate is a Device. Use ordered mode, Academic, and open the explanation.

1. Find a route from Device to Business Service.
2. Compare a route marked Ground-Truth with one marked Simplified.
3. More than one route is legal. How do you choose?

Possible answers: several routes are legal, and at least one is a single hop, which surprises people. Ground-Truth means the route reads as step-by-step structure, with few or no shortcuts. Simplified means it leans on derived shortcuts to cover the distance. [reading-results.md](reading-results.md#ground-truth-and-simplified) has the exact rule. Choose by what the architecture means. The shortest route is not automatically the honest one.

### 8. Legal, and still backward (10 min)

Open bookmark C. The tables allow serving between Capability and Value Stream in both directions. The specification text has one direction in mind: capabilities serve, meaning enable, a value stream. The other direction is legal and backward.

Right-click the arrow, choose Relationship type, then Serving. Right-click again and choose Report feedback, then Logical Mismatch. A justification is required, so a report is an argument. Submitted reports land on a public board.

The other category, Metamodel Conflict, is for the opposite complaint: you are sure a link should be allowed and the tool will not give it to you.

### 9. Close: four habits (5 min)

1. Stuck on an arrow? Put the two element types into ArchiTrek.
2. Read before you draw. Open the explanation and keep Academic on.
3. Bring it back. Export Open Exchange XML and open it in Archi.
4. Legal but wrong? Right-click the arrow and report it.

After the course, the same check works on any model someone hands you at work.

## Things to try at home

Not every feature fits in a session. Point students to these:

- Viewpoints. Pick Layered in the viewpoint list and see which elements stay.
- Spec excerpts. Every element on a route comes with its official definition, aspect and section.
- Show on metamodel. Light up any hop on the metamodel diagram.
- Story themes. The same rules, retold in a hospital or on the Death Star.
- Advanced options. Hop costs, depth penalty and search effort.

[features.md](features.md) describes each one.
