import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

/**
 * Icône iOS « ajouter à l'écran d'accueil » (180 × 180, fond plein : iOS applique son propre
 * masque). Même logo que `icon.tsx`, source `assets/brand/jeera-logo.webp`.
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon() {
  const png = await readFile(join(process.cwd(), "assets/brand/apple-icon-180.png"));
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%" }}>
        <img src={`data:image/png;base64,${png.toString("base64")}`} width={180} height={180} alt="" />
      </div>
    ),
    { ...size }
  );
}
