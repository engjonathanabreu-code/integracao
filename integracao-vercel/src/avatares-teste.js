export const colors=['#0F5F5B','#237D73','#147D92','#296FA3','#485DA0','#75629D','#A05276','#A15D36','#927021','#526477'];
export const colorNames=['Verde Integral','Jade','Petróleo','Azul aço','Índigo','Lavanda','Amora','Terracota','Ocre','Ardósia'];
export const names=['Companheiro','Aurora','Órbita','Neko','Guardião','Lunar','Explorer','Sorriso','Pixel','Cápsula','Duplo','Radar','Arco','Coruja','Retro','Astronauta','Horizonte','Antena','Estrela','Zen'];
const heads=[
 'M9 40V25C9 12 12 7 17 8q5 1 10 7h10q5-6 10-7c5-1 8 4 8 17v15q0 15-23 15T9 40Z',
 'M10 39V22q0-12 6-13l10 7h12l10-7q6 1 6 13v17q0 15-22 15T10 39Z',
 'M9 35q0-13 10-17l-2-9 10 6h10l10-6-2 9q10 4 10 17v7q-1 12-23 12T9 42Z',
 'M10 43V23L16 9l12 8h8l12-8 6 14v20q0 12-22 12T10 43Z',
 'M10 38V22l8-11 9 7h10l9-7 8 11v16q0 14-22 18T10 38Z',
 'M10 39q-2-12 5-19V10l12 8h10l12-8v10q7 7 5 19-1 16-22 16T10 39Z',
 'M9 39V25q0-8 7-9V8l13 9h6l13-9v8q7 1 7 9v14q0 15-23 15T9 39Z',
 'M10 38V25q0-13 7-13l10 6h10l10-6q7 0 7 13v13q0 17-22 17T10 38Z',
 'M11 43V24l7-10 9 5h10l9-5 7 10v19l-9 10H20Z',
 'M12 39V24q0-12 6-13l9 6h10l9-6q6 1 6 13v15q0 16-20 16T12 39Z',
 'M8 39V27q0-12 9-14l10 5h10l10-5q9 2 9 14v12q0 15-24 15T8 39Z',
 'M10 40V26q0-9 7-12l-1-5 12 8h8l12-8-1 5q7 3 7 12v14q0 14-22 14T10 40Z',
 'M10 42V29q0-10 7-13V9l11 9h8l11-9v7q7 3 7 13v13q0 13-22 13T10 42Z',
 'M9 40V25q0-9 8-10V9l11 9h8l11-9v6q8 1 8 10v15q0 15-23 15T9 40Z',
 'M11 42V24l7-12 10 7h8l10-7 7 12v18q0 11-21 11T11 42Z',
 'M8 38q0-17 10-21V9l10 8h8l10-8v8q10 4 10 21 0 17-24 17T8 38Z',
 'M8 40V26q0-11 10-12l9 5h10l9-5q10 1 10 12v14q0 13-24 13T8 40Z',
 'M11 40V25q0-10 7-11l10 5h8l10-5q7 1 7 11v15q0 14-21 14T11 40Z',
 'M10 41V26l7-15 11 8h8l11-8 7 15v15q0 14-22 14T10 41Z',
 'M10 40V25q0-11 8-13l10 6h8l10-6q8 2 8 13v15q0 14-22 14T10 40Z'
];
const faces=['<rect x="15" y="23" width="34" height="25" rx="12"/>','<path d="M16 28q0-6 16-6t16 6v10q0 11-16 11T16 38Z"/>','<rect x="15" y="24" width="34" height="24" rx="9"/>','<ellipse cx="32" cy="36" rx="17" ry="13"/>'];
const eyes=['<ellipse cx="24" cy="34" rx="3.5" ry="5"/><ellipse cx="40" cy="34" rx="3.5" ry="5"/>','<path d="M21 35q3-6 6 0m10 0q3-6 6 0"/>','<rect x="21" y="29" width="6" height="9" rx="3"/><rect x="37" y="29" width="6" height="9" rx="3"/>','<circle cx="24" cy="34" r="4"/><circle cx="40" cy="34" r="4"/>','<path d="M21 31v6m6-6v6m10-6v6m6-6v6"/>'];
export function robot(index=0){const i=Math.max(0,Math.min(19,Math.floor(Number(index)||0)));const antenna=i===11||i===17?'<path d="M32 18V9"/><circle cx="32" cy="6" r="2.5"/>':'';const ears=i%3===0?'<path d="m15 18 1-4 5 4m22 0 5-4 1 4"/>':'';const smile=i%4===0?'<path d="M28 42q4 5 8 0"/>':i%4===1?'<path d="M29 43h6"/>':i%4===2?'<path d="M28 42q4 3 8 0"/>':'<path d="M29 42q3 4 6 0"/>';return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${heads[i]}"/>${faces[i%4]}${eyes[i%5]}${smile}${antenna}${ears}</svg>`;}
