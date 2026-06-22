/**
 * Bumped whenever the shared visual style changes. It is cited in the prompt and folded
 * into the illustration cache key, so a style change invalidates cached images rather than
 * silently mixing old and new looks across a manual.
 */
export const ILLUSTRATE_STYLE_VERSION = 'illustrate-style-v1';

/**
 * The shared IKEA/LEGO-style template applied to every step so illustrations stay visually
 * consistent across a manual (spec 14: "shared style template for visual consistency").
 */
export const ILLUSTRATE_STYLE_PROMPT = `Render a clean, print-ready schematic line illustration in a consistent IKEA/LEGO assembly-manual style:
- flat, high-contrast black line art on a plain white background; no photographic shading, gradients, or colour photos;
- show only the parts involved in THIS step and the single action being performed;
- use simple directional arrows for motion, insertion, and rotation;
- add small numbered callouts for parts where it aids clarity;
- no paragraphs of text, no logos, no scenery or background props.`;
