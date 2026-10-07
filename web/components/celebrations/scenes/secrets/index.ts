import type { ComponentType } from "react";
import Aube from "./aube";
import Minuit from "./minuit";
import Triple from "./triple";
import Razzia from "./razzia";
import Marathon from "./marathon";
import SansFaute from "./sans-faute";
import PremierS from "./premier-s";
import TroisS from "./trois-s";
import DixS from "./dix-s";
import Lancee from "./lancee";
import Tranchant from "./tranchant";
import SemaineParfaite from "./semaine-parfaite";
import Moisson from "./moisson";
import Remontada from "./remontada";
import Retour from "./retour";
import Metronome from "./metronome";
import SeptJours from "./sept-jours";
import DoublePalier from "./double-palier";
import Fantome from "./fantome";
import FantomeEcrase from "./fantome-ecrase";
import Volume from "./volume";
import OrMassif from "./or-massif";
import SixMois from "./six-mois";
import UnAn from "./un-an";

/**
 * Une mise en scène par secret, désignée par l'identifiant de `career-secrets.ts` (Evan : ne jamais
 * les décrire, nulle part). Un secret sans scène n'en joue aucune : le bilan l'affiche quand même.
 */
export const SECRET_SCENES: Record<string, { Component: ComponentType<{ title: string; description: string }>; duration: number }> = {
  "aube": { Component: Aube, duration: 3400 },
  "minuit": { Component: Minuit, duration: 3400 },
  "triple": { Component: Triple, duration: 3400 },
  "razzia": { Component: Razzia, duration: 3400 },
  "marathon": { Component: Marathon, duration: 3600 },
  "sans-faute": { Component: SansFaute, duration: 3400 },
  "premier-s": { Component: PremierS, duration: 3400 },
  "trois-s": { Component: TroisS, duration: 3400 },
  "dix-s": { Component: DixS, duration: 3400 },
  "lancee": { Component: Lancee, duration: 3400 },
  "tranchant": { Component: Tranchant, duration: 3400 },
  "semaine-parfaite": { Component: SemaineParfaite, duration: 3400 },
  "moisson": { Component: Moisson, duration: 3600 },
  "remontada": { Component: Remontada, duration: 3400 },
  "retour": { Component: Retour, duration: 3700 },
  "metronome": { Component: Metronome, duration: 3800 },
  "sept-jours": { Component: SeptJours, duration: 3600 },
  "double-palier": { Component: DoublePalier, duration: 3500 },
  "fantome": { Component: Fantome, duration: 3400 },
  "fantome-ecrase": { Component: FantomeEcrase, duration: 3400 },
  "volume": { Component: Volume, duration: 3400 },
  "or-massif": { Component: OrMassif, duration: 3400 },
  "six-mois": { Component: SixMois, duration: 3400 },
  "un-an": { Component: UnAn, duration: 4000 },
};
