# Kuai Temperature

Web: https://sebacanti.github.io/Kuai-Temperature/

Descarga automática de reportes PDF de termógrafos Frigga (https://cloud.friggatech.com). Se abre el link, se pegan los códigos y se descarga un ZIP con los PDF. No hace falta terminal ni instalar nada.

## Cómo funciona

- **Página** (`index.html`, `js/`, `css/`): HTML/JS sin build, publicada en GitHub Pages por `.github/workflows/pages.yml`. Tema CRT cian "cold-chain", hermano del verde de Kuai Arrivals.
- **Automatización** (`.github/workflows/download.yml` + `scripts/`): la página inicia este workflow con los códigos. Cada código corre en su propio job (hasta 5 a la vez) con Puppeteer y el Chrome que ya viene en los runners de GitHub: entra a Frigga, busca el Device ID, Export Data → Complete data → OK y baja el PDF. Los códigos que Frigga rechaza ("The device ID is not correct") se marcan como inválidos sin reintentar; el resto tiene 4 intentos.
- **ZIP**: al final, el job `zip` junta todos los PDF en un artifact `kuai-temperature-pdfs` (se borra solo después de 1 día). La página abre su link de descarga en github.com, así que hay que tener la sesión de GitHub abierta en ese navegador.
- **Progreso**: la página lee el estado de cada job por la API de GitHub cada 4 segundos. Si se cierra la página, al volver sigue mostrando la última descarga.

## Puesta en marcha (una vez)

1. Repo → Settings → Pages → Source: **GitHub Actions**.
2. En la página, ⚙ → crea una clave (fine-grained token) con acceso solo a este repositorio y permiso **Actions: Read and write**, y pégala. Queda guardada solo en ese navegador.

## Desarrollo

```
npm install
npm test                                   # pruebas de la lógica de la página
CHROME_PATH="/ruta/a/chrome" node scripts/download.js VB8DN022 downloads   # un código, local
python3 -m http.server 8000                # abrir http://localhost:8000
```

También se puede lanzar una descarga sin la página: Actions → *Frigga download* → Run workflow.
