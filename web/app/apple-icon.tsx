import { ImageResponse } from "next/og";

/**
 * Icône iOS "ajouter à l'écran d'accueil" (180×180, sans coins arrondis —
 * iOS applique son propre masque). Même monogramme "J" que `icon.tsx`.
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #34e0ea 0%, #a78bfa 100%)",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 108,
            fontWeight: 700,
            color: "#06070d",
            fontFamily: "sans-serif",
            transform: "translateY(-2px)",
          }}
        >
          J
        </div>
      </div>
    ),
    { ...size }
  );
}
