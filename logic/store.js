// === logic/store.js ===
/**
 * Centralized store with immutable updates and selector subscriptions.
 * Transitional helper: creates a deep proxy so legacy `state.x = ...` code paths
 * can be routed through dispatch while the app migrates to explicit actions.
 */
(function storeBootstrap() {
  "use strict";

  const STORE_PERSIST_KEY = "architrek_session";
  const STORE_PERSIST_VERSION = 1;
  const STORE_PERSIST_DEBOUNCE_MS = 500;
  const STORE_PERSIST_EXCLUDED_KEYS = new Set([
    "graph",
    "allowedElements",
    "segments",
    "mmLast",
    "loading",
    "pathClusters",
  ]);

  function isPlainObject(value) {
    if (!value || typeof value !== "object") return false;
    // Object.prototype has a null prototype chain tail but must not be treated as a plain
    // data bag — proxying it lets `__proto__` / constructor walks recurse until stack overflow.
    if (value === Object.prototype || value === Array.prototype) return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }

  function isProxySafeContainer(value) {
    return Array.isArray(value) || isPlainObject(value);
  }

  /** Unwrap legacy {@code window.state} Proxy snapshots so spreads never re-enter the Proxy get trap. */
  function unwrapStateProxyRoot(value) {
    let v = value;
    let depth = 0;
    try {
      while (v && typeof v === "object" && typeof v.__raw__ === "object" && v.__raw__ != null) {
        v = v.__raw__;
        depth++;
        if (depth > 4) break;
      }
    } catch (_) {
      return value;
    }
    return v;
  }

  function cloneBranch(value) {
    const v = unwrapStateProxyRoot(value);
    if (Array.isArray(v)) return v.slice();
    if (isPlainObject(v)) return { ...v };
    return v;
  }

  function setAtPath(source, path, value) {
    if (!Array.isArray(path) || !path.length) return value;
    const root = cloneBranch(source);
    let cursor = root;
    let srcCursor = source;
    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i];
      const nextSrc = srcCursor != null ? srcCursor[key] : undefined;
      const next = cloneBranch(nextSrc) ?? {};
      cursor[key] = next;
      cursor = next;
      srcCursor = nextSrc;
    }
    cursor[path[path.length - 1]] = value;
    return root;
  }

  function deleteAtPath(source, path) {
    if (!Array.isArray(path) || !path.length) return source;
    const root = cloneBranch(source);
    let cursor = root;
    let srcCursor = source;
    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i];
      const nextSrc = srcCursor != null ? srcCursor[key] : undefined;
      const next = cloneBranch(nextSrc) ?? {};
      cursor[key] = next;
      cursor = next;
      srcCursor = nextSrc;
    }
    delete cursor[path[path.length - 1]];
    return root;
  }

  function normalizeEdgeConstraint(raw) {
    if (!raw || typeof raw !== "object") return null;
    const sourceId = String(raw.sourceId ?? raw.source ?? "").trim();
    const targetId = String(raw.targetId ?? raw.target ?? "").trim();
    if (!sourceId || !targetId || sourceId === targetId) return null;
    const type = raw.type === "LOCKED_RELATIONSHIP" ? "LOCKED_RELATIONSHIP" : "FORCED_DIRECTION";
    const out = { sourceId, targetId, type };
    if (raw.requiresAssociation === true) out.requiresAssociation = true;
    return out;
  }

  function normalizeEdgeConstraints(list) {
    if (!Array.isArray(list)) return [];
    const out = [];
    const seen = new Set();
    for (const item of list) {
      const c = normalizeEdgeConstraint(item);
      if (!c) continue;
      const key = `${c.type}|${c.sourceId}→${c.targetId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(c);
    }
    return out;
  }

  function sameUndirectedPair(a, b, c, d) {
    return (a === c && b === d) || (a === d && b === c);
  }

  /**
   * Plain waypoint rows for store._state. Strips nested `window.state` proxies if legacy code
   * reassigned `state.waypoints` from proxy-derived references (e.g. reorder map by element).
   */
  function unwrapWaypointSnapshot(w) {
    let o = w;
    for (let d = 0; d < 6 && o && typeof o === "object"; d++) {
      try {
        const inner = o.__raw__;
        if (inner == null || typeof inner !== "object") break;
        o = inner;
      } catch (_) {
        break;
      }
    }
    return o;
  }

  function migrateLegacyWaypointLayerId(layer) {
    if (layer == null || layer === "") return layer;
    if (layer === "Physical") return "Technology";
    return layer;
  }

  function normalizeWaypointsForStore(list) {
    if (!Array.isArray(list)) return [];
    const out = [];
    for (let i = 0; i < list.length; i++) {
      const w = unwrapWaypointSnapshot(list[i]);
      if (!w || typeof w !== "object") {
        out.push({ layer: null, element: null, label: "Point" });
        continue;
      }
      out.push({
        layer: migrateLegacyWaypointLayerId(w.layer ?? null),
        element: w.element ?? null,
        label: typeof w.label === "string" ? w.label : "Point",
      });
    }
    return out;
  }

  const HISTORY_PAST_MAX = 40;

  /**
   * True when `a` and `b` agree on every key that does not start with "_".
   * Used so internal/ephemeral fields (_renderScheduled, _findRunId, …) do not
   * consume undo stack slots or flush user-visible edits from the 20-entry cap.
   */
  function shallowPublicStateEqual(a, b) {
    if (a === b) return true;
    const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
    for (const k of keys) {
      if (typeof k === "string" && k.startsWith("_")) continue;
      if ((a || {})[k] !== (b || {})[k]) return false;
    }
    return true;
  }

  /**
   * Shallow strip of branches that often hold DOM nodes / non-cloneables and break structuredClone.
   * Full restore still reapplies the rest of the snapshot; mmLast is re-derived from interaction if needed.
   */
  function stripHistoryCloneHazards(obj) {
    if (!obj || typeof obj !== "object") return obj;
    try {
      const out = { ...obj };
      delete out.mmLast;
      return out;
    } catch (_) {
      return obj;
    }
  }

  /** Full state snapshot for undo/redo (Map and plain data). */
  function cloneStateForHistory(state) {
    if (state == null) return state;
    let src = state;
    try {
      if (state && typeof state === "object" && typeof state.__raw__ === "object" && state.__raw__ != null) {
        src = state.__raw__;
      }
    } catch (_) {}
    src = stripHistoryCloneHazards(src);
    try {
      return structuredClone(src);
    } catch (_) {
      try {
        return JSON.parse(JSON.stringify(src));
      } catch (_e) {
        return { ...src };
      }
    }
  }

  class Store {
    constructor(initialState) {
      this._state = cloneBranch(initialState) || {};
      if (Array.isArray(this._state.waypoints)) {
        this._state = { ...this._state, waypoints: normalizeWaypointsForStore(this._state.waypoints) };
      } else if (this._state.waypoints != null && typeof this._state.waypoints === "object") {
        this._state = { ...this._state, waypoints: normalizeWaypointsForStore([]) };
      }
      this._defaults = cloneStateForHistory(this._state) || {};
      this._listeners = new Set();
      this._historyPast = [];
      this._historyFuture = [];
      this._historyListeners = new Set();
      this._persistTimer = null;
      /** >0 while mutating without recording each step; one snapshot is pushed in {@link #endUndoCoalesce}. */
      this._undoCoalesceDepth = 0;
      this._undoCoalesceBaselines = [];
    }

    getState() {
      return this._state;
    }

    subscribe(selector, listener) {
      const pick = typeof selector === "function" ? selector : (s) => s;
      const fn = typeof listener === "function" ? listener : () => {};
      const sub = { pick, fn, last: pick(this._state) };
      this._listeners.add(sub);
      return () => this._listeners.delete(sub);
    }

    _notify(prevState, nextState, actionType) {
      for (const sub of this._listeners) {
        const nextSelected = sub.pick(nextState);
        if (!Object.is(sub.last, nextSelected)) {
          const prevSelected = sub.last;
          sub.last = nextSelected;
          try {
            sub.fn(nextSelected, prevSelected, actionType, nextState, prevState);
          } catch (_) {
            // Store notifications are best effort.
          }
        }
      }
    }

    _pushHistory(prevState) {
      try {
        const snap = cloneStateForHistory(prevState);
        this._historyPast.push(snap);
        this._historyFuture.length = 0;
        while (this._historyPast.length > HISTORY_PAST_MAX) {
          this._historyPast.shift();
        }
      } catch (e) {
        try {
          console.warn("[store] undo snapshot skipped", e);
        } catch (_) {}
      }
    }

    _emitHistoryChange() {
      for (const fn of this._historyListeners) {
        try {
          fn();
        } catch (_) {
          // History UI hooks are best effort.
        }
      }
    }

    subscribeHistory(listener) {
      if (typeof listener !== "function") {
        return () => {};
      }
      this._historyListeners.add(listener);
      try {
        listener();
      } catch (_) {}
      return () => this._historyListeners.delete(listener);
    }

    getHistoryAvailability() {
      return {
        canUndo: this._historyPast.length > 0,
        canRedo: this._historyFuture.length > 0,
      };
    }

    /** Drop undo/redo stacks (e.g. after bootstrap so the first user edit is undoable). */
    clearUndoHistory() {
      this._historyPast.length = 0;
      this._historyFuture.length = 0;
      this._undoCoalesceDepth = 0;
      this._undoCoalesceBaselines = [];
      this._emitHistoryChange();
    }

    /** Drop orphaned findPath coalesce nesting without clearing undo stacks (leak guard). */
    abortUndoCoalesce() {
      this._undoCoalesceDepth = 0;
      this._undoCoalesceBaselines.length = 0;
    }

    /**
     * Merge the next N dispatches into a single undo step. Nestable; outermost end pushes one snapshot.
     * Pair every begin with end (including on error paths).
     */
    beginUndoCoalesce() {
      if (this._undoCoalesceDepth === 0) {
        this._undoCoalesceBaselines.push(cloneStateForHistory(this._state));
      }
      this._undoCoalesceDepth++;
    }

    endUndoCoalesce() {
      if (this._undoCoalesceDepth <= 0) return;
      this._undoCoalesceDepth--;
      if (this._undoCoalesceDepth === 0) {
        const b = this._undoCoalesceBaselines.pop();
        const coalescedPush = !!(b && !shallowPublicStateEqual(b, this._state));
        if (coalescedPush) {
          this._pushHistory(b);
        }
        this._emitHistoryChange();
      }
    }

    _triggerGlobalRerender() {
      try {
        if (typeof window !== "undefined" && typeof window.dispatch === "function") {
          window.dispatch({ type: "RENDER_RESULTS" });
        }
      } catch (_) {
        // Rerender request is best effort.
      }
    }

    undo() {
      if (!this._historyPast.length) return false;
      const prev = this._state;
      const next = this._historyPast.pop();
      this._historyFuture.push(cloneStateForHistory(prev));
      this._state = next;
      this._notify(prev, next, "UNDO");
      this._emitHistoryChange();
      this._triggerGlobalRerender();
      return true;
    }

    redo() {
      if (!this._historyFuture.length) return false;
      const prev = this._state;
      const next = this._historyFuture.pop();
      this._historyPast.push(cloneStateForHistory(prev));
      while (this._historyPast.length > HISTORY_PAST_MAX) {
        this._historyPast.shift();
      }
      this._state = next;
      this._notify(prev, next, "REDO");
      this._emitHistoryChange();
      this._triggerGlobalRerender();
      return true;
    }

    dispatch(typeOrAction, payload) {
      const action =
        typeof typeOrAction === "object" && typeOrAction
          ? typeOrAction
          : { type: String(typeOrAction || ""), payload };
      const type = String(action.type || "");
      const prev = this._state;
      let next = prev;

      switch (type) {
        case "UPDATE_WAYPOINTS":
          next = {
            ...prev,
            waypoints: normalizeWaypointsForStore(Array.isArray(action.payload) ? action.payload : []),
          };
          break;
        case "SET_VIEWPOINT":
          next = { ...prev, viewpoint: action.payload || null };
          break;
        case "TOGGLE_COGNITIVE_PENALTY":
          next = { ...prev, searchCognitiveLoadPenalty: !prev.searchCognitiveLoadPenalty };
          break;
        case "SET_SEARCH_OPTIONS":
          next = { ...prev, ...(action.payload && typeof action.payload === "object" ? action.payload : {}) };
          break;
        case "SET_SEGMENTS":
          next = { ...prev, segments: action.payload ?? null };
          break;
        case "SET_EDGE_CONSTRAINTS":
          next = { ...prev, edgeConstraints: normalizeEdgeConstraints(action.payload) };
          break;
        case "CLEAR_EDGE_CONSTRAINTS":
        case "CLEAR_CONSTRAINTS": {
          const existingClear = normalizeEdgeConstraints(prev.edgeConstraints);
          next = existingClear.length ? { ...prev, edgeConstraints: [] } : prev;
          break;
        }
        case "FLIP_EDGE_DIRECTION": {
          const data = action.payload && typeof action.payload === "object" ? action.payload : {};
          const source = String(data.source ?? "").trim();
          const target = String(data.target ?? "").trim();
          if (!source || !target || source === target) break;
          const existing = normalizeEdgeConstraints(prev.edgeConstraints);
          /**
           * Payload (source,target) is hop geometry from the diagram (path order), not necessarily the
           * stored forced direction. If we always set flipped = (target→source), a second click after
           * the store already holds target→source removes and re-adds the same constraint → no state
           * change and FIND_PATH never runs. Toggle the current FORCED_DIRECTION when one exists.
           */
          const existingForced = existing.find(
            (c) =>
              c.type === "FORCED_DIRECTION" &&
              sameUndirectedPair(c.sourceId, c.targetId, source, target)
          );
          const flipped = existingForced
            ? {
                sourceId: existingForced.targetId,
                targetId: existingForced.sourceId,
                type: "FORCED_DIRECTION",
              }
            : { sourceId: target, targetId: source, type: "FORCED_DIRECTION" };
          let validation = { ok: true, degradedToAssociation: false, message: "" };
          try {
            if (typeof window !== "undefined" && typeof window.__validateEdgeConstraintFlip === "function") {
              validation = window.__validateEdgeConstraintFlip(
                { sourceId: source, targetId: target },
                flipped,
                { state: prev }
              ) || validation;
            }
          } catch (_) {}
          if (!validation?.ok) {
            next = {
              ...prev,
              edgeConstraintWarning:
                typeof validation?.message === "string" && validation.message.trim()
                  ? validation.message.trim()
                  : "Edge flip is not valid under current constraints.",
            };
            break;
          }
          const nextConstraints = existing.filter(
            (c) => !sameUndirectedPair(c.sourceId, c.targetId, source, target)
          );
          const nextForced = {
            ...flipped,
            ...(validation?.degradedToAssociation ? { requiresAssociation: true } : {}),
          };
          nextConstraints.push(nextForced);
          next = {
            ...prev,
            edgeConstraints: normalizeEdgeConstraints(nextConstraints),
            edgeConstraintWarning:
              typeof validation?.message === "string" && validation.message.trim()
                ? validation.message.trim()
                : null,
          };
          break;
        }
        case "PIN_EDGE_DIRECTION": {
          const data = action.payload && typeof action.payload === "object" ? action.payload : {};
          const source = String(data.source ?? "").trim();
          const target = String(data.target ?? "").trim();
          if (!source || !target || source === target) break;
          const existing = normalizeEdgeConstraints(prev.edgeConstraints);
          const pinned = { sourceId: source, targetId: target, type: "FORCED_DIRECTION" };
          let validation = { ok: true, degradedToAssociation: false, message: "" };
          try {
            if (typeof window !== "undefined" && typeof window.__validateEdgeConstraintFlip === "function") {
              validation = window.__validateEdgeConstraintFlip(
                { sourceId: source, targetId: target },
                pinned,
                { state: prev }
              ) || validation;
            }
          } catch (_) {}
          if (!validation?.ok) {
            next = {
              ...prev,
              edgeConstraintWarning:
                typeof validation?.message === "string" && validation.message.trim()
                  ? validation.message.trim()
                  : "Pinned edge direction is not valid under current constraints.",
            };
            break;
          }
          const nextConstraints = existing.filter(
            (c) => !sameUndirectedPair(c.sourceId, c.targetId, source, target)
          );
          nextConstraints.push({
            ...pinned,
            ...(validation?.degradedToAssociation ? { requiresAssociation: true } : {}),
          });
          next = {
            ...prev,
            edgeConstraints: normalizeEdgeConstraints(nextConstraints),
            edgeConstraintWarning:
              typeof validation?.message === "string" && validation.message.trim()
                ? validation.message.trim()
                : null,
          };
          break;
        }
        case "SET_ACTIVE_PATH":
          next = { ...prev, activePathIdx: Number.isFinite(action.payload) ? action.payload : 0 };
          break;
        case "SET_USER_CHOICE": {
          const data = action.payload && typeof action.payload === "object" ? action.payload : {};
          const idx = data.hopIndex;
          if (!Number.isFinite(idx)) break;
          const uc = { ...(prev.userChoices || {}) };
          uc[idx] = data.code;
          next = { ...prev, userChoices: uc };
          break;
        }
        case "RESET_TO_DEFAULTS":
          next = cloneStateForHistory(this._defaults) || {};
          this._historyPast.length = 0;
          this._historyFuture.length = 0;
          try {
            if (typeof localStorage !== "undefined") {
              localStorage.removeItem(STORE_PERSIST_KEY);
            }
          } catch (_) {}
          break;
        case "INTERNAL_SET_AT_PATH":
          next = setAtPath(prev, action.path, action.payload);
          break;
        case "INTERNAL_DELETE_AT_PATH":
          next = deleteAtPath(prev, action.path);
          break;
        default:
          next = action.payload && action.payload.__replaceState ? action.payload.state : prev;
      }

      // Never persist UI proxies inside waypoints (nested proxy + array-like refs → stack overflow in get).
      // Reuse prev.waypoints when normalization is a no-op so shallowPublicStateEqual does not treat every
      // dispatch as a waypoint change (fresh [] / array refs would consume undo slots after UPDATE_WAYPOINTS).
      if (next && typeof next === "object") {
        const wp = next.waypoints;
        const normalized = normalizeWaypointsForStore(Array.isArray(wp) ? wp : []);
        const prevRoot = prev && typeof prev === "object" ? prev : null;
        const prevWp = prevRoot ? prevRoot.waypoints : undefined;
        const sameWp =
          Array.isArray(prevWp) &&
          prevWp.length === normalized.length &&
          prevWp.every((p, i) => {
            const n = normalized[i];
            return (
              (p?.layer ?? null) === (n?.layer ?? null) &&
              (p?.element ?? null) === (n?.element ?? null) &&
              (typeof p?.label === "string" ? p.label : "Point") ===
                (typeof n?.label === "string" ? n.label : "Point")
            );
          });
        const waypointsFinal = sameWp ? prevWp : normalized;
        if (waypointsFinal !== wp) {
          next = { ...next, waypoints: waypointsFinal };
        }
      }

      // No structural state change -> no selector can observe a change, so skip notify.
      if (next === prev) return next;
      const _pubEq = shallowPublicStateEqual(prev, next);
      // Legacy Proxy writes route through INTERNAL_* and rebuild branches (e.g. new waypoints array).
      // That looks like a public state change to shallowPublicStateEqual and would push snapshots
      // after explicit actions (e.g. UPDATE_WAYPOINTS), breaking undo order. User-visible edits
      // should use named dispatches; do not record INTERNAL_* on the undo stack.
      const _internalLegacy =
        type === "INTERNAL_SET_AT_PATH" || type === "INTERNAL_DELETE_AT_PATH";
      const _willPush = !_pubEq && this._undoCoalesceDepth === 0 && !_internalLegacy;
      if (_willPush) {
        this._pushHistory(prev);
      }
      this._state = next;
      this._notify(prev, next, type);
      // Always notify history listeners (undo/redo disabled state). Skipping this while
      // findPath coalesceDepth>0 left buttons stale: syncHistoryButtons never ran until
      // coalesce ended, so undo could stay disabled with pointer-events:none and clicks did nothing.
      this._emitHistoryChange();
      this._schedulePersist();
      return next;
    }

    _persistSnapshot() {
      try {
        if (typeof localStorage === "undefined") return;
        const sanitized = buildPersistableSnapshot(this._state);
        localStorage.setItem(
          STORE_PERSIST_KEY,
          JSON.stringify({
            v: STORE_PERSIST_VERSION,
            at: Date.now(),
            state: sanitized,
          })
        );
      } catch (_) {
        // persistence is best effort only
      }
    }

    _schedulePersist() {
      if (this._persistTimer) clearTimeout(this._persistTimer);
      this._persistTimer = setTimeout(() => {
        this._persistTimer = null;
        this._persistSnapshot();
      }, STORE_PERSIST_DEBOUNCE_MS);
    }
  }

  function buildPersistableSnapshot(state) {
    const out = {};
    for (const [k, v] of Object.entries(state || {})) {
      if (k.startsWith("_")) continue;
      if (STORE_PERSIST_EXCLUDED_KEYS.has(k)) continue;
      out[k] = v;
    }
    return out;
  }

  function loadPersistedState() {
    try {
      if (typeof localStorage === "undefined") return null;
      const raw = localStorage.getItem(STORE_PERSIST_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.v !== STORE_PERSIST_VERSION || !parsed.state || typeof parsed.state !== "object") {
        return null;
      }
      return parsed.state;
    } catch (_) {
      return null;
    }
  }

  function createStateProxy(store) {
    /**
     * Fresh nested Proxy per access (no identity cache). The same plain object may appear at two
     * paths (e.g. duplicate waypoint refs); caching proxies by node or by path caused wrong
     * INTERNAL_SET_AT_PATH targets or runaway recursion during init.
     */
    const proxyFor = (path = []) => {
      const rootNow = store._state;
      const cur = path.length
        ? path.reduce((acc, k) => (acc == null ? undefined : acc[k]), rootNow)
        : rootNow;
      // Use the real array/object as the Proxy target so Array.isArray / Array.prototype methods
      // behave; traps still read via `path` from store._state (see get trap).
      const proxyTarget = Array.isArray(cur)
        ? cur
        : cur != null && isPlainObject(cur)
          ? cur
          : {};

      return new Proxy(proxyTarget, {
          get(_target, prop) {
            // Use store._state (plain) only — never store.getState() here: getState may be wrapped or
            // could alias the root proxy in edge cases, which makes cur[prop] re-enter this trap forever.
            if (prop === "__raw__") {
              const root = store._state;
              if (!path.length) return root;
              return path.reduce((acc, k) => (acc == null ? undefined : acc[k]), root);
            }
            const rootNow = store._state;
            const cur = path.length
              ? path.reduce((acc, k) => (acc == null ? undefined : acc[k]), rootNow)
              : rootNow;
            const value = cur != null ? cur[prop] : undefined;
            if (!isProxySafeContainer(value)) return value;
            return proxyFor(path.concat(prop));
          },
          set(_target, prop, value) {
            // Legacy writes (window.state.x = ...) must always go through dispatch so
            // subscribers are notified by Store._notify after state replacement.
            let payload = value;
            if (!path.length && prop === "waypoints") {
              payload = normalizeWaypointsForStore(Array.isArray(payload) ? payload : []);
            }
            store.dispatch({ type: "INTERNAL_SET_AT_PATH", path: path.concat(prop), payload });
            return true;
          },
          deleteProperty(_target, prop) {
            store.dispatch({ type: "INTERNAL_DELETE_AT_PATH", path: path.concat(prop) });
            return true;
          },
          ownKeys() {
            const rootNow = store._state;
            const cur = path.length
              ? path.reduce((acc, k) => (acc == null ? undefined : acc[k]), rootNow)
              : rootNow;
            return Reflect.ownKeys(cur || {});
          },
          getOwnPropertyDescriptor(_target, prop) {
            const rootNow = store._state;
            const cur = path.length
              ? path.reduce((acc, k) => (acc == null ? undefined : acc[k]), rootNow)
              : rootNow;
            const desc = Object.getOwnPropertyDescriptor(cur || {}, prop);
            if (desc) return desc;
            return { configurable: true, enumerable: true, writable: true, value: undefined };
          },
        }
      );
    };

    return proxyFor([]);
  }

  window.AppStore = Store;
  window.loadPersistedState = loadPersistedState;
  window.clearPersistedState = function clearPersistedState() {
    try {
      if (typeof localStorage !== "undefined") localStorage.removeItem(STORE_PERSIST_KEY);
    } catch (_) {}
  };
  window.createAppStore = function createAppStore(initialState) {
    const store = new Store(initialState || {});
    const stateProxy = createStateProxy(store);
    return { store, stateProxy };
  };
})();
