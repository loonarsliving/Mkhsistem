import "server-only";

const FREESOUND_SEARCH_URL = "https://freesound.org/apiv2/search/text/";

interface FreesoundResult {
  name: string;
  license: string;
  previews?: Record<string, string>;
}

export interface BackgroundMusicResult {
  buffer: Buffer;
  name: string;
  license: string;
}

/**
 * Picks one royalty-free background track from Freesound matching the
 * creative brief's mood/theme and downloads its preview MP3. Filtered to
 * CC0-licensed sounds only, so a result never needs attribution -- safe to
 * publish without separately crediting the original author. Never throws:
 * returns null on any failure (no API key, no match, network error) so a
 * render still completes without music rather than failing outright.
 */
export async function fetchBackgroundMusic(query: string): Promise<BackgroundMusicResult | null> {
  const apiKey = process.env.FREESOUND_API_KEY;
  if (!apiKey) {
    console.error("[music] FREESOUND_API_KEY belum diset -- render tanpa background music");
    return null;
  }

  try {
    const searchUrl = new URL(FREESOUND_SEARCH_URL);
    searchUrl.searchParams.set("query", query);
    searchUrl.searchParams.set("token", apiKey);
    searchUrl.searchParams.set("filter", 'license:"Creative Commons 0" duration:[15 TO 180]');
    searchUrl.searchParams.set("fields", "name,license,previews");
    searchUrl.searchParams.set("page_size", "1");

    const searchRes = await fetch(searchUrl.toString());
    if (!searchRes.ok) throw new Error(`Freesound search gagal (HTTP ${searchRes.status})`);

    const searchData = (await searchRes.json()) as { results?: FreesoundResult[] };
    const candidate = searchData.results?.[0];
    const previewUrl = candidate?.previews?.["preview-hq-mp3"] ?? candidate?.previews?.["preview-lq-mp3"];
    if (!candidate || !previewUrl) return null;

    const audioRes = await fetch(previewUrl);
    if (!audioRes.ok) throw new Error(`Gagal mengunduh preview musik (HTTP ${audioRes.status})`);
    const buffer = Buffer.from(await audioRes.arrayBuffer());

    return { buffer, name: candidate.name, license: candidate.license };
  } catch (error) {
    console.error("[music] Gagal mengambil background music, fallback tanpa musik:", error instanceof Error ? error.message : error);
    return null;
  }
}
