// === ui/controllers/exportController.js ===
/**
 * Export/download UI controller.
 * Keeps UI side effects here while logic/pathExport.js stays pure.
 */
(function exportControllerBootstrap() {
  "use strict";

  let pathExportModulePromise = null;
  let initialized = false;
  let getState = () => ({});
  let trackEvent = () => {};
  let getPathExportDescriptor = () => ({});
  let getShareableUrl = () => "";

  function getPathExportModule() {
    if (!pathExportModulePromise) {
      pathExportModulePromise = import("../../logic/pathExport.js");
    }
    return pathExportModulePromise;
  }

  function getDownloadButton() {
    return document.getElementById("btn-diagram-download");
  }

  function getDownloadPopover() {
    return document.getElementById("diagram-download-popover");
  }

  function getDownloadWrap() {
    return document.querySelector(".diagram-download-wrap");
  }

  function activeSvgElement() {
    return document.querySelector("#path-diagram svg");
  }

  /**
   * Shared fixed-layer placement for diagram toolbar popovers (escapes overflow-x clipping).
   * @param {HTMLElement | null} anchorEl
   * @param {HTMLElement | null} popEl
   */
  function syncFixedPopoverNearAnchor(anchorEl, popEl) {
    if (!anchorEl || !popEl || popEl.hidden) return;

    const margin = 8;
    const gap = 8;
    Object.assign(popEl.style, {
      position: "fixed",
      right: "auto",
      bottom: "auto",
      zIndex: "8500",
    });

    void popEl.offsetWidth;
    const br = anchorEl.getBoundingClientRect();
    const pr = popEl.getBoundingClientRect();

    let top = br.bottom + gap;
    if (top + pr.height > window.innerHeight - margin) {
      const above = br.top - gap - pr.height;
      if (above >= margin) top = above;
      else top = Math.max(margin, window.innerHeight - margin - pr.height);
    }

    let left = br.right - pr.width;
    if (left < margin) left = margin;
    const maxLeft = window.innerWidth - margin - pr.width;
    if (left > maxLeft) left = Math.max(margin, maxLeft);

    popEl.style.top = `${Math.round(top)}px`;
    popEl.style.left = `${Math.round(left)}px`;
  }

  function syncDownloadPopoverPosition() {
    syncFixedPopoverNearAnchor(getDownloadButton(), getDownloadPopover());
  }

  function closeDiagramDownloadMenuInternal() {
    const pop = getDownloadPopover();
    const btn = getDownloadButton();
    if (!pop || pop.hidden) return false;
    pop.hidden = true;
    if (btn) btn.setAttribute("aria-expanded", "false");
    pop.style.top = "";
    pop.style.left = "";
    pop.style.position = "";
    pop.style.zIndex = "";
    return true;
  }

  function openDiagramDownloadMenu() {
    const pop = getDownloadPopover();
    const btn = getDownloadButton();
    if (!pop || !btn) return false;
    if (typeof window.closeDiagramOptionsMenu === "function") window.closeDiagramOptionsMenu();
    pop.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    syncDownloadPopoverPosition();
    const first = pop.querySelector("[data-download-format]");
    if (first instanceof HTMLElement) first.focus();
    return true;
  }

  function toggleDiagramDownloadMenu() {
    const pop = getDownloadPopover();
    if (!pop) return false;
    if (pop.hidden) return openDiagramDownloadMenu();
    return closeDiagramDownloadMenuInternal();
  }

  function timestampToken(now = new Date()) {
    const pad = (n) => String(n).padStart(2, "0");
    const yyyy = String(now.getFullYear());
    const mm = pad(now.getMonth() + 1);
    const dd = pad(now.getDate());
    const hh = pad(now.getHours());
    const mi = pad(now.getMinutes());
    const ss = pad(now.getSeconds());
    return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
  }

  function appendTimestampBeforeExtension(filename, token) {
    const name = String(filename || "ArchiTrek-Export");
    const at = name.lastIndexOf(".");
    if (at <= 0 || at === name.length - 1) return `${name}-${token}`;
    return `${name.slice(0, at)}-${token}${name.slice(at)}`;
  }

  function waypointFilenameBase(state) {
    const parts = (state?.waypoints || [])
      .map((w) => w && w.element)
      .filter(Boolean)
      .map((name) => String(name).trim())
      .filter(Boolean)
      .map((s) => s.replace(/\s+/g, ""));
    const chain = parts.join("_to_");
    return chain ? `ArchiTrek_${chain}` : "ArchiTrek_Path";
  }

  function downloadBlobFile(filename, blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = String(filename || "download.txt");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function cloneSvgForExport(svg) {
    const clone = svg.cloneNode(true);
    const rect = svg.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width || Number(svg.getAttribute("width")) || 1200));
    const height = Math.max(1, Math.round(rect.height || Number(svg.getAttribute("height")) || 800));
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("version", "1.1");
    clone.setAttribute("width", String(width));
    clone.setAttribute("height", String(height));
    clone.style.background = "#ffffff";
    return { clone, width, height };
  }

  function serializeSvg(svg) {
    return new XMLSerializer().serializeToString(svg);
  }

  async function exportSvg(state) {
    const svg = activeSvgElement();
    if (!svg) {
      alert("No diagram to download!");
      return;
    }
    const token = timestampToken();
    const base = waypointFilenameBase(state);
    const filename = `${base}-${token}.svg`;
    const { clone } = cloneSvgForExport(svg);
    const svgData = serializeSvg(clone);
    const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    downloadBlobFile(filename, blob);
    trackEvent("download_diagram_svg", {
      waypointCount: (state?.waypoints || []).map((w) => w && w.element).filter(Boolean).length,
      mode: state?.mode,
    });
  }

  async function exportPng(state) {
    const svg = activeSvgElement();
    if (!svg) {
      alert("No diagram to download!");
      return;
    }
    const token = timestampToken();
    const base = waypointFilenameBase(state);
    const filename = `${base}-${token}.png`;
    const { clone, width, height } = cloneSvgForExport(svg);
    const svgData = serializeSvg(clone);
    const url = URL.createObjectURL(new Blob([svgData], { type: "image/svg+xml;charset=utf-8" }));
    const img = new Image();
    img.decoding = "sync";

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    }).catch((err) => {
      console.error("PNG export image decode failed:", err);
      alert("Could not render diagram image for PNG export.");
    });
    if (!img.complete) {
      URL.revokeObjectURL(url);
      return;
    }

    try {
      const scalePx = Math.max(2, Number(window.devicePixelRatio) || 1);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scalePx));
      canvas.height = Math.max(1, Math.round(height * scalePx));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("2D canvas context unavailable");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Canvas PNG blob unavailable");
      downloadBlobFile(filename, blob);
      trackEvent("download_diagram_png", {
        waypointCount: (state?.waypoints || []).map((w) => w && w.element).filter(Boolean).length,
        mode: state?.mode,
      });
    } catch (err) {
      console.error("PNG export failed:", err);
      alert("Could not generate PNG from this diagram.");
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function exportPdf(state) {
    const svg = activeSvgElement();
    if (!svg) {
      alert("No diagram to download!");
      return;
    }

    trackEvent("download_diagram_pdf", {
      waypointCount: (state?.waypoints || []).map((w) => w && w.element).filter(Boolean).length,
      mode: state?.mode,
    });

    const token = timestampToken();
    const base = waypointFilenameBase(state);
    const filenameBase = `${base}-${token}`;
    const jsPdfApi = window.jspdf?.jsPDF || window.jsPDF;
    if (typeof jsPdfApi !== "function") {
      alert("PDF library failed to load. Please refresh and try again.");
      return;
    }

    const { clone, width, height } = cloneSvgForExport(svg);
    const landscape = width >= height;
    const doc = new jsPdfApi({
      orientation: landscape ? "landscape" : "portrait",
      unit: "pt",
      format: "a4",
    });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 24;
    const availW = pageW - margin * 2;
    const availH = pageH - margin * 2;
    const scale = Math.min(availW / width, availH / height);
    const drawW = width * scale;
    const drawH = height * scale;
    const x = (pageW - drawW) / 2;
    const y = (pageH - drawH) / 2;

    clone.querySelectorAll(".rel-label-badge").forEach((n) => n.remove());
    const svgData = serializeSvg(clone);
    const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.decoding = "sync";

    img.onload = () => {
      try {
        const scalePx = Math.max(2, Number(window.devicePixelRatio) || 1);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(width * scalePx));
        canvas.height = Math.max(1, Math.round(height * scalePx));
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("2D canvas context unavailable");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const pngData = canvas.toDataURL("image/png");
        doc.addImage(pngData, "PNG", x, y, drawW, drawH, undefined, "FAST");
        doc.save(`${filenameBase}.pdf`);
      } catch (err) {
        console.error("PDF export failed:", err);
        alert("Could not generate PDF from this diagram.");
      } finally {
        URL.revokeObjectURL(url);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      alert("Could not render diagram image for PDF export.");
    };

    img.src = url;
  }

  async function exportPathData(state, format) {
    let output = null;
    try {
      const pathExport = await getPathExportModule();
      output = pathExport.createPathExportBlob(getPathExportDescriptor(), format);
    } catch (err) {
      console.error("Path export module load failed:", err);
      alert("Could not load export module.");
      return;
    }
    if (!output || !output.blob) {
      alert("No path to export!");
      return;
    }

    const token = timestampToken();
    const filename = appendTimestampBeforeExtension(output.filename, token);
    downloadBlobFile(filename, output.blob);
    if (format === "csv") {
      trackEvent("download_path_csv", {
        hops: output.data?.hopCount,
        derived: !!output.data?.hasDerived,
        mode: state?.mode,
      });
      return;
    }
    if (format === "xml") {
      trackEvent("download_path_archimate_xml", {
        hops: output.data?.hopCount,
        derived: !!output.data?.hasDerived,
        mode: state?.mode,
      });
    }
  }

  async function copyShareableLink() {
    let url = "";
    try {
      url = typeof getShareableUrl === "function" ? String(getShareableUrl() || "").trim() : "";
    } catch (err) {
      console.error("Share link build failed:", err);
    }
    if (!url) {
      alert("Could not build a share link for the current view.");
      return;
    }
    const softLimit =
      Number.isFinite(Number(window.SHARE_URL_SOFT_LIMIT)) && Number(window.SHARE_URL_SOFT_LIMIT) > 0
        ? Number(window.SHARE_URL_SOFT_LIMIT)
        : 1900;
    const urlTooLong = url.length > softLimit;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        throw new Error("clipboard unavailable");
      }
    } catch (_) {
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.setAttribute("aria-hidden", "true");
      ta.style.cssText = "position:fixed;left:-9999px;top:0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } finally {
        document.body.removeChild(ta);
      }
    }
    trackEvent("copy_share_link", {
      waypointCount: (getState()?.waypoints || []).map((w) => w && w.element).filter(Boolean).length,
      longUrl: urlTooLong,
      urlLength: url.length,
    });
    if (urlTooLong) {
      alert(
        `Link copied, but it is ${url.length} characters long and may break in some chat/email apps.`
      );
    }
  }

  async function downloadDiagramFormat(format) {
    const kind = String(format || "").toLowerCase();
    const state = getState() || {};
    closeDiagramDownloadMenuInternal();

    if (kind === "link") return copyShareableLink();
    if (kind === "pdf") return exportPdf(state);
    if (kind === "png") return exportPng(state);
    if (kind === "svg") return exportSvg(state);
    if (kind === "csv" || kind === "xml") return exportPathData(state, kind);
  }

  function downloadDiagram(event) {
    if (event?.preventDefault) event.preventDefault();
    if (event?.stopPropagation) event.stopPropagation();
    const hasSvg = !!activeSvgElement();
    if (!hasSvg) {
      alert("No diagram to download!");
      return;
    }
    toggleDiagramDownloadMenu();
  }

  function handleGlobalClick(ev) {
    const wrap = getDownloadWrap();
    if (!wrap) return;
    const target = ev.target;
    if (target instanceof Element && wrap.contains(target)) return;
    closeDiagramDownloadMenuInternal();
  }

  function handlePopoverClick(ev) {
    const target = ev.target;
    if (!(target instanceof Element)) return;
    const chip = target.closest("[data-download-format]");
    if (!chip) return;
    const format = chip.getAttribute("data-download-format");
    if (!format) return;
    void downloadDiagramFormat(format);
  }

  function initExportController(options = {}) {
    getState = typeof options.getState === "function" ? options.getState : () => ({});
    trackEvent = typeof options.trackEvent === "function" ? options.trackEvent : () => {};
    getPathExportDescriptor =
      typeof options.getPathExportDescriptor === "function" ? options.getPathExportDescriptor : () => ({});
    getShareableUrl = typeof options.getShareableUrl === "function" ? options.getShareableUrl : () => "";

    window.downloadDiagram = downloadDiagram;
    window.downloadDiagramFormat = downloadDiagramFormat;
    window.closeDiagramDownloadMenu = closeDiagramDownloadMenuInternal;
    window.syncFixedPopoverNearAnchor = syncFixedPopoverNearAnchor;

    if (initialized) return;
    initialized = true;
    const pop = getDownloadPopover();
    if (pop) pop.addEventListener("click", handlePopoverClick);
    document.addEventListener("click", handleGlobalClick);
    const repositionIfOpen = () => {
      const p = getDownloadPopover();
      if (p && !p.hidden) syncDownloadPopoverPosition();
      if (typeof window.__syncDiagramOptionsPopoverPosition === "function") {
        window.__syncDiagramOptionsPopoverPosition();
      }
    };
    window.addEventListener("resize", repositionIfOpen);
    window.addEventListener("scroll", repositionIfOpen, true);
  }

  window.initExportController = initExportController;
})();
