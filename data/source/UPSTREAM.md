# Upstream data: AlbertoDMendoza/archimate_ontology

- Repository: https://github.com/AlbertoDMendoza/archimate_ontology
- Commit vendored: `e2135eb0ea09da1e71ad7bc83917f679f6b27d72` (2026-09-11, "Let a profile mark which pointers carry inherited context")
- Vendored on: 2026-10-08
- File: `derivation/relationships.xml` -> `data/source/relationships-cased.xml` (unmodified copy; verify with `cmp`)
- License: Apache License 2.0, © Alberto D. Mendoza (see `UPSTREAM-LICENSE-Apache-2.0.txt`)

Attribution (as required by the upstream README and the header of the XML file):

- The permitted-relationship data is transcribed from Appendix B of the ArchiMate(R) 3.2 Specification,
  Copyright (C) 2012-2023 The Open Group. ArchiMate is a registered trademark of The Open Group.
- The upstream file is a derivative work and is not the official ArchiMate documentation; the
  specification is the authority where the two disagree. https://pubs.opengroup.org/architecture/archimate3-doc/
- The Apache 2.0 license covers upstream's encoding, not the underlying specification content.
- Upstream is an independent formalization and not an official Open Group publication.

Case convention in `relationships-cased.xml`: UPPERCASE = direct relationship (explicit in the
chapter 3-12 metamodel figures), lowercase = derived relationship. `relationships.xml` (production
file, lowercase only) lists the same allowed set.
