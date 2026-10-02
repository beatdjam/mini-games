// engine: Feedback form. openFeedback(info) opens the shared Google Form in a new tab with the game, the build and
// `info` (the player's situation, written by the game) already filled in, so the player only writes their comment.
// One form serves every game. FEEDBACK_FORM holds its address (the .../viewform URL) and the entry ids of the three
// pre-filled questions: in Google Forms, "Get pre-filled link", fill those three and copy the link; each answer shows
// up in it as entry.<id>=. While url is empty feedbackReady() is false and openFeedback does nothing, so games can
// show their button only when it works.
export const FEEDBACK_FORM = {
  url: 'https://docs.google.com/forms/d/e/1FAIpQLSeBQFZawx76qvFJLOQsaoR26gI2l0shTm5DvBMROq3r78qpbg/viewform',
  game: '1274129536',
  build: '1369941180',
  info: '431974325',
};
// set by the game at start-up: its id, filled into the form's "game" question
export const FEEDBACK = { game: '' };
// info is cut to this many characters: the whole address has to stay a length browsers and Google accept
export const FEEDBACK_INFO_MAX = 1500;
export const feedbackReady = (form = FEEDBACK_FORM): boolean => !!form.url;
// the build stamp of this page (<meta name="build">, set by the build; 'dev' on the dev server)
export const pageBuild = (): string => document.querySelector<HTMLMetaElement>('meta[name="build"]')?.content || 'dev';
// the form's address with the answers filled in, or null while there is no form
export function feedbackUrl(info = '', form = FEEDBACK_FORM): string | null {
  if (!feedbackReady(form)) return null;
  const q = new URLSearchParams({ usp: 'pp_url' });
  const put = (id: string, v: string) => {
    if (id && v) q.set('entry.' + id, v);
  };
  put(form.game, FEEDBACK.game);
  put(form.build, pageBuild());
  put(form.info, info.length > FEEDBACK_INFO_MAX ? info.slice(0, FEEDBACK_INFO_MAX - 1) + '…' : info);
  return form.url + (form.url.includes('?') ? '&' : '?') + q.toString();
}
// true when the form was opened
export function openFeedback(info = ''): boolean {
  const url = feedbackUrl(info);
  if (!url) return false;
  window.open(url, '_blank', 'noopener');
  return true;
}
