/**
 * Open Badges 3.0 "baking" for SVG images (OB 3.0 §5.3.2): the signed
 * credential is embedded in the badge image, so the image file itself can be
 * imported into a wallet or verifier.
 */
const NS = 'https://purl.imsglobal.org/ob/v3p0';

export function bakeSvg(svg: string, credential: unknown): string {
  const json = JSON.stringify(credential).replaceAll(']]>', ']]]]><![CDATA[>');
  return svg.replace(/<svg\b([^>]*)>/, `<svg$1 xmlns:openbadges="${NS}"><openbadges:credential><![CDATA[${json}]]></openbadges:credential>`);
}

/** Returns the embedded credential's JSON text, or undefined if the SVG is not baked. */
export function unbakeSvg(svg: string): string | undefined {
  const m = svg.match(/<openbadges:credential[^>]*>([\s\S]*?)<\/openbadges:credential>/);
  if (!m) return undefined;
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}
