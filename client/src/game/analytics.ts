// Analytics. GA4 (G-7Y24B9G1F5) is loaded directly with gtag.js and receives page views and
// game events. Google Tag Manager (GTM-KZ7MKS9W) is also loaded for any future tags, but GA is
// NOT routed through it: adding a GA4 tag inside GTM would double-count everything.
// Game events are also pushed to dataLayer as GTM custom events, in case GTM tags need them.
//
// Only active on the live site (any *killtype.com host), or anywhere VITE_GA_ID / VITE_GTM_ID
// is set explicitly at build time, so localhost, previews and forks never send data.

type Gtag = (...args: unknown[]) => void;
declare global { interface Window { dataLayer?: unknown[]; gtag?: Gtag } }

const ENV_GTM = (import.meta.env.VITE_GTM_ID as string | undefined)?.trim() || '';
const GTM_ID = ENV_GTM || 'GTM-KZ7MKS9W';
const ENV_GA = (import.meta.env.VITE_GA_ID as string | undefined)?.trim() || '';
const GA_ID = ENV_GA || 'G-7Y24B9G1F5';

function enabled(): boolean {
  if (typeof window === 'undefined') return false;
  if (ENV_GTM || ENV_GA) return true;
  return /(^|\.)killtype\.com$/i.test(window.location.hostname);
}

export function initAnalytics() {
  if (!enabled() || (window as any).__ktAnalytics) return;
  (window as any).__ktAnalytics = true;
  window.dataLayer = window.dataLayer || [];
  if (!window.gtag) {
    window.gtag = function gtag() { // gtag needs the real `arguments` object
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    };
  }
  if (/^GTM-[A-Z0-9]+$/i.test(GTM_ID)) {
    window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(GTM_ID)}`;
    document.head.appendChild(s);
  }
  if (/^G-[A-Z0-9]+$/i.test(GA_ID)) {
    window.gtag('js', new Date());
    window.gtag('config', GA_ID, { send_page_view: true });
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
    document.head.appendChild(s);
  }
}

/** Record a game event. A no-op when analytics is off; never throws. */
export function track(name: string, params: Record<string, string | number | boolean> = {}) {
  if (typeof window === 'undefined' || !(window as any).__ktAnalytics) return;
  try {
    window.dataLayer!.push({ event: name, ...params });                 // GTM custom event
    if (window.gtag) window.gtag('event', name, params);                // GA4
  } catch { /* analytics must never break the game */ }
}
