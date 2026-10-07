#!/usr/bin/env node
/**
 * Captures des célébrations à l'échelle iPhone (390 × 844, @2x) par le protocole de débogage de
 * Chrome : enregistrement de l'écran (Page.startScreencast) pendant la scène, vidéo MP4 et planche
 * d'images clés. Le panneau navigateur masqué de Claude fige framer-motion : d'où ce Chrome à part.
 *
 * node captures/shoot.mjs --play rank-S --dur 3200 --out captures/celebrations/rang-S \
 *   [--url http://localhost:3102/dev/celebrations] [--times 0.3,0.7,1.1,1.6,2.2,2.9] [--scroll 0]
 *   [--setup "<js joué avant, hors capture>"] [--js "<js déclencheur à la place de --play>"]
 *
 * Sorties : <out>.mp4, <out>.png (planche), <out>-frames/ (images brutes, supprimées sauf --keep).
 */
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, value, index, all) => (value.startsWith("--") ? [...pairs, [value.slice(2), all[index + 1]?.startsWith("--") ? "1" : all[index + 1] ?? "1"]] : pairs), [])
);
const url = args.url ?? "http://localhost:3102/dev/celebrations";
const play = args.play;
const duration = Number(args.dur ?? 3000);
const out = resolve(args.out ?? `captures/celebrations/${play}`);
const times = (args.times ?? "").split(",").filter(Boolean).map(Number);
const scale = 2;
const port = 9300 + Math.floor(Math.random() * 400);
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const profile = mkdtempSync(join(tmpdir(), "jeera-shoot-"));

const browser = spawn(chrome, [`--remote-debugging-port=${port}`, "--headless=new", `--user-data-dir=${profile}`, "--no-first-run", "--hide-scrollbars", "--window-size=500,900"], { stdio: "ignore" });
const withTimeout = (promise, what) => Promise.race([promise, new Promise((_, fail) => setTimeout(() => fail(new Error(`délai dépassé : ${what}`)), 8000))]);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function target() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((entry) => entry.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(200);
  }
  throw new Error("Chrome ne répond pas");
}

const ws = new WebSocket(await target());
await new Promise((done) => ws.addEventListener("open", done));
let nextId = 1;
const pending = new Map();
const listeners = new Map();
ws.addEventListener("message", (message) => {
  const data = JSON.parse(message.data);
  if (data.id && pending.has(data.id)) {
    pending.get(data.id)(data);
    pending.delete(data.id);
  } else if (data.method) listeners.get(data.method)?.(data.params);
});
const send = (method, params = {}) =>
  new Promise((done) => {
    const id = nextId++;
    pending.set(id, done);
    ws.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;

try {
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: scale, mobile: true });
  // Temps virtuel cohérent : framer-motion tout en JavaScript (sans WAAPI, qui suit son propre
  // horloge) et des images d'animation datées par la même horloge que performance.now().
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `delete Element.prototype.animate; const __raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => __raf(() => cb(performance.now()));`,
  });
  await send("Page.navigate", { url });
  for (let attempt = 0; attempt < 240; attempt += 1) {
    if (await evaluate("typeof window.__jeeraCelebrate === 'function' && document.fonts.status === 'loaded'")) break;
    await sleep(250);
  }
  await sleep(600);
  // Un pixel qui clignote en permanence : sous temps virtuel, une capture attend une nouvelle image,
  // et une page immobile (scène finie) n'en produirait plus.
  await evaluate(`document.body.insertAdjacentHTML("beforeend", '<style>@keyframes shoot-tick{to{opacity:.98}}</style><i style="position:fixed;left:0;top:0;width:1px;height:1px;background:#070708;animation:shoot-tick .066s steps(2) infinite;z-index:99"></i>')`);
  if (args.scroll) await evaluate(`window.scrollTo(0, ${Number(args.scroll)})`);

  // Temps virtuel : la page n'avance que quand on le dit, image par image (30 i/s exactes), quelle
  // que soit la lenteur du serveur de développement ou de l'encodage des captures.
  const frames = [];
  const fps = 30;
  const step = 1000 / fps;
  const waitBudget = () => new Promise((done) => listeners.set("Emulation.virtualTimeBudgetExpired", done));
  await send("Emulation.setVirtualTimePolicy", { policy: "pause" });
  if (args.setup) {
    await send("Emulation.setVirtualTimePolicy", { policy: "advance", budget: 1 });
    await evaluate(args.setup);
    const settled = waitBudget();
    await send("Emulation.setVirtualTimePolicy", { policy: "advance", budget: Number(args.settle ?? 9000) });
    await settled;
  }
  // Déclencheur : une scène par son nom, ou un script (cliquer dans le simulateur de séance).
  const ok = args.js ? (await evaluate(args.js), true) : await evaluate(`window.__jeeraCelebrate(${JSON.stringify(play)})`);
  if (!ok) throw new Error(`Scène inconnue : ${play}`);
  const start = 0;
  for (let index = 0; index * step <= duration; index += 1) {
    const expired = waitBudget();
    if (args.debug) console.error("advance", index);
    await send("Emulation.setVirtualTimePolicy", { policy: "advance", budget: step });
    await withTimeout(expired, "budget");
    if (args.debug) console.error("shot", index);
    const shot = await withTimeout(send("Page.captureScreenshot", { format: "jpeg", quality: 92 }), "capture");
    frames.push({ data: shot.result.data, at: (index + 1) * step / 1000 });
  }
  const dir = `${out}-frames`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  mkdirSync(dirname(out), { recursive: true });
  const kept = frames;
  if (kept.length === 0) throw new Error("Aucune image reçue");
  let list = "";
  kept.forEach((frame, index) => {
    const file = join(dir, `${String(index).padStart(4, "0")}.jpg`);
    writeFileSync(file, Buffer.from(frame.data, "base64"));
    const next = kept[index + 1]?.at ?? frame.at + 0.1;
    list += `file '${file}'\nduration ${Math.max(0.001, next - frame.at).toFixed(3)}\n`;
  });
  list += `file '${join(dir, `${String(kept.length - 1).padStart(4, "0")}.jpg`)}'\n`;
  writeFileSync(join(dir, "list.txt"), list);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", join(dir, "list.txt"), "-vf", "fps=30,scale=780:-2,format=yuv420p", "-c:v", "libx264", "-crf", "20", `${out}.mp4`]);

  // Planche : les images les plus proches des instants demandés, côte à côte, réduites de moitié.
  const wanted = times.length ? times : [0.25, 0.6, 1, 1.5, 2.1, Math.max(2.4, duration / 1000 - 0.3)];
  const picks = wanted.map((time) => {
    let best = 0;
    kept.forEach((frame, index) => {
      if (Math.abs(frame.at - start - time) < Math.abs(kept[best].at - start - time)) best = index;
    });
    return { file: join(dir, `${String(best).padStart(4, "0")}.jpg`), label: (kept[best].at - start).toFixed(2) };
  });
  const inputs = picks.flatMap((pick) => ["-i", pick.file]);
  const font = "/System/Library/Fonts/Supplemental/Arial.ttf";
  const filters = picks.map((pick, index) => `[${index}:v]scale=390:-2,drawtext=fontfile=${font}:text='${pick.label} s':x=10:y=10:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=4[f${index}]`);
  const stack = `${picks.map((_, index) => `[f${index}]`).join("")}hstack=inputs=${picks.length}[out]`;
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...inputs, "-filter_complex", [...filters, stack].join(";"), "-map", "[out]", `${out}.png`]);
  if (!args.keep) rmSync(dir, { recursive: true, force: true });
  console.log(`${play} : ${kept.length} images, ${out}.mp4, ${out}.png`);
} finally {
  ws.close();
  browser.kill("SIGKILL");
  rmSync(profile, { recursive: true, force: true });
}
