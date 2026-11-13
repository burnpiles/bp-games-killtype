// Google Analytics 4 via gtag.js. Completely off unless VITE_GA_ID is set at build time
// (e.g. VITE_GA_ID=G-XXXXXXXXXX in Vercel's environment variables), so local dev and
// previews never send anything.

type Gtag = (...args: unknown[]) => void;
declare global { interface Window { dataLayer?: unknown[]; gtag?: Gtag } }

const ID = (import.meta.env.VITE_GA_ID as string | undefined)?.trim() || '';
let ready = false;

export function initAnalytics() {
  if (!ID || ready || typeof window === 'undefined' || window.gtag || !/^G-[A-Z0-9]+$/i.test(ID)) return;
  ready = true;
  window.dataLayer = window.dataLayer || [];
  // gtag must push the real `arguments` object; events queue here until the script loads
  window.gtag = function gtag() { // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.gtag('js', new Date());
  window.gtag('config', ID, { send_page_view: true });
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ID)}`;
  document.head.appendChild(s);
}

/** Send a GA4 event. Safe to call anywhere: a no-op when analytics is off. */
export function track(name: string, params: Record<string, string | number | boolean> = {}) {
  if (!ID || typeof window === 'undefined' || !window.gtag) return;
  try { window.gtag('event', name, params); } catch { /* never let analytics break the game */ }
}
