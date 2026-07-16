import type { MetadataRoute } from "next";

/**
 * Manifeste PWA — permet l'ajout à l'écran d'accueil (iOS/Android) en mode
 * standalone. Les icônes sont générées via `app/icon.tsx` (192) et une
 * variante 512 dédiée ici (mêmes routes gérées par Next, cf. app-icons doc).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Jeera",
    short_name: "Jeera",
    description: "Journal de musculation intelligent — suggestions poids/reps adaptatives",
    start_url: "/",
    display: "standalone",
    background_color: "#07080e",
    theme_color: "#07080e",
    orientation: "portrait",
    icons: [
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
