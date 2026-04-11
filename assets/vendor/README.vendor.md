# Vendor Libraries

This directory contains third-party browser libraries used directly by ArchiTrek in zero-build mode.

## jsPDF

- **File:** `jspdf.umd.min.js`
- **Purpose:** Generate downloadable PDF files from rendered path diagrams.
- **Current usage:** `ui/controllers/exportController.js` uses `window.jspdf?.jsPDF` / `window.jsPDF` for PDF export.
- **Source:** [https://github.com/parallax/jsPDF](https://github.com/parallax/jsPDF)
- **Version metadata:** Update this section when bumping the library (record version and date).

## svg2pdf

- **File:** `svg2pdf.umd.min.js`
- **Purpose:** SVG-to-PDF conversion support for jsPDF workflows.
- **Current usage:** Loaded and available in runtime; retained for compatibility and future vector-oriented export improvements.
- **Source:** [https://github.com/yWorks/svg2pdf.js](https://github.com/yWorks/svg2pdf.js)
- **Version metadata:** Update this section when bumping the library (record version and date).

## Update Notes Template

When updating vendor files, append a short note:

- `YYYY-MM-DD` — `<library>` updated from `<old>` to `<new>`; reason: `<why>`.
- Validation: `<manual checks performed>`.
