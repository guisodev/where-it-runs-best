// Descarga reportes aprobados de EmuReady (API pública tRPC), despacio y respetando sus límites.
// uso:
//   node fetch.mjs            incremental: baja solo los reportes nuevos (rápido, pocas peticiones)
//   node fetch.mjs --full     completo: vuelve a bajar todo (recoge ediciones y borrados; ~380 peticiones)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(HERE, "data");
const FULL = process.argv.includes("--full");
const BASE = "https://www.emuready.com/api/mobile/trpc/";
const UA = "where-it-runs-best (non-commercial compatibility viewer)";
const PAUSE = 2500;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function call(proc, input){
  const url = BASE + proc + (input ? "?input=" + encodeURIComponent(JSON.stringify({json: input})) : "");
  for (let i = 0; i < 10; i++){
    try {
      const r = await fetch(url, {headers: {"User-Agent": UA}});
      if (r.ok) return (await r.json()).result.data.json;
      const wait = Math.max((Number(r.headers.get("retry-after")) || 0) * 1000, 30000 * (i + 1));
      console.error(proc, r.status, "esperando", wait / 1000, "s"); await sleep(wait);
    } catch(e){ console.error(proc, e.message); await sleep(15000 * (i + 1)); }
  }
  throw new Error("Falló " + proc + " tras varios intentos");
}
const slim = l => ({
  id: l.id, g: l.game?.id, gt: l.game?.title, sys: l.game?.systemId,
  dev: [l.device?.brand?.name, l.device?.modelName].filter(Boolean).join(" "),
  soc: l.device?.soc?.name || null, socM: l.device?.soc?.manufacturer || null, gpu: l.device?.soc?.gpuModel || null,
  emu: l.emulator?.name, p: l.performance?.rank, date: l.createdAt,
  up: l.upvoteCount || 0, down: l.downvoteCount || 0,
});
const writeAtomic = (file, data) => { fs.writeFileSync(file + ".tmp", JSON.stringify(data)); fs.renameSync(file + ".tmp", file); };

fs.mkdirSync(DIR, {recursive: true});
writeAtomic(path.join(DIR, "systems.json"), await call("general.systems"));
const LFILE = path.join(DIR, "listings.json");
const old = fs.existsSync(LFILE) ? JSON.parse(fs.readFileSync(LFILE, "utf8")) : [];
const incremental = !FULL && old.length > 0;
const seen = new Map(incremental ? old.map(l => [l.id, l]) : []);
const before = seen.size;

let page = 1, pages = 1, knownPages = 0;
while (page <= pages){
  const d = await call("listings.get", {page, limit: 50});
  pages = d.pagination.pages;
  let fresh = 0;
  for (const l of d.listings){ if (!seen.has(l.id)) fresh++; seen.set(l.id, slim(l)); }
  if (page % 25 === 0) console.log(`página ${page}/${pages}, ${seen.size} reportes`);
  // En modo incremental la API devuelve primero lo más reciente: paramos tras 2 páginas sin nada nuevo
  if (incremental){ knownPages = fresh ? 0 : knownPages + 1; if (knownPages >= 2) break; }
  page++;
  await sleep(PAUSE);
}
writeAtomic(LFILE, [...seen.values()]);
console.log(`${incremental ? "incremental" : "completo"}: ${seen.size} reportes (${seen.size - before >= 0 ? "+" : ""}${seen.size - before}), ${page} páginas leídas`);
