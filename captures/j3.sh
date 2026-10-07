#!/bin/zsh
# Captures du lot J3 (rang en séance). Reprenable : saute ce qui existe déjà (FORCE=1 pour refaire).
cd "$(dirname "$0")/.."
OUT=captures/celebrations
CLICK="$(cat captures/click.js)"
shoot() { local name=$1; shift; [[ -f $OUT/$name.png && -z $FORCE ]] && { echo "déjà : $name"; return; }; node captures/shoot.mjs --out $OUT/$name "$@"; }
shoot rang-B --play rank-B --dur 2300 --times 0.1,0.3,0.55,0.8,1.1,1.9
shoot rang-A --play rank-A --dur 2600 --times 0.1,0.35,0.6,0.9,1.2,2.1
shoot rang-S --play rank-S --dur 3100 --times 0.15,0.45,0.8,1.1,1.6,2.6
shoot bandeau-rang-en-vue-2 --play near-A-2 --dur 2400 --times 0.1,0.3,0.6,1,1.6,2.2
shoot bandeau-rang-en-vue-1 --play near-A-1 --dur 2400 --times 0.1,0.3,0.6,1,1.6,2.2
shoot bandeau-un-record --play near-S-r --dur 2400 --times 0.1,0.3,0.6,1,1.6,2.2
for c in 1 2 3 5; do shoot bandeau-battue-$c --play beaten-$c --dur 2000 --times 0.08,0.2,0.35,0.6,1,1.6; done
# Le vrai chemin : simulateur de séance, série après série.
shoot seance-approche-B --setup "$CLICK; __click('+ série tenue', 6)" --js "__click('+ série tenue')" --dur 2600 --times 0.1,0.3,0.6,1,1.6,2.4
shoot seance-passage-B --setup "$CLICK; __click('+ série tenue', 8)" --js "__click('+ série tenue')" --dur 3600 --times 0.2,0.5,0.9,1.5,2.4,3.4
