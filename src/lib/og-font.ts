let monoFontCache: ArrayBuffer | null = null;
let displayFontCache: ArrayBuffer | null = null;

export async function loadFont(): Promise<ArrayBuffer> {
  if (monoFontCache) return monoFontCache;
  const res = await fetch(
    "https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff"
  );
  monoFontCache = await res.arrayBuffer();
  return monoFontCache;
}

export async function loadDisplayFont(): Promise<ArrayBuffer> {
  if (displayFontCache) return displayFontCache;
  const res = await fetch(
    "https://cdn.jsdelivr.net/npm/@fontsource/press-start-2p/files/press-start-2p-latin-400-normal.woff"
  );
  displayFontCache = await res.arrayBuffer();
  return displayFontCache;
}
