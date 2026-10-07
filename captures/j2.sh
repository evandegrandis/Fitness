#!/bin/zsh
# Captures du lot J2 (secrets). HORS dépôt : règle d'Evan, rien qui montre un secret dans la PR.
# Reprenable : saute ce qui existe déjà (FORCE=1 pour refaire).
cd "$(dirname "$0")/.."
OUT=$HOME/.local/share/barbis-dev/jeera-anim-secrets
mkdir -p $OUT
for id in aube minuit triple razzia marathon sans-faute premier-s trois-s dix-s lancee tranchant semaine-parfaite moisson remontada retour metronome sept-jours double-palier fantome fantome-ecrase volume or-massif six-mois un-an; do
  [[ -f $OUT/$id.png && -z $FORCE ]] && { echo "déjà : $id"; continue; }
  node captures/shoot.mjs --out $OUT/$id --play secret-$id --dur 3300 --times 0.2,0.5,0.9,1.3,1.8,3
done
