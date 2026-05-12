/**
 * slug.ts
 *
 * Shared string-to-slug utility used by awareness.ts and the tool handlers.
 */

/**
 * Converts a free-form string into a URL/filesystem-safe slug.
 * - lowercases
 * - strips non-alphanumeric / non-space / non-hyphen characters
 * - collapses whitespace and hyphens to a single hyphen
 * - trims leading/trailing hyphens
 * - truncates to 40 characters
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
