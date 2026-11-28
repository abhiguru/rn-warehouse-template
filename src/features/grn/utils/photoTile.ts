/** A photo tile is icon-only below this width at font scale 1 (Design, WH-303 DQ14); the words stay in its spoken label. */
export const PHOTO_TILE_WORDS_MIN_WIDTH = 88;

/** Whether a photo tile of this width has room for its words at the user's font scale: large text never clips. */
export const photoTileShowsWords = (tileWidth: number, fontScale: number): boolean =>
  tileWidth >= PHOTO_TILE_WORDS_MIN_WIDTH * fontScale;
