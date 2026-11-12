// Agrega los reportes de EmuReady en datos compactos para la app y genera las páginas por juego.
// uso: node build.mjs
// Salida (en la raíz del proyecto):
//   emuready.json   reportes por juego, dispositivos, estadísticas
//   configs.json    configuraciones (se cargan al abrir un juego)
//   index.html      la app para GitHub Pages
//   games/<slug>/   una página estática por juego (para buscadores y enlaces)
//   sitemap.xml, robots.txt
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const DIR = path.join(HERE, "data");
const OUT = path.join(ROOT, "emuready.json");
const SITE = "https://guisodev.github.io/where-it-runs-best/";
const listings = JSON.parse(fs.readFileSync(DIR + "/listings.json", "utf8"));
const systems = JSON.parse(fs.readFileSync(DIR + "/systems.json", "utf8"));
const readJson = f => fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : {};

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
// Gama (1–5) de cada grupo de chips; debe coincidir con CHIPS en la página
const TIER = {sd8e:5, sd8g3:5, sd8g2:5, sd8g1:4, sd888:4, sd865:3, sd7g:3, sd7xx:2, sd6xx:1,
  d9k:5, d8k:4, d1k:3, g99:2, g85:1, ex24:4, ex14:2, tg5:4, tg2:3};
const chipOf = (name, manuf) => {
  const s = `${manuf || ""} ${name || ""}`;
  if (/Apple|Bionic|\bM[1-4]\b|Ryzen|Tegra|APU|Intel|Durango/i.test(s)) return null;
  for (const [id, re] of RULES){
    if (id.startsWith("sd") && !/Snapdragon|Qualcomm|Dragonwing|SM\d|^\s*\d/i.test(s)) continue;
    if (re.test(s)) return id;
  }
  return null;
};

const idx = (arr, map, key, mk) => { if (!map.has(key)){ map.set(key, arr.length); arr.push(mk()); } return map.get(key); };
const socs = [], socIdx = new Map(), emus = [], emuIdx = new Map(), devs = [], devIdx = new Map(), unmatched = new Map();
const details = readJson(path.join(DIR, "details.json"));
const covers = readJson(path.join(DIR, "covers.json"));
const fields = [], fieldIdx = new Map(), vals = [], valIdx = new Map(), cfgs = [], cfgIdx = new Map();

// URL compacta: T: = thegamesdb (boxart), I: = igdb, R: = rawg; las portadas marcadas como eróticas se omiten
const shortImg = c => {
  if (!c || !c.img || c.nsfw) return undefined;
  const u = c.img;
  if (u.startsWith("https://cdn.thegamesdb.net/images/original/")) return "T:" + u.slice(43);
  const m = u.match(/^https:\/\/images\.igdb\.com\/igdb\/image\/upload\/[^/]+\/(.+)$/);
  if (m) return "I:" + m[1];
  if (u.startsWith("https://media.rawg.io/media/") && !u.includes("/resize/")) return "R:" + u.slice(28);
  return u.startsWith("https://") ? u : undefined;
};
const fullImg = (c, big) => !c ? null
  : c.startsWith("T:") ? "https://cdn.thegamesdb.net/images/" + (big ? "medium" : "thumb") + "/" + c.slice(2)
  : c.startsWith("I:") ? "https://images.igdb.com/igdb/image/upload/" + (big ? "t_cover_big" : "t_cover_small") + "/" + c.slice(2)
  : c.startsWith("R:") ? "https://media.rawg.io/media/resize/" + (big ? "640" : "200") + "/-/" + c.slice(2)
  : c;
const cfgOf = d => {
  if (!d || !d.cfg || !Object.keys(d.cfg).length) return -1;
  const flat = [];
  for (const [k, v] of Object.entries(d.cfg)) flat.push(idx(fields, fieldIdx, k, () => k), idx(vals, valIdx, v, () => v));
  return idx(cfgs, cfgIdx, flat.join(","), () => flat);
};
// Peso por votos de la comunidad: cada voto neto suma o resta medio punto (entre 0,25 y 3)
const voteWeight = l => Math.round(Math.min(3, Math.max(0.25, 1 + 0.5 * ((l.up || 0) - (l.down || 0)))) * 100) / 100;
function wmedian(items){   // items: [{p, w}]
  const a = items.filter(x => x.w > 0).sort((x, y) => x.p - y.p);
  const tot = a.reduce((s, x) => s + x.w, 0);
  if (!tot) return null;
  let acc = 0;
  for (const x of a){ acc += x.w; if (acc >= tot / 2) return x.p; }
  return a[a.length - 1].p;
}

// ── Agrupar reportes por juego ──
const games = new Map();
let total = 0, withDetails = 0;
for (const l of listings){
  if (!l.g || !l.p) continue;
  const s = sysName[l.sys] || "?";
  if (s === "iOS") continue;
  const si = l.soc ? idx(socs, socIdx, l.soc, () => ({n: l.soc, c: chipOf(l.soc, l.socM)})) : -1;
  if (si >= 0 && !socs[si].c) unmatched.set(l.soc, (unmatched.get(l.soc) || 0) + 1);
  const ei = idx(emus, emuIdx, l.emu || "?", () => l.emu || "?");
  const di = l.dev ? idx(devs, devIdx, l.dev, () => ({n: l.dev.replace(/\s+/g, " ").trim(), s: si})) : -1;
  if (!games.has(l.g)) games.set(l.g, {id: l.g, t: l.gt, s, img: shortImg(covers[l.g]), items: []});
  const d = details[l.id];
  if (d) withDetails++;
  const chip = si >= 0 ? socs[si].c : null;
  games.get(l.g).items.push({l, si, ei, di, p: l.p, w: voteWeight(l), tier: chip ? TIER[chip] : null,
    fps: d && d.fps != null ? d.fps : -1, cfg: cfgOf(d)});
  total++;
}

// ── Reportes raros: no cuentan para la mediana ──
// v = la comunidad lo vota en contra; b = mucho mejor que en chips más potentes; w = mucho peor que en chips iguales o más débiles
let flagged = 0;
const flagCount = {v: 0, b: 0, w: 0};
for (const g of games.values()){
  for (const it of g.items){
    let code = null;
    if ((it.l.down || 0) >= (it.l.up || 0) + 2) code = "v";
    // Solo se compara con el mismo emulador, y solo se marca si casi nadie más (<15 %) coincide con el reporte
    else if (it.tier && it.p <= 2){
      const stronger = g.items.filter(o => o !== it && o.ei === it.ei && o.tier && o.tier > it.tier);
      const agree = stronger.filter(o => o.p <= it.p + 1).length;
      if (stronger.length >= 3 && wmedian(stronger) >= it.p + 2 && agree / stronger.length < 0.15) code = "b";
    }
    if (!code && it.tier && it.p >= 5){
      const weaker = g.items.filter(o => o !== it && o.ei === it.ei && o.tier && o.tier <= it.tier);
      const agree = weaker.filter(o => o.p >= it.p - 1).length;
      if (weaker.length >= 4 && wmedian(weaker) <= it.p - 3 && agree / weaker.length < 0.15) code = "w";
    }
    if (code){ it.flag = code; it.w = 0; flagged++; flagCount[code]++; }
  }
}

// ── Filas compactas ──
// fila: [soc, emulador, nota, dispositivo, fps (-1 = no consta), configuración (-1 = no hay), peso (si no es 1)]
const gamesOut = [];
for (const g of games.values()){
  const r = [], x = [];
  g.items.forEach((it, i) => {
    const row = [it.si, it.ei, it.p, it.di, it.fps, it.cfg];
    if (it.w !== 1) row.push(it.w);
    else while (row.length > 4 && row[row.length - 1] === -1) row.pop();
    r.push(row);
    if (it.flag) x.push([i, it.flag, it.l.id]);
  });
  const o = {id: g.id, t: g.t, s: g.s, r};
  if (g.img) o.img = g.img;
  if (x.length) o.x = x;
  gamesOut.push(o);
}

// ── Páginas por juego: slug único y estable ──
const slugify = s => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "game";
const usedSlugs = new Set();
for (const g of gamesOut.slice().sort((a, b) => b.r.length - a.r.length || a.id.localeCompare(b.id))){
  let slug = slugify(g.t + " " + g.s);
  if (usedSlugs.has(slug)) slug += "-" + g.id.slice(0, 6);
  usedSlugs.add(slug);
  g.u = slug;
}

// ── Estadísticas ──
const RANK_EN = ["Perfect", "Great", "Playable", "Poor", "In-game", "Intro only", "Loads only", "Nothing"];
const countBy = (arr, key) => { const m = new Map(); for (const a of arr){ const k = key(a); if (k == null) continue; if (!m.has(k)) m.set(k, []); m.get(k).push(a); } return m; };
const allItems = [...games.values()].flatMap(g => g.items.map(it => ({...it, s: g.s})));
const topList = (m, n, nameOf) => [...m].map(([k, its]) => [nameOf(k), its.length, wmedian(its) ?? 8]).sort((a, b) => b[1] - a[1]).slice(0, n);
const months = [...countBy(allItems, it => (it.l.date || "").slice(0, 7) || null)].map(([k, its]) => [k, its.length]).sort((a, b) => a[0].localeCompare(b[0])).slice(-18);
const ranks = Array(9).fill(0); allItems.forEach(it => ranks[it.p]++);
const stats = {
  months,
  ranks: ranks.slice(1),
  emus: topList(countBy(allItems, it => it.ei), 12, i => emus[i]),
  sys: topList(countBy(allItems, it => it.s), 20, s => s),
  devs: topList(countBy(allItems, it => it.di >= 0 ? it.di : null), 12, i => devs[i].n),
  chips: topList(countBy(allItems, it => it.si >= 0 && socs[it.si].c ? socs[it.si].c : null), 18, c => c),
  flagged, flagCount,
  voted: listings.filter(l => (l.up || 0) + (l.down || 0) > 0).length,
  devices: devs.length,
};

const out = {updated: new Date().toISOString().slice(0, 10), total, withDetails, socs, emus, devs, stats, games: gamesOut};
const writeAtomic = (file, data) => { fs.writeFileSync(file + ".tmp", typeof data === "string" ? data : JSON.stringify(data)); fs.renameSync(file + ".tmp", file); };
writeAtomic(OUT, out);
writeAtomic(path.join(ROOT, "configs.json"), {fields, vals, cfgs});

// ── index.html para GitHub Pages ──
const SRC = path.join(ROOT, "where-it-runs-best.html");
if (fs.existsSync(SRC)){
  const head = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="Where It Runs Best: qué emulador va mejor en tu Android según los reportes de la comunidad de EmuReady.">
<meta property="og:title" content="Where It Runs Best">
<meta property="og:description" content="Which emulator runs your game best on Android, from EmuReady community reports.">
<meta name="application-name" content="Where It Runs Best">
<link rel="canonical" href="${SITE}">
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>
</head>
<body>
`;
  writeAtomic(path.join(ROOT, "index.html"), head + fs.readFileSync(SRC, "utf8") + "\n</body>\n</html>\n");
}

// ── Páginas estáticas por juego (en inglés, para buscadores) ──
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const RANK_K = [null, "ok", "good", "warn", "bad", "no", "no", "no", "no"];
const pill = p => `<span class="pill v-${RANK_K[p]}">${RANK_EN[p - 1]}</span>`;
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
function gamePage(g){
  const items = games.get(g.id).items;
  const byEmu = [...countBy(items, it => it.ei)].map(([e, its]) => {
    const fps = its.map(it => it.fps).filter(f => f >= 0);
    return {name: emus[e], n: its.length, med: wmedian(its) ?? wmedian(its.map(it => ({...it, w: 1}))), fps: median(fps)};
  }).sort((a, b) => a.med - b.med || b.n - a.n);
  const byDev = [...countBy(items, it => it.di >= 0 ? it.di : null)].map(([d, its]) => ({name: devs[d].n, chip: devs[d].s >= 0 ? socs[devs[d].s].n : "", n: its.length, med: wmedian(its) ?? wmedian(its.map(it => ({...it, w: 1})))}))
    .sort((a, b) => b.n - a.n || a.med - b.med).slice(0, 12);
  const best = byEmu[0];
  const flaggedHere = items.filter(it => it.flag).length;
  const title = `${g.t} (${g.s}) on Android: best emulator and performance`;
  const desc = `${items.length} community reports from EmuReady. Best rated: ${best.name} (${RANK_EN[best.med - 1]}${best.fps !== null ? `, ~${Math.round(best.fps)} FPS` : ""}). Most tested on ${byDev.slice(0, 3).map(d => d.name).join(", ")}.`;
  const url = SITE + "games/" + g.u + "/";
  const img = fullImg(g.img, true);
  const ld = {"@context": "https://schema.org", "@type": "VideoGame", name: g.t, gamePlatform: g.s, url, ...(img ? {image: img} : {})};
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)} | Where It Runs Best</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Where It Runs Best">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
${img ? `<meta property="og:image" content="${esc(img)}">\n<meta name="twitter:card" content="summary">` : ""}
<link rel="stylesheet" href="../../assets/game.css">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>
</head>
<body>
<div class="aurora" aria-hidden="true"><i></i><i></i><i></i></div>
<header><a class="brand" href="../../">Where It Runs <b>Best</b></a></header>
<main>
  <section class="hero glass">
    ${img ? `<img class="cover" src="${esc(img)}" alt="" width="120" height="160">` : ""}
    <div>
      <p class="meta">${esc(g.s)} · ${items.length} reports on EmuReady</p>
      <h1>${esc(g.t)}</h1>
      <p class="best">Best emulator on Android: <strong>${esc(best.name)}</strong> ${pill(best.med)}${best.fps !== null ? ` <span class="fps">~${Math.round(best.fps)} FPS</span>` : ""}</p>
      <p class="actions"><a class="btn primary" href="../../#g-${g.id.slice(0, 8)}">Check it for your device</a>
        <a class="btn" href="https://www.emuready.com/games/${esc(g.id)}" rel="noopener">All reports on EmuReady</a>
        <a class="btn" href="https://www.emuready.com/listings/new?gameId=${esc(g.id)}" rel="noopener">Add your report</a></p>
    </div>
  </section>
  <section class="glass">
    <h2>Emulators</h2>
    <div class="tbl"><table><thead><tr><th>Emulator</th><th class="num">Reports</th><th class="num">Median FPS</th><th>Median rating</th></tr></thead>
    <tbody>${byEmu.map(e => `<tr><td>${esc(e.name)}</td><td class="num">${e.n}</td><td class="num">${e.fps !== null ? Math.round(e.fps) : "–"}</td><td>${pill(e.med)}</td></tr>`).join("")}</tbody></table></div>
  </section>
  <section class="glass">
    <h2>Most tested devices</h2>
    <div class="tbl"><table><thead><tr><th>Device</th><th>Chip</th><th class="num">Reports</th><th>Median rating</th></tr></thead>
    <tbody>${byDev.map(d => `<tr><td>${esc(d.name)}</td><td class="muted">${esc(d.chip)}</td><td class="num">${d.n}</td><td>${pill(d.med)}</td></tr>`).join("")}</tbody></table></div>
    ${flaggedHere ? `<p class="note">${flaggedHere} unusual report${flaggedHere > 1 ? "s" : ""} (downvoted or contradicting the rest) ${flaggedHere > 1 ? "are" : "is"} left out of the medians.</p>` : ""}
  </section>
</main>
<footer><p>Data from the <a href="https://www.emuready.com" rel="noopener">EmuReady</a> community, used non-commercially. Ratings are vote-weighted medians. <a href="../../">Open the full app</a> to pick your chip or device and see recommended settings.</p></footer>
</body>
</html>
`;
}
const GDIR = path.join(ROOT, "games");
fs.mkdirSync(GDIR, {recursive: true});
let written = 0;
const keep = new Set();
for (const g of gamesOut){
  keep.add(g.u);
  const dir = path.join(GDIR, g.u), file = path.join(dir, "index.html");
  const html = gamePage(g);
  if (fs.existsSync(file) && fs.readFileSync(file, "utf8") === html) continue;   // sin cambios: no tocar (menos ruido en git)
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(file, html);
  written++;
}
let removed = 0;
for (const d of fs.readdirSync(GDIR)) if (!keep.has(d)){ fs.rmSync(path.join(GDIR, d), {recursive: true, force: true}); removed++; }

// ── sitemap.xml y robots.txt ──
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>${SITE}</loc></url>
${gamesOut.map(g => `<url><loc>${SITE}games/${g.u}/</loc></url>`).join("\n")}
</urlset>
`;
writeAtomic(path.join(ROOT, "sitemap.xml"), sitemap);
writeAtomic(path.join(ROOT, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${SITE}sitemap.xml\n`);

console.log("reportes", total, "con detalle", withDetails, "raros", flagged, JSON.stringify(flagCount), "juegos", gamesOut.length,
  "KB", Math.round(fs.statSync(OUT).size / 1024), "páginas escritas", written, "borradas", removed);
console.log("SoC sin clasificar (top):", [...unmatched].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([n, c]) => n + "(" + c + ")").join(", "));
