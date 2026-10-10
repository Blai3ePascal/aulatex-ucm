# AulaTeX UCM v5 · Editor público

**Fork creado por la Oficina de Software Libre y Tecnologías Abiertas**

Este repositorio contiene únicamente el editor estático, su guía, el logo general UCM y el capturador. Activa GitHub Pages con Source: GitHub Actions. El workflow `Publicar AulaTeX en Pages` valida la marca local y publica los archivos de interfaz, no documentos privados.

Abre `guia.html` para la instalación y el repositorio privado de documentos. `capturador.html` incluye instrucciones y ZIP de la extensión de carga local. Cada persona usa su propio token; no escribas tokens en este repositorio. Para compartir trabajos usa repositorios privados separados por grupo y los permisos de GitHub.

Esta derivación procede de AulaTeX, no del servidor Overleaf Community. No se ofrecen todas las funciones comerciales de Overleaf ni la cobertura completa de Zotero. Sincronización y chat son periódicos, no carácter a carácter. La entrega está probada localmente con APIs simuladas, no desplegada en una cuenta real por el simple hecho de publicar el ZIP.

Nuevo en v5: paneles rectos, seis temas y preferencias locales, Markdown con lectura/HTML, guardado forzado de contenido con confirmación y revisión de carreras. El Worker y sus dependencias deben publicarse dentro de app/ y vendor/. No uses un CDN para inyectar el parser.
