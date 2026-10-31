// #trailer / #trailer-music: films the trailer from the script tools/trailer/capture.mjs hands the page (trailer.ts)
export function showTrailer(hash: string) {
  void import('../trailer.ts').then(m => m.filmTrailer(hash.startsWith('#trailer-music')));
}
