// === config/analytics-config.js ===
/**
 * Optional self-hosted analytics (Umami).
 *
 * This project is shipped as plain static files (no bundler). To keep analytics
 * easy to enable/disable per deployment, we load Umami dynamically only when
 * both host + website id are configured.
 */

window.ANALYTICS = Object.freeze({
  umami: {
    // Example: "https://stats.example.com"
    host: "",
    // Website ID from Umami → Settings → Websites → (your site) → Tracking code
    websiteId: "",
  },
});

(function initUmami() {
  try {
    var cfg = window.ANALYTICS && window.ANALYTICS.umami;
    if (!cfg) return;
    var host = (cfg.host || "").trim().replace(/\/+$/, "");
    var websiteId = (cfg.websiteId || "").trim();
    if (!host || !websiteId) return;

    // Avoid double-injecting.
    if (document.querySelector('script[data-umami="1"]')) return;

    var s = document.createElement("script");
    s.defer = true;
    s.src = host + "/script.js";
    s.setAttribute("data-website-id", websiteId);
    s.setAttribute("data-umami", "1");
    document.head.appendChild(s);
  } catch (_) {
    // Analytics must never break the app.
  }
})();
