import { ImageResponse } from "next/og";

/**
 * Icône PWA générée (192/512 servies depuis cette même route par Next) —
 * monogramme "J" sur le dégradé de marque cyan → violet. Pas d'asset binaire :
 * cohérent avec la règle "no external dependencies" du projet.
 */
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #07080e 0%, #10121d 40%, #07080e 100%)",
        }}
      >
        <div
          style={{
            width: "84%",
            height: "84%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 96,
            background: "linear-gradient(135deg, #34e0ea 0%, #a78bfa 100%)",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 300,
              fontWeight: 700,
              color: "#06070d",
              fontFamily: "sans-serif",
              transform: "translateY(-6px)",
            }}
          >
            J
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
