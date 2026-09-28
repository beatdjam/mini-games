// Browser APIs the standard DOM types leave out: WebKit-prefixed fullscreen / audio, iOS home-screen mode,
// orientation lock (not in every browser's typings), and the GA4 tag the build adds on the published site
interface Document {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
}
interface HTMLElement { webkitRequestFullscreen?: () => Promise<void> | void; }
interface Navigator { standalone?: boolean; }
interface Window { webkitAudioContext?: typeof AudioContext; gtag?: (...args: unknown[]) => void; }
interface ScreenOrientation { lock?(orientation: string): Promise<void>; }
