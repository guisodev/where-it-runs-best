# ¿Dónde corre?

Elige tu chip Android y un juego para ver qué emulador va mejor según los reportes de la comunidad de [EmuReady](https://www.emuready.com).

- `donde-corre.html`: la página (fuente).
- `index.html`: la misma página lista para GitHub Pages (se genera con `tools/build.mjs`).
- `emuready.json`: resumen compacto de los reportes que lee la página.
- `tools/fetch.mjs`: descarga reportes de la API pública de EmuReady hacia `tools/data/` (`--full` para descarga completa).
- `tools/covers.mjs`: descarga las portadas de los juegos hacia `tools/data/covers.json` (`--full` recorre todo el catálogo).
- `tools/details.mjs`: descarga el detalle de cada reporte (FPS promedio y configuración) hacia `tools/data/details.json`, como mucho 1500 por ejecución.
- `tools/build.mjs`: genera `emuready.json`, `configs.json` (configuraciones, se cargan al abrir un juego) e `index.html`.
- `.github/workflows/update.yml`: actualización diaria automática (completa el día 1 de cada mes; detalles en relleno gradual).

Actualizar a mano:

```bash
cd tools && node fetch.mjs && node covers.mjs && node details.mjs && node build.mjs
```

Los datos pertenecen a la comunidad de EmuReady y se usan sin fines comerciales; cada juego enlaza a su ficha original.
