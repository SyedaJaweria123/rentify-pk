// src/app/chart-setup.ts
// ─────────────────────────────────────────────────────────────────────────────
// Self-hosted Chart.js bootstrap.
//
// Why: the app previously loaded Chart.js from a CDN <script> in index.html.
// If that CDN is slow, blocked, or offline (college wifi, lab PC, a viva with
// bad internet), the global `Chart` is undefined and every `new Chart(...)`
// throws — which can freeze a whole page. Bundling Chart.js into the app makes
// it always available, offline included, with no CDN dependency.
//
// How it stays zero-touch for the chart components: they use a global `Chart`
// (declared as `declare const Chart: any;`). We import the bundled Chart.js,
// register all controllers/elements/scales/plugins, and assign it to
// `window.Chart` BEFORE the app bootstraps — so that existing global usage keeps
// working unchanged, now served from the bundle instead of the CDN.
//
// Requires the package to be installed once:  npm install chart.js@4.4.3
// ─────────────────────────────────────────────────────────────────────────────
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

// Expose globally so components that use `declare const Chart` resolve to this
// bundled instance (no CDN needed).
(window as any).Chart = Chart;

export { Chart };
