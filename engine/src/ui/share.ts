// ---- sharing an image from the browser: the share sheet, copy, save, and an X (Twitter) post ----
// the game draws the image and decides which of these to offer (see games' share panels)
export type NativeShareResult = 'shared' | 'cancelled' | 'failed';
export const X_INTENT_URL = 'https://twitter.com/intent/tweet?text=';
const REVOKE_DELAY = 10000; // ms before a saved file's URL is released
export function canShareFile(file: File): boolean {
  return !!(navigator.canShare && navigator.canShare({ files: [file] }));
}
// opens the system share sheet with the image attached. 'cancelled' means the user closed it
export async function shareNative(file: File, text: string): Promise<NativeShareResult> {
  try {
    await navigator.share({ files: [file], text });
    return 'shared';
  } catch (e) {
    return e instanceof Error && e.name === 'AbortError' ? 'cancelled' : 'failed';
  }
}
export function canCopyImage(): boolean {
  return !!(window.ClipboardItem && navigator.clipboard && navigator.clipboard.write);
}
export async function copyImage(blob: Blob): Promise<boolean> {
  try {
    await navigator.clipboard.write([new ClipboardItem({ [blob.type || 'image/png']: blob })]);
    return true;
  } catch {
    return false;
  }
}
// download any blob (an image, a save code...) as a file named `filename`
export function saveFile(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), REVOKE_DELAY);
}
export function openXPost(text: string) {
  window.open(X_INTENT_URL + encodeURIComponent(text), '_blank', 'noopener');
}
