// === ui/components/headerRichSelects.js ===
/**
 * Custom two-line header dropdowns for Viewpoint and Theme (native selects stay hidden for state sync).
 */
(function () {
  const POPOVER_OPEN = "header-rich-select-popover--open";
  const POPOVER_ENTERED = "header-rich-select-popover--entered";
  const MENU_OPEN_ATTR = "headerRichMenuOpen";

  /** @type {{ close: (() => void) | null }} */
  const openMenu = { close: null };

  function headerChromeShell(trigger) {
    return trigger.closest("#header-viewpoint-shell, #header-theme-shell");
  }

  function prefersReducedMotion() {
    try {
      return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (_) {
      return false;
    }
  }

  /**
   * While open, help cards live under #header-chrome-tip-layer (not under .header-chrome-select),
   * so CSS must key off this flag to guarantee they cannot paint over the listbox.
   */
  function syncHeaderTipLayerRichMenuLock() {
    const layer = document.getElementById("header-chrome-tip-layer");
    if (!layer) return;
    const vp = document.getElementById("header-viewpoint-shell")?.dataset?.[MENU_OPEN_ATTR] === "1";
    const th = document.getElementById("header-theme-shell")?.dataset?.[MENU_OPEN_ATTR] === "1";
    if (vp || th) layer.setAttribute("data-rich-select-menu-open", "1");
    else layer.removeAttribute("data-rich-select-menu-open");
  }

  /** Tear down the header help hovercard synchronously (it is portaled outside the shell while open). */
  function dismissHeaderHelpHoverNow(shell) {
    if (!shell) return;
    try {
      if (typeof shell._architrekHeaderHoverCancelHide === "function") shell._architrekHeaderHoverCancelHide();
    } catch (_) {
      /* ignore */
    }
    try {
      if (typeof shell._architrekHeaderHoverHide === "function") shell._architrekHeaderHoverHide();
    } catch (_) {
      /* ignore */
    }
  }

  function clearRichMenuShell(shell) {
    if (!shell) return;
    try {
      if (typeof shell._architrekHeaderHoverCancelHide === "function") shell._architrekHeaderHoverCancelHide();
    } catch (_) {
      /* ignore */
    }
    try {
      if (typeof shell._architrekHeaderHoverHide === "function") shell._architrekHeaderHoverHide();
    } catch (_) {
      /* ignore */
    }
    delete shell.dataset[MENU_OPEN_ATTR];
    syncHeaderTipLayerRichMenuLock();
    try {
      if (shell.matches(":hover") && typeof shell._architrekHeaderHoverShow === "function") {
        shell._architrekHeaderHoverShow();
      }
    } catch (_) {
      /* ignore */
    }
  }

  function mountPopover(pop) {
    if (pop && pop.parentElement !== document.body) document.body.appendChild(pop);
  }

  function restorePopover(pop, anchor) {
    if (!pop || !anchor) return;
    const wrap = anchor.querySelector(".header-rich-select");
    if (wrap && pop.parentElement !== wrap) wrap.appendChild(pop);
  }

  function positionPopover(trigger, pop) {
    const pad = 8;
    const gap = 4;
    const r = trigger.getBoundingClientRect();
    pop.style.position = "fixed";
    pop.style.left = `${Math.max(pad, Math.min(r.left, window.innerWidth - pad - 200))}px`;
    pop.style.top = `${r.bottom + gap}px`;
    pop.style.minWidth = `${Math.max(Math.round(r.width), 220)}px`;
    pop.style.maxWidth = `min(440px, calc(100vw - ${pad * 2}px))`;
    const maxH = Math.min(380, Math.max(120, window.innerHeight - (r.bottom + gap) - pad));
    pop.style.maxHeight = `${maxH}px`;

    requestAnimationFrame(() => {
      const pr = pop.getBoundingClientRect();
      if (pr.bottom <= window.innerHeight - pad) return;
      const above = r.top - gap - pr.height;
      if (above >= pad) {
        pop.style.top = `${above}px`;
        pop.dataset.placement = "top";
      } else {
        pop.style.top = `${pad}px`;
        pop.style.maxHeight = `${Math.max(120, window.innerHeight - 2 * pad)}px`;
      }
    });
  }

  function viewpointSubtitle(vp, key) {
    if (!key) return "Full metamodel · no Appendix C palette filter";
    if (!vp) return "";
    const c = String(vp.concerns || "").trim();
    if (c) return c;
    const p = String(vp.purpose || "").trim();
    return p;
  }

  function themeSubtitle(sc, key) {
    if (!sc) return "";
    const n = String(sc.name || "").trim();
    if (n) return n;
    const splash = Array.isArray(sc.splashLines) ? String(sc.splashLines[0] || "").trim() : "";
    if (splash) return splash;
    if (key === "abstract") return "Neutral labels · canonical ArchiMate names";
    return "Thematic labels · same ArchiMate rules";
  }

  function wireListbox(trigger, pop, opts) {
    const { onPick, getActiveValue } = opts;
    if (trigger.id) pop.setAttribute("aria-labelledby", trigger.id);
    let activeIdx = -1;
    const options = () => Array.from(pop.querySelectorAll('[role="option"]'));

    const setActive = (idx) => {
      const list = options();
      if (!list.length) return;
      let i = idx;
      if (i < 0) i = 0;
      if (i >= list.length) i = list.length - 1;
      activeIdx = i;
      list.forEach((el, j) => {
        el.classList.toggle("header-rich-select-option--active", j === i);
        el.setAttribute("aria-selected", j === i ? "true" : "false");
      });
      try {
        list[i].scrollIntoView({ block: "nearest" });
      } catch (_) {}
    };

    const close = () => {
      const shell = headerChromeShell(trigger);
      clearRichMenuShell(shell);
      pop.classList.remove(POPOVER_ENTERED, POPOVER_OPEN);
      pop.hidden = true;
      pop.setAttribute("aria-hidden", "true");
      trigger.setAttribute("aria-expanded", "false");
      document.removeEventListener("pointerdown", onDocPointer, true);
      document.removeEventListener("keydown", onDocKey, true);
      window.removeEventListener("scroll", onViewport, true);
      window.removeEventListener("resize", onViewport);
      if (openMenu.close === close) openMenu.close = null;
      restorePopover(pop, trigger.closest(".header-chrome-select") || trigger.parentElement);
    };

    const onViewport = () => {
      if (!pop.classList.contains(POPOVER_OPEN)) return;
      positionPopover(trigger, pop);
    };

    const onDocPointer = (e) => {
      const t = e.target;
      if (trigger.contains(t) || pop.contains(t)) return;
      close();
    };

    const onDocKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
        trigger.focus();
        return;
      }
      if (!pop.classList.contains(POPOVER_OPEN)) return;
      const list = options();
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive(activeIdx < 0 ? 0 : activeIdx + 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive(activeIdx < 0 ? list.length - 1 : activeIdx - 1);
      } else if (e.key === "Home") {
        e.preventDefault();
        setActive(0);
      } else if (e.key === "End") {
        e.preventDefault();
        setActive(list.length - 1);
      } else if (e.key === "Enter" && activeIdx >= 0) {
        e.preventDefault();
        const row = list[activeIdx];
        const v = row?.dataset?.value;
        if (v != null) {
          onPick(v);
          close();
          trigger.focus();
        }
      }
    };

    trigger.addEventListener("click", (e) => {
      e.preventDefault();
      if (pop.classList.contains(POPOVER_OPEN)) {
        close();
        return;
      }
      if (typeof openMenu.close === "function" && openMenu.close !== close) openMenu.close();

      const shell = headerChromeShell(trigger);
      if (shell) {
        shell.dataset[MENU_OPEN_ATTR] = "1";
        syncHeaderTipLayerRichMenuLock();
        dismissHeaderHelpHoverNow(shell);
      }

      mountPopover(pop);
      pop.hidden = false;
      pop.setAttribute("aria-hidden", "false");
      pop.classList.remove(POPOVER_ENTERED);
      pop.classList.add(POPOVER_OPEN);
      trigger.setAttribute("aria-expanded", "true");
      positionPopover(trigger, pop);
      openMenu.close = close;
      document.addEventListener("pointerdown", onDocPointer, true);
      document.addEventListener("keydown", onDocKey, true);
      window.addEventListener("scroll", onViewport, true);
      window.addEventListener("resize", onViewport);

      const cur = getActiveValue();
      const list = options();
      let start = list.findIndex((el) => el.dataset.value === cur);
      if (start < 0) start = 0;
      setActive(start);
      try {
        list[start]?.scrollIntoView({ block: "nearest" });
      } catch (_) {}
      const revealPopover = () => {
        if (prefersReducedMotion()) {
          pop.classList.add(POPOVER_ENTERED);
          return;
        }
        window.setTimeout(() => {
          requestAnimationFrame(() => {
            if (pop.classList.contains(POPOVER_OPEN)) pop.classList.add(POPOVER_ENTERED);
          });
        }, 20);
      };
      revealPopover();
      try {
        pop.focus({ preventScroll: true });
      } catch (_) {}
    });

    pop.addEventListener("click", (e) => {
      const row = e.target.closest?.('[role="option"]');
      if (!row || !pop.contains(row)) return;
      e.preventDefault();
      onPick(row.dataset.value ?? "");
      close();
      trigger.focus();
    });

    return { close };
  }

  function ensurePopover(trigger, id) {
    let pop = document.getElementById(id);
    if (pop) return pop;
    pop = document.createElement("div");
    pop.id = id;
    pop.className = "header-rich-select-popover";
    pop.setAttribute("role", "listbox");
    pop.setAttribute("aria-multiselectable", "false");
    pop.tabIndex = -1;
    pop.hidden = true;
    pop.setAttribute("aria-hidden", "true");
    const wrap = trigger.closest(".header-rich-select");
    if (wrap) wrap.appendChild(pop);
    return pop;
  }

  function fillViewpointMenu(pop) {
    if (!pop) return;
    pop.replaceChildren();
    const menu = document.createElement("div");
    menu.className = "header-rich-select-menu";

    const addOption = (parent, value, primary, secondary) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("role", "option");
      btn.dataset.value = value;
      btn.className = "header-rich-select-option";
      const p = document.createElement("span");
      p.className = "header-rich-select-option-primary";
      p.textContent = primary;
      const s = document.createElement("span");
      s.className = "header-rich-select-option-secondary";
      s.textContent = secondary || "";
      btn.appendChild(p);
      btn.appendChild(s);
      parent.appendChild(btn);
    };

    addOption(menu, "", "All elements", viewpointSubtitle(null, ""));

    const groups =
      typeof getViewpointSelectGroups === "function" ? getViewpointSelectGroups() : null;
    const catalogued = new Set();

    if (Array.isArray(groups) && typeof VIEWPOINTS !== "undefined" && VIEWPOINTS) {
      for (const g of groups) {
        const keys = g?.keys;
        const groupLabel = g?.label;
        if (!Array.isArray(keys) || keys.length === 0) continue;
        const section = document.createElement("div");
        section.className = "header-rich-select-group";
        section.setAttribute("role", "group");
        section.setAttribute("aria-label", String(groupLabel || "").trim() || "Viewpoints");
        const gl = document.createElement("div");
        gl.className = "header-rich-select-group-label";
        gl.textContent = String(groupLabel || "").trim() || "Viewpoints";
        section.appendChild(gl);
        for (const rawKey of keys) {
          const key = String(rawKey || "").trim();
          if (!key) continue;
          const vp = VIEWPOINTS[key];
          if (!vp) continue;
          catalogued.add(key);
          addOption(section, key, vp.name || key, viewpointSubtitle(vp, key));
        }
        if (section.querySelector('[role="option"]')) menu.appendChild(section);
      }
    }

    if (typeof VIEWPOINTS !== "undefined" && VIEWPOINTS) {
      for (const key of Object.keys(VIEWPOINTS)) {
        if (catalogued.has(key)) continue;
        const vp = VIEWPOINTS[key];
        addOption(menu, key, vp?.name || key, viewpointSubtitle(vp, key));
      }
    }

    pop.appendChild(menu);
  }

  function fillThemeMenu(pop) {
    if (!pop) return;
    pop.replaceChildren();
    const menu = document.createElement("div");
    menu.className = "header-rich-select-menu";

    const opts =
      typeof window.buildDomainContextOptions === "function" ? window.buildDomainContextOptions() : [];
    for (const o of opts) {
      const sc = typeof SCENARIOS !== "undefined" ? SCENARIOS[o.key] : null;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("role", "option");
      btn.dataset.value = o.key;
      btn.className = "header-rich-select-option";
      const p = document.createElement("span");
      p.className = "header-rich-select-option-primary";
      p.textContent = o.label || o.key;
      const s = document.createElement("span");
      s.className = "header-rich-select-option-secondary";
      s.textContent = themeSubtitle(sc, o.key);
      btn.appendChild(p);
      btn.appendChild(s);
      menu.appendChild(btn);
    }
    pop.appendChild(menu);
  }

  function refreshViewpointTrigger() {
    const main = document.getElementById("viewpoint-select");
    const head = document.getElementById("header-viewpoint-select");
    const t1 = document.getElementById("header-viewpoint-rich-primary");
    const t2 = document.getElementById("header-viewpoint-rich-secondary");
    const trig = document.getElementById("header-viewpoint-rich-trigger");
    if (!t1 || !t2 || !trig) return;
    const key = main ? String(main.value || "").trim() : head ? String(head.value || "").trim() : "";
    if (!key) {
      t1.textContent = "All elements";
      t2.textContent = viewpointSubtitle(null, "");
    } else {
      const vp = typeof VIEWPOINTS !== "undefined" ? VIEWPOINTS[key] : null;
      t1.textContent = vp?.name || key;
      t2.textContent = viewpointSubtitle(vp, key);
    }
  }

  function refreshThemeTrigger() {
    const top = document.getElementById("domain-context-top-select");
    const t1 = document.getElementById("header-theme-rich-primary");
    const t2 = document.getElementById("header-theme-rich-secondary");
    const trig = document.getElementById("header-theme-rich-trigger");
    if (!top || !t1 || !t2 || !trig) return;
    const key =
      typeof window.normalizeDomainContext === "function"
        ? window.normalizeDomainContext(top.value)
        : String(top.value || "abstract");
    const sc = typeof SCENARIOS !== "undefined" ? SCENARIOS[key] : null;
    const label =
      sc?.label ||
      top.selectedOptions?.[0]?.textContent?.trim() ||
      key;
    t1.textContent = String(label).trim() || key;
    t2.textContent = themeSubtitle(sc, key);
  }

  let wired = false;

  function initHeaderChromeRichSelects() {
    if (wired) return;
    const vTrig = document.getElementById("header-viewpoint-rich-trigger");
    const tTrig = document.getElementById("header-theme-rich-trigger");
    if (!vTrig && !tTrig) return;
    wired = true;

    if (vTrig) {
      const pop = ensurePopover(vTrig, "header-viewpoint-rich-listbox");
      fillViewpointMenu(pop);
      wireListbox(vTrig, pop, {
        getActiveValue: () => {
          const main = document.getElementById("viewpoint-select");
          return main ? String(main.value || "").trim() : "";
        },
        onPick: (value) => {
          const main = document.getElementById("viewpoint-select");
          const head = document.getElementById("header-viewpoint-select");
          if (main) main.value = value;
          if (head) head.value = value;
          if (typeof window.onViewpointChange === "function") window.onViewpointChange();
        },
      });
    }

    if (tTrig) {
      const pop = ensurePopover(tTrig, "header-theme-rich-listbox");
      fillThemeMenu(pop);
      wireListbox(tTrig, pop, {
        getActiveValue: () => {
          const top = document.getElementById("domain-context-top-select");
          if (!top) return "abstract";
          return typeof window.normalizeDomainContext === "function"
            ? window.normalizeDomainContext(top.value)
            : String(top.value || "abstract");
        },
        onPick: (value) => {
          if (typeof window.onDomainContextChange === "function") window.onDomainContextChange(value);
        },
      });
    }

    window.refreshHeaderViewpointRichSelectUI = function () {
      fillViewpointMenu(document.getElementById("header-viewpoint-rich-listbox"));
      refreshViewpointTrigger();
    };
    window.refreshHeaderThemeRichSelectUI = function () {
      fillThemeMenu(document.getElementById("header-theme-rich-listbox"));
      refreshThemeTrigger();
    };

    refreshViewpointTrigger();
    refreshThemeTrigger();
  }

  window.initHeaderChromeRichSelects = initHeaderChromeRichSelects;
})();
