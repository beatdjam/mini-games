// one way into the game without playing it by hand (dev/dev.ts): the hash it answers and what it shows.
export interface DevView {
  hash: string; // the hash it answers ('#view-items'), or the start of one ('#view-')
  match: 'is' | 'starts'; // the whole hash, or any hash that starts with it
  name: string; // what it shows, in one line (the list of views)
  run: (hash: string) => void; // sets the view up; the hash is passed whole (the view slices it)
}
// the view a hash asks for: the longest hash that matches (so '#view-items' beats '#view-'), or null.
export function findDevView(views: readonly DevView[], hash: string): DevView | null {
  let found: DevView | null = null;
  for (const view of views) {
    const hit = view.match === 'is' ? hash === view.hash : hash.startsWith(view.hash);
    if (hit && (!found || view.hash.length > found.hash.length)) found = view;
  }
  return found;
}
