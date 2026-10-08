// === config/analytics-config.js ===
/**
 * Optional analytics:
 * - Umami (self-hosted)
 * - Google tag (gtag.js) — GA4 install matches Google’s snippet for the configured id
 *
 * This project is shipped as plain static files (no bundler). To keep analytics
 * easy to enable/disable per deployment, scripts load only when configured.
 */

window.ANALYTICS = Object.freeze({
  umami: {
    // Example: "https://stats.example.com"
    host: "",
    // Website ID from Umami → Settings → Websites → (your site) → Tracking code
    websiteId: "",
  },
  ga4: {
    // GA4 Admin → Data streams → Web → Measurement ID (format G-XXXXXXXXXX)
    measurementId: "G-LVC2WSQ47Q",
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

// Google tag (gtag.js) — same calls as:
//   <script async src="https://www.googletagmanager.com/gtag/js?id=G-…"></script>
//   gtag('js', new Date()); gtag('config', 'G-…');
(function initGoogleTagGa4() {
  try {
    var cfg = window.ANALYTICS && window.ANALYTICS.ga4;
    var measurementId = (cfg && cfg.measurementId || "").trim();
    if (!measurementId) return;
    if (document.querySelector('script[data-google-gtag="1"]')) return;

    window.dataLayer = window.dataLayer || [];
    function gtag() {
      window.dataLayer.push(arguments);
    }
    window.gtag = gtag;
    gtag("js", new Date());
    gtag("config", measurementId);

    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(measurementId);
    s.setAttribute("data-google-gtag", "1");
    document.head.appendChild(s);
  } catch (_) {
    // Analytics must never break the app.
  }
})();
