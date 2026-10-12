# Kuai Temperature

Descarga automática de reportes PDF de termógrafos Frigga.

## Requisitos

- **Node.js 18 o superior** (recomendado 20+)
- Computador (Windows, Mac o Linux)
- Conexión a internet

## Instalación (solo una vez)

Abre una terminal en la carpeta del proyecto y ejecuta:

```bash
npm install
```

Esto descargará las dependencias (incluyendo Chromium para la automatización). Puede tardar 1-3 minutos la primera vez.

## Uso

1. Inicia el servidor:

```bash
npm start
```

2. Abre en tu navegador:

```
http://localhost:3000
```

3. Pega uno o varios códigos de dispositivo (uno por línea).

4. Haz clic en **Descargar PDFs**.

5. Espera. La aplicación:
   - Entra a cloud.friggatech.com
   - Busca cada Device ID
   - Exporta "Complete data"
   - Descarga el PDF automáticamente

- Si es **1 código** → se descarga el PDF directamente.
- Si son **varios** → se descarga un archivo ZIP con todos los PDFs.

## Notas importantes

- Máximo 30 códigos por solicitud.
- Cada dispositivo tarda aproximadamente 20-60 segundos.
- No cierres la terminal mientras se está procesando.
- Para detener el servidor: `Ctrl + C` en la terminal.

## Solución de problemas

**Error al iniciar / Puppeteer**
```bash
# En algunos sistemas Linux puede hacer falta:
npx puppeteer browsers install chrome
```

**Timeout o falla un código**
- Verifica que el Device ID sea correcto.
- Intenta de nuevo (a veces Frigga tarda más).
- Revisa la terminal del servidor para ver el error exacto.

## Estructura

```
kuai-temperature/
├── backend/
│   ├── server.js      # Servidor Express
│   └── frigga.js      # Automatización con Puppeteer
├── public/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── package.json
└── README.md
```
