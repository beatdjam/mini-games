// engine: Analytics events. track(name, params) sends a GA4 event when the page has the tag, which the build adds
// only on the published site (vite.config.js, GA_ID). On the dev server, in tests and in a local preview there is
// no tag and it only records the event in TRACK_LOG, so games can call it anywhere.
// GA4 rules: snake_case names up to 40 characters; params flat (string / number / boolean), at most 25 per event.
export type TrackParams = Record<string, string | number | boolean>;
// set by the game at start-up: game = its id, sent with every event (tells the games apart in the reports)
export const ANALYTICS = { game: '' };
// the most recent events (tests check them; also handy in the console)
export const TRACK_LOG: { name: string; params: TrackParams }[] = [];
export function track(name: string, params: TrackParams = {}) {
  if (ANALYTICS.game) params = { game: ANALYTICS.game, ...params };
  TRACK_LOG.push({ name, params });
  if (TRACK_LOG.length > 50) TRACK_LOG.shift();
  if (typeof window.gtag === 'function') window.gtag('event', name, params);
}
