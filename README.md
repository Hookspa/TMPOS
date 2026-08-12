# ArtistOS — MVP

Sistema operativo para lanzamientos musicales (prototipo de un solo archivo).
Demo: https://hookspa.github.io/TMPOS/

## Despliegue protegido

`.github/workflows/deploy-pages.yml` ejecuta las pruebas funcionales y visuales,
valida el catálogo, construye un único artefacto versionado y lo publica en GitHub
Pages. Después comprueba por HTTP que `app.html`,
`css/app.css` y `refs_02.csv` coincidan con sus huellas, y abre ArtistOS con Chromium
para confirmar que el Banco llegue a `ready`.

Si una publicación falla, el workflow consulta el historial de ejecuciones exitosas en
`main`, selecciona el commit inmutable más reciente que ya superó ambos canaries, lo
reconstruye y permite una sola recuperación. La variable `AUTO_RECOVERY_ENABLED=false` funciona como
kill switch. Cada fallo deja un resumen en GitHub Actions y un artefacto sanitizado
llamado `deployment-incident`; esa vista es la consola técnica de incidentes de
despliegue, separada del `audit_log` de usuarios.

La automatización nace apagada: solo publica cuando la variable del repositorio
`DEPLOY_ENABLED` vale `true`. Antes de cada publicación ejecuta un preflight contra la
versión que está viva y conserva su commit exacto como recuperación de arranque. Para
activarla por primera vez: dejar que GitHub Pages termine de publicar `main`, definir
`DEPLOY_ENABLED=true`, cambiar la fuente de Pages a **GitHub Actions** y ejecutar el
workflow manualmente desde `main`. Si el preflight no demuestra una versión sana, el
deploy no comienza.

Los pull requests y las ejecuciones manuales desde cualquier rama distinta de `main`
solo validan y construyen: nunca publican. Para ejecutar localmente la misma puerta
preventiva completa: `npm test`.
