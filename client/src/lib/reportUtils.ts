/**
 * Shared report utilities used by both the preview renderer and the print/PDF renderer.
 * Single source of truth — import from here, do not duplicate.
 */

/**
 * If all rows share the same single data source, return it so it can be
 * hoisted into a table sub-label instead of repeated per-row.
 * Returns null when rows use mixed sources (render per-row instead).
 */
export function computeSharedSource(sources: (string | undefined)[]): string | null {
  const filtered = sources.filter(
    (s): s is string => !!s && s !== "Manual entry needed" && s !== "—" && s !== "Site Structure"
  );
  if (filtered.length === 0) return null;
  const unique = Array.from(new Set(filtered));
  return unique.length === 1 ? unique[0] : null;
}

/**
 * Same as computeSharedSource but for rows where each row can have multiple
 * sources (keyword rows carry an array of sources per row).
 * Returns the shared joined source label if every row has an identical source set,
 * otherwise returns null (render per-row).
 */
export function computeSharedSourceList(sourceSets: string[][]): string | null {
  if (sourceSets.length === 0) return null;
  const joined = sourceSets.map(s => Array.from(s).sort().join("+"));
  const unique = Array.from(new Set(joined));
  if (unique.length !== 1) return null;
  return sourceSets[0].join(" + ") || null;
}
