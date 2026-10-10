# Marked
Vendored version: 4.0.19, MIT. Source: the Marked distribution included in nbclassic in the build environment. Its package.json identifies this version. Only the UMD shell was converted to ESM. This is NOT described as the latest release.

No network downloads at runtime. AulaTeX replaces raw HTML, link and image renderers, caps input and runs automatic preview in a terminable Web Worker. Markdown security is not delegated to Marked alone. Upstream: https://github.com/markedjs/marked; security guidance: https://marked.js.org/using_advanced . Review and update this pinned dependency before a public multi-user deployment.
