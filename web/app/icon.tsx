import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

/**
 * Icône PWA (512, servie en `/icon`, aussi utilisée par les notifications) : le logo d'Evan,
 * bras contracté dont le biceps part en flammes (26/09/2026). Source : `assets/brand/jeera-logo.webp`.
 * L'adresse `/icon` reste celle d'avant : le proxy et les notifications la connaissent.
 */
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default async function Icon() {
  const png = await readFile(join(process.cwd(), "assets/brand/icon-512.png"));
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%" }}>
        <img src={`data:image/png;base64,${png.toString("base64")}`} width={512} height={512} alt="" />
      </div>
    ),
    { ...size }
  );
}
