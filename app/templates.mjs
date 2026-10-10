import {textBytes} from './core.mjs';
const article=String.raw`% AulaTeX UCM — Documento de ejemplo
% Compiladores: pdfLaTeX, XeLaTeX o LuaLaTeX.
\documentclass[12pt,a4paper]{article}
\usepackage[spanish,es-noquoting]{babel}
\usepackage{iftex}
\ifPDFTeX
  \usepackage[T1]{fontenc}
  \usepackage[utf8]{inputenc}
\else
  \usepackage{fontspec}
  \setmainfont{lmroman10-regular.otf}[BoldFont=lmroman10-bold.otf,ItalicFont=lmroman10-italic.otf,BoldItalicFont=lmroman10-bolditalic.otf]
\fi
\usepackage[margin=2.7cm]{geometry}
\usepackage{graphicx,amsmath,booktabs,xcolor}
\definecolor{complutense}{HTML}{B71234}
\usepackage[colorlinks=true,linkcolor=complutense,urlcolor=complutense]{hyperref}
\title{Mi primer documento en AulaTeX}
\author{Nombre y apellidos\\Universidad Complutense de Madrid}
\date{\today}
\begin{document}
\maketitle
\begin{center}
\IfFileExists{ucm-logo.png}{\includegraphics[width=3cm]{ucm-logo.png}}{\IfFileExists{ucm-logo.jpg}{\includegraphics[width=3cm]{ucm-logo.jpg}}{}}
\end{center}
\begin{abstract}
Un espacio para escribir, guardar versiones en GitHub y compilar
con una distribución completa de TeX Live.
\end{abstract}
\section{Empieza por aquí}
Edita este texto. Pulsa \textbf{Guardar en GitHub} y después
\textbf{Compilar}. El resultado aparecerá en el panel derecho.
\input{introduccion.tex}
\section{Una ecuación}
\begin{equation}
  \int_0^1 x^2\,dx = \frac{1}{3}.
\end{equation}
\section{Una tabla}
\begin{center}
\begin{tabular}{ll}
\toprule
Parte & Función\\
\midrule
GitHub Pages & Editor web\\
GitHub & Archivos e historial\\
GitHub Actions & Compilación LaTeX\\
\bottomrule
\end{tabular}
\end{center}
\section{Tu siguiente paso}
Sustituye el título y la autoría, añade tus secciones y exporta un ZIP
para conservar una copia independiente. Esta plantilla es orientativa:
no sustituye las normas de tu facultad o revista.
\end{document}
`;
const intro=String.raw`\subsection{Tu proyecto, tus archivos}
Los cambios se guardan en tu propio repositorio. Si el repositorio es
privado, el código fuente y los resultados permanecen privados.
\subsection{Tildes y símbolos}
Puedes escribir en español: investigación, programación, lingüística.
La sintaxis matemática usa delimitadores: $a^2+b^2=c^2$.
`;
const bib=String.raw`@book{knuth1984,
  author = {Donald E. Knuth},
  title = {The TeXbook},
  year = {1984},
  publisher = {Addison-Wesley}
}
`;
const bibArticle=article.replace('\\title{Mi primer documento en AulaTeX}',String.raw`\usepackage[backend=biber,style=authoryear]{biblatex}
\addbibresource{referencias.bib}
\title{Artículo con bibliografía}`).replace('\\end{document}',String.raw`\section{Citas bibliográficas}
Un ejemplo de cita: \textcite{knuth1984}.
\printbibliography
\end{document}`);
const thesis=article.replace('{article}','{report}').replace('\\title{Mi primer documento en AulaTeX}','\\title{Título de mi TFG o TFM}').replace('\\section{','\\chapter{').replace('\\maketitle','\\maketitle\n\\tableofcontents\n\\clearpage');
const slides=String.raw`\documentclass[aspectratio=169,12pt]{beamer}
\usepackage[spanish,es-noquoting]{babel}
\usepackage{iftex}
\ifPDFTeX\usepackage[T1]{fontenc}\else\usepackage{fontspec}\fi
\usetheme{Madrid}
\definecolor{complutense}{HTML}{B71234}
\setbeamercolor{structure}{fg=complutense}
\setbeamertemplate{navigation symbols}{}
\title{Título de la presentación}
\author{Nombre y apellidos}
\institute{Universidad Complutense de Madrid}
\titlegraphic{\IfFileExists{ucm-logo.png}{\includegraphics[height=0.7cm]{ucm-logo.png}}{}}
\date{\today}
\begin{document}
\begin{frame}\titlepage\end{frame}
\begin{frame}{Nuestra pregunta}
Escribe aquí la idea principal. Una idea por diapositiva.
\end{frame}
\begin{frame}{Un resultado}
\[ E = mc^2 \]
Añade el contexto necesario para interpretar el resultado.
\end{frame}
\end{document}
`;
export const TEMPLATES = [
 {id:'markdown',name:'Markdown · cuaderno académico',main:'documento.md',engine:'markdown',files:{'documento.md':"# Cuaderno de investigación\n\nUniversidad Complutense de Madrid · Notas de trabajo\n\n> Un documento breve para pensar, revisar y compartir. La vista se actualiza en tu navegador; no utiliza Actions.\n\n## Pregunta de investigación\n\n¿Qué queremos comprobar y con qué evidencia? Escribe aquí el objetivo, el contexto y las limitaciones del estudio.\n\n## Plan de trabajo\n\n- [x] Formular la pregunta.\n- [ ] Reunir las fuentes.\n- [ ] Revisar el método con el equipo.\n\n## Registro de evidencia\n\n| Elemento | Estado | Observación |\n| :--- | :--- | :--- |\n| Protocolo | Borrador | Revisar antes de comenzar |\n| Datos | Pendientes | Registrar su procedencia |\n| Análisis | Pendiente | Separar resultados e interpretación |\n\n## Notas de método\n\nPuedes usar **negrita**, *cursiva*, ~~tachado~~ y `código`.\n\n```python\ndef media(valores):\n    return sum(valores) / len(valores)\n```\n\n## Referencias y próximos pasos\n\nLos enlaces se abren solo al pulsar: [Universidad Complutense de Madrid](https://www.ucm.es/). Las referencias BibTeX siguen disponibles en el gestor; las citas Pandoc y las ecuaciones no se resuelven en esta vista.\n\nGuarda el archivo **.md**, exporta un **HTML autónomo** o imprime a PDF desde tu navegador. El tema cambia la interfaz, no tus fuentes.\n"}},
 {id:'articulo',name:'Artículo · empezar a escribir',files:{'main.tex':article,'introduccion.tex':intro}},
 {id:'bibliografia',name:'Artículo · BibLaTeX + Biber',files:{'main.tex':bibArticle,'introduccion.tex':intro,'referencias.bib':bib}},
 {id:'tfg',name:'Memoria · TFG / TFM orientativo',files:{'main.tex':thesis,'introduccion.tex':intro}},
 {id:'beamer',name:'Presentación · Beamer 16:9',files:{'main.tex':slides}}
];
export function templateFiles(id,title){const t=TEMPLATES.find(t=>t.id===id);if(!t)throw Error('Plantilla desconocida.');const f=new Map(Object.entries(t.files).map(([p,t])=>[p,{bytes:textBytes(t)}]));f.set('project.json',{bytes:textBytes(JSON.stringify({schema:1,title,main:t.main||'main.tex',engine:t.engine||'xelatex'},null,2)+'\n')});return f;}
