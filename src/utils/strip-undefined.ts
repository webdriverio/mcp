/**
 * Utility to strip undefined, null, and empty string values from objects
 *
 * Used to clean up element data before encoding to avoid null clutter in TOON output.
 * TOON format is columnar - it creates a unified schema from ALL objects.
 * If ANY object has a field, ALL rows get that column with null for missing values.
 * By stripping undefined/null/empty values BEFORE encoding, we ensure TOON only
 * creates columns for fields that actually have values.
 */

/**
 * Strip undefined, null, and empty string values from an object
 * @param obj - The object to clean
 * @returns A new object with only defined, non-null, non-empty values
 */
export function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => v !== undefined && v !== null && v !== ''),
  ) as Partial<T>;
}

/**
 * Strip undefined values from an array of objects
 * @param arr - The array of objects to clean
 * @returns A new array with cleaned objects
 */
export function stripUndefinedFromArray<T extends Record<string, unknown>>(arr: T[]): Partial<T>[] {
  return arr.map(stripUndefined);
}