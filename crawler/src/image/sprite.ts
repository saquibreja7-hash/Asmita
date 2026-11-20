/**
 * Preview sprite sheets (video-fingerprints spec WP21): a video player's
 * contact sheet — one image file holding a grid of the video's thumbnails —
 * is fingerprinted tile by tile in the decoder child, so any one tile that
 * is a survivor video's frame becomes a match (the thumbnail clause: one
 * preview within the threshold).
 *
 * Which image is a sprite is decided from its address, in code, in the
 * parent: video players and storyboards name these files "sprite" or
 * "storyboard". The decision is a heuristic, deliberately cheap and
 * conservative — an image wrongly tagged is split into tiles that match
 * nothing (bounded work, no extra fetch), while a sprite the name misses
 * is hashed whole like any image and can still match as a poster-scale
 * preview. Only the pathname is read, never the query.
 *
 * The tile geometry is chosen in the child from the decoded size
 * (spriteGrid): video thumbnails are ~16:9, so the grid whose tiles sit
 * closest to that aspect wins, with tiles at least MIN_IMAGE_SIDE on both
 * sides (the same floor a standalone image is held to). A grid cannot be
 * proven from bytes alone, so a non-16:9 sprite can be cut on the wrong
 * lines — its tiles then match nothing, which costs coverage on that one
 * file, never a wrong finding.
 */

/**
 * Path tokens that mark an image address as a preview sprite sheet,
 * lowercase, matched as substrings of the URL path. Deliberately not
 * "thumb"/"thumbnail": those names cover single thumbnails too (a
 * thumbnail IS one preview already hashed whole), while every player that
 * ships a contact sheet names it a sprite or a storyboard.
 */
export const SPRITE_URL_TOKENS = ["sprite", "storyboard"] as const;

/** Tiles hashed per sprite sheet: bounds the hashes and pool queries per image. */
export const MAX_SPRITE_TILES = 100;

/** Longest grid side searched (a longer side cannot beat a shorter one at these sizes). */
export const MAX_SPRITE_GRID_SIDE = 16;

/** Video thumbnails are ~16:9; the grid search aims its tiles there. */
export const SPRITE_TARGET_ASPECT = 16 / 9;

/** Whether an image address looks like a preview sprite sheet (pathname only). */
export function isPreviewSpriteUrl(u: URL): boolean {
  const path = u.pathname.toLowerCase();
  for (const token of SPRITE_URL_TOKENS) {
    if (path.includes(token)) return true;
  }
  return false;
}

/**
 * The tile grid a sprite of this size is cut into. Every grid with tiles
 * at least `minSide` on both sides is scored by how close its tile aspect
 * sits to 16:9; ties go to the fewest tiles (a 16:9 image named like a
 * sprite stays whole — its own aspect already hits the target — and a
 * 16:9 grid of 16:9 tiles is cut on its true lines, not a quarter of it).
 */
export function spriteGrid(width: number, height: number, minSide: number): { cols: number; rows: number } {
  const side = Math.max(1, Math.floor(minSide));
  if (width < side || height < side) return { cols: 1, rows: 1 };
  const maxCols = Math.min(MAX_SPRITE_GRID_SIDE, Math.floor(width / side));
  const maxRows = Math.min(MAX_SPRITE_GRID_SIDE, Math.floor(height / side));
  const err = (cols: number, rows: number): number => Math.abs((width / cols) / (height / rows) - SPRITE_TARGET_ASPECT);
  let best = { cols: 1, rows: 1, err: err(1, 1), tiles: 1 };
  for (let rows = 1; rows <= maxRows; rows++) {
    for (let cols = 1; cols <= maxCols; cols++) {
      const tiles = cols * rows;
      if (tiles > MAX_SPRITE_TILES) break; // cols only grow within this row
      const e = err(cols, rows);
      if (e < best.err || (e === best.err && tiles < best.tiles)) best = { cols, rows, err: e, tiles };
    }
  }
  return { cols: best.cols, rows: best.rows };
}
