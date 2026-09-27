// Browser APIs the standard DOM types leave out: WebKit-prefixed fullscreen / audio, iOS home-screen mode,
// and orientation lock (not in every browser's typings)
interface Document {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
}
interface HTMLElement { webkitRequestFullscreen?: () => Promise<void> | void; }
interface Navigator { standalone?: boolean; }
interface Window { webkitAudioContext?: typeof AudioContext; }
interface ScreenOrientation { lock?(orientation: string): Promise<void>; }
