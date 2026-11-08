// Agrega los reportes de EmuReady en un JSON compacto para la app.
// uso: node build.mjs [dirDatos=./data] [salida=../emuready.json]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = process.argv[2] || path.join(HERE, "data");
const OUT = process.argv[3] || path.join(HERE, "..", "emuready.json");
const listings = JSON.parse(fs.readFileSync(DIR + "/listings.json", "utf8"));
const systems = JSON.parse(fs.readFileSync(DIR + "/systems.json", "utf8"));

const SYS_SHORT = {
  "Nintendo Switch":"Switch","Sony PlayStation 2":"PS2","Sony PlayStation":"PS1","Sony PlayStation Portable":"PSP",
  "Sony PlayStation Vita":"PS Vita","Nintendo GameCube":"GameCube","Nintendo Wii":"Wii","Nintendo Wii U":"Wii U",
  "Nintendo 3DS":"3DS","Nintendo DS":"DS","Nintendo 64":"N64","Sega Dreamcast":"Dreamcast","Sega Saturn":"Saturn",
  "Sony PlayStation 3":"PS3","Sony PlayStation 4":"PS4","Sony PlayStation 5":"PS5","Microsoft Windows":"PC",
  "Microsoft Xbox":"Xbox","Microsoft Xbox 360":"Xbox 360","Apple iOS":"iOS"};
const sysName = Object.fromEntries(systems.map(s => [s.id, SYS_SHORT[s.name] || s.name]));

// SoC de EmuReady → chip de la app (el orden importa)
const RULES = [
  ["sd8e", /8 Elite|8 Gen 5/i], ["sd8g1", /8s Gen 3|7\+ Gen 3|8\+? Gen 1|G3x Gen 1/i], ["sd8g3", /8s? Gen [34]/i],
  ["sd8g2", /8 Gen 2|G3x? Gen [23]|QCS8550/i], ["sd7xx", /G1 Gen [12]/i],
  ["sd888", /\b888|\b870|7\+ Gen 2/i], ["sd865", /\b86[05]\b|\b8[45]5\b/i], ["sd7xx", /\b76[05]G?\b/i],
  ["sd7g", /7s? Gen [1-4]|\b77[08]|\b78[02]G?/i], ["sd7xx", /\b7[1-5]\dG?\b|\b69[05]\b|6s? Gen [1-4]|G2 Gen 2|\b720G/i],
  ["sd6xx", /\b6[0-8]\d\b|4s? Gen [12]|\b4[0-9]{2}\b/i],
  ["d9k", /Dimensity 9[3-5]00/i], ["d8k", /Dimensity (8[0-5]\d0|9[02]00)/i], ["d1k", /Dimensity (1[0-3]\d0|7\d{3})/i],
  ["g99", /Helio G9\d|Dimensity (6\d{3}|[789][01]0)|Unisoc T[78]\d\d|Tiger T[78]\d\d/i],
  ["g85", /Helio|Unisoc|Tiger|RK35|RK33|Allwinner|H700|A133/i],
  ["ex24", /Exynos 2[4-6]\d\d/i], ["ex14", /Exynos (1[2-5][38]0|9\d\d|2100|2200)/i],
  ["tg5", /Tensor G5/i], ["tg2", /Tensor/i],
];
const chipOf = (name, manuf) => {
  const s = `${manuf || ""} ${name || ""}`;
  if (/Apple|Bionic|\bM[1-4]\b|Ryzen|Tegra|APU|Intel|Durango/i.test(s)) return null;
  for (const [id, re] of RULES){
    if (id.startsWith("sd") && !/Snapdragon|Qualcomm|Dragonwing|SM\d|^\s*\d/i.test(s)) continue;
    if (re.test(s)) return id;
  }
  return null;
};

const socs = [], socIdx = new Map(), emus = [], emuIdx = new Map(), unmatched = new Map();
const idx = (arr, map, key, mk) => { if (!map.has(key)){ map.set(key, arr.length); arr.push(mk()); } return map.get(key); };
const games = new Map();
let total = 0;
// Detalles (FPS y configuración) de details.mjs; las configuraciones van aparte y se cargan al abrir un juego
const DFILE = path.join(DIR, "details.json");
const details = fs.existsSync(DFILE) ? JSON.parse(fs.readFileSync(DFILE, "utf8")) : {};
const fields = [], fieldIdx = new Map(), vals = [], valIdx = new Map(), cfgs = [], cfgIdx = new Map();
let withDetails = 0;
// Dispositivos (marca + modelo) y portadas
const devs = [], devIdx = new Map();
const CVFILE = path.join(DIR, "covers.json");
const covers = fs.existsSync(CVFILE) ? JSON.parse(fs.readFileSync(CVFILE, "utf8")) : {};
// URL compacta: T: = thegamesdb (boxart), I: = igdb; las portadas marcadas como eróticas se omiten
const shortImg = c => {
  if (!c || !c.img || c.nsfw) return undefined;
  const u = c.img;
  if (u.startsWith("https://cdn.thegamesdb.net/images/original/")) return "T:" + u.slice(43);
  const m = u.match(/^https:\/\/images\.igdb\.com\/igdb\/image\/upload\/[^/]+\/(.+)$/);
  if (m) return "I:" + m[1];
  if (u.startsWith("https://media.rawg.io/media/") && !u.includes("/resize/")) return "R:" + u.slice(28);
  return u.startsWith("https://") ? u : undefined;
};
const cfgOf = d => {
  if (!d || !d.cfg || !Object.keys(d.cfg).length) return -1;
  const flat = [];
  for (const [k, v] of Object.entries(d.cfg)) flat.push(idx(fields, fieldIdx, k, () => k), idx(vals, valIdx, v, () => v));
  const key = flat.join(",");
  return idx(cfgs, cfgIdx, key, () => flat);
};
for (const l of listings){
  if (!l.g || !l.p) continue;
  const s = sysName[l.sys] || "?";
  if (s === "iOS") continue;
  const si = l.soc ? idx(socs, socIdx, l.soc, () => ({n: l.soc, c: chipOf(l.soc, l.socM)})) : -1;
  if (si >= 0 && !socs[si].c) unmatched.set(l.soc, (unmatched.get(l.soc) || 0) + 1);
  const ei = idx(emus, emuIdx, l.emu || "?", () => l.emu || "?");
  if (!games.has(l.g)) games.set(l.g, {id: l.g, t: l.gt, s, img: shortImg(covers[l.g]), r: []});
  const di = l.dev ? idx(devs, devIdx, l.dev, () => ({n: l.dev.replace(/\s+/g, " ").trim(), s: si})) : -1;
  // fila: [soc, emulador, nota, dispositivo, fps (-1 si no consta), configuración (-1 si no hay)]
  const d = details[l.id];
  if (d) withDetails++;
  const row = [si, ei, l.p, di, d && d.fps != null ? d.fps : -1, cfgOf(d)];
  while (row.length > 4 && row[row.length - 1] === -1) row.pop();
  games.get(l.g).r.push(row);
  total++;
}
const out = {updated: new Date().toISOString().slice(0, 10), total, withDetails, socs, emus, devs, games: [...games.values()]};
const writeAtomic = (file, data) => { fs.writeFileSync(file + ".tmp", JSON.stringify(data)); fs.renameSync(file + ".tmp", file); };
writeAtomic(OUT, out);
writeAtomic(path.join(path.dirname(OUT), "configs.json"), {fields, vals, cfgs});
// index.html para GitHub Pages: la misma página con su propia cabecera HTML
const SRC = path.join(HERE, "..", "where-it-runs-best.html");
if (fs.existsSync(SRC)){
  const head = `<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<meta name="description" content="Where It Runs Best: qué emulador va mejor en tu Android según los reportes de la comunidad de EmuReady.">
<meta property="og:title" content="Where It Runs Best">
<meta property="og:description" content="Which emulator runs your game best on Android, from EmuReady community reports.">
<meta name="application-name" content="Where It Runs Best">\n<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>\n</head>\n<body>\n`;
  fs.writeFileSync(path.join(HERE, "..", "index.html"), head + fs.readFileSync(SRC, "utf8") + "\n</body>\n</html>\n");
}
console.log("reportes", total, "con detalle", withDetails, "configs", cfgs.length, "juegos", out.games.length, "socs", socs.length, "KB", Math.round(fs.statSync(OUT).size / 1024));
console.log("SoC sin clasificar (top):", [...unmatched].sort((a,b) => b[1]-a[1]).slice(0, 15).map(([n,c]) => n + "(" + c + ")").join(", "));
