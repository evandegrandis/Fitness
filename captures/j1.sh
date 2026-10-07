#!/bin/zsh
# Captures du lot J1 (série de S). Reprenable : saute ce qui existe déjà (FORCE=1 pour refaire).
cd "$(dirname "$0")/.."
OUT=captures/celebrations
shoot() { local name=$1; shift; [[ -f $OUT/$name.png && -z $FORCE ]] && { echo "déjà : $name"; return; }; node captures/shoot.mjs --out $OUT/$name "$@"; }
shoot serie-2 --play streak-2 --dur 2900 --times 0.15,0.4,0.6,0.8,1.2,2.4
shoot serie-3 --play streak-3 --dur 3000 --times 0.2,0.45,0.7,1,1.4,2.6
shoot serie-4 --play streak-4 --dur 3300 --times 0.2,0.37,0.6,0.88,1.4,2.8
shoot serie-5 --play streak-5 --dur 3400 --times 0.3,0.6,0.9,1.2,1.6,3
shoot serie-6-maillon --play streak-6 --dur 2600 --times 0.1,0.35,0.6,0.75,1,2.2
shoot serie-7 --play streak-7 --dur 3600 --times 0.3,0.7,1.1,1.5,2,3.2
shoot serie-10 --play streak-10 --dur 3800 --times 0.25,0.55,0.9,1.3,1.8,3.4
shoot serie-11-maillon --play streak-11 --dur 2600 --times 0.1,0.35,0.6,0.75,1,2.2
shoot serie-15 --play streak-15 --dur 3800 --times 0.3,0.6,0.95,1.2,1.7,3.4
shoot serie-20 --play streak-20 --dur 3900 --times 0.33,0.5,0.76,1.15,1.6,3.4
shoot serie-25 --play streak-25 --dur 3900 --times 0.3,0.7,1,1.15,1.6,3.4
shoot serie-30-legende --play streak-30 --dur 3900 --times 0.4,0.9,1.4,1.7,2.2,3.4
shoot serie-35-legende --play streak-35 --dur 3900 --times 0.4,0.9,1.4,1.7,2.2,3.4
