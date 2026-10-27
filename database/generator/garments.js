const W = 600;
const H = 750;

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}
export function mix(hex, other, t) {
  const a = hexToRgb(hex);
  const b = hexToRgb(other);
  return rgbToHex(a.map((v, i) => v + (b[i] - v) * t));
}
function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const SHAPES = {
  camiseta: {
    body: 'M250,128 Q300,172 350,128 L428,148 L510,240 L452,290 L398,252 L403,640 Q300,652 197,640 L202,252 L148,290 L90,240 L172,148 Z',
    details: (c) => `
      <path d="M250,128 Q300,172 350,128" fill="none" stroke="${c.dark}" stroke-width="9" stroke-linecap="round"/>
      <path d="M150,288 L94,240" stroke="${c.dark}" stroke-width="4" opacity=".55"/>
      <path d="M450,288 L506,240" stroke="${c.dark}" stroke-width="4" opacity=".55"/>
      <path d="M200,628 Q300,640 400,628" fill="none" stroke="${c.dark}" stroke-width="3" opacity=".45" stroke-dasharray="6 6"/>
      <path d="M262,300 Q280,420 268,560" fill="none" stroke="${c.shade}" stroke-width="10" opacity=".18" stroke-linecap="round"/>
      <path d="M352,330 Q338,450 350,590" fill="none" stroke="${c.shade}" stroke-width="8" opacity=".14" stroke-linecap="round"/>`,
  },
  manga_larga: {
    body: 'M252,126 Q300,168 348,126 L424,146 Q470,180 486,250 L520,560 L468,574 L400,282 L404,642 Q300,654 196,642 L200,282 L132,574 L80,560 L114,250 Q130,180 176,146 Z',
    details: (c) => `
      <path d="M252,126 Q300,168 348,126" fill="none" stroke="${c.dark}" stroke-width="9" stroke-linecap="round"/>
      <path d="M84,548 L134,562" stroke="${c.dark}" stroke-width="12" opacity=".35"/>
      <path d="M516,548 L466,562" stroke="${c.dark}" stroke-width="12" opacity=".35"/>
      <path d="M262,310 Q282,440 266,580" fill="none" stroke="${c.shade}" stroke-width="10" opacity=".16" stroke-linecap="round"/>`,
  },
  camisa: {
    body: 'M246,124 L300,150 L354,124 L424,144 Q470,178 486,250 L522,566 L468,580 L400,286 L404,652 Q300,664 196,652 L200,286 L132,580 L78,566 L114,250 Q130,178 176,144 Z',
    details: (c) => `
      <path d="M246,124 L272,108 L328,108 L354,124 L330,196 L300,152 L270,196 Z" fill="${c.light}" stroke="${c.dark}" stroke-width="3" stroke-linejoin="round"/>
      <path d="M300,152 L300,650" stroke="${c.dark}" stroke-width="3" opacity=".6"/>
      <path d="M312,160 L312,650" stroke="${c.dark}" stroke-width="2" opacity=".3"/>
      ${[210, 280, 350, 420, 490, 560].map((y) => `<circle cx="306" cy="${y}" r="6" fill="${c.button}" stroke="${c.dark}" stroke-width="1.5"/>`).join('')}
      <path d="M86,552 L136,566" stroke="${c.dark}" stroke-width="14" opacity=".3"/>
      <path d="M514,552 L464,566" stroke="${c.dark}" stroke-width="14" opacity=".3"/>
      <path d="M216,220 L270,220 L270,262 L216,262 Z" fill="none" stroke="${c.dark}" stroke-width="2.5" opacity=".45"/>`,
  },
  pantalon: {
    body: 'M198,118 L402,118 L404,160 L428,660 L318,666 L300,300 L282,666 L172,660 L196,160 Z',
    details: (c) => `
      <path d="M198,118 L402,118 L404,160 L196,160 Z" fill="${c.dark}" opacity=".35"/>
      ${[220, 270, 330, 380].map((x) => `<rect x="${x - 4}" y="114" width="8" height="50" rx="2" fill="${c.dark}" opacity=".55"/>`).join('')}
      <path d="M300,160 L300,250 Q300,276 278,284" fill="none" stroke="${c.dark}" stroke-width="3" opacity=".6"/>
      <path d="M214,168 Q246,220 236,240" fill="none" stroke="${c.dark}" stroke-width="3" opacity=".5"/>
      <path d="M386,168 Q354,220 364,240" fill="none" stroke="${c.dark}" stroke-width="3" opacity=".5"/>
      <path d="M232,320 L222,640" stroke="${c.shade}" stroke-width="6" opacity=".2"/>
      <path d="M368,320 L378,640" stroke="${c.shade}" stroke-width="6" opacity=".2"/>`,
  },
  short: {
    body: 'M200,190 L400,190 L402,228 L426,488 L316,500 L300,350 L284,500 L174,488 L198,228 Z',
    details: (c) => `
      <path d="M200,190 L400,190 L402,228 L198,228 Z" fill="${c.dark}" opacity=".35"/>
      ${[224, 272, 328, 376].map((x) => `<rect x="${x - 4}" y="186" width="8" height="46" rx="2" fill="${c.dark}" opacity=".55"/>`).join('')}
      <path d="M300,228 L300,312 Q300,336 280,342" fill="none" stroke="${c.dark}" stroke-width="3" opacity=".6"/>
      <path d="M180,470 L286,480" stroke="${c.dark}" stroke-width="10" opacity=".25"/>
      <path d="M314,480 L420,470" stroke="${c.dark}" stroke-width="10" opacity=".25"/>
      <path d="M216,236 Q246,282 238,300" fill="none" stroke="${c.dark}" stroke-width="3" opacity=".5"/>
      <path d="M384,236 Q354,282 362,300" fill="none" stroke="${c.dark}" stroke-width="3" opacity=".5"/>`,
  },
  vestido: {
    body: 'M246,104 L266,104 L282,168 Q300,184 318,168 L334,104 L354,104 L366,206 Q374,262 356,306 L480,650 Q300,690 120,650 L244,306 Q226,262 234,206 Z',
    details: (c) => `
      <path d="M244,306 Q300,322 356,306" fill="none" stroke="${c.dark}" stroke-width="5" opacity=".55"/>
      <path d="M282,168 Q300,184 318,168" fill="none" stroke="${c.dark}" stroke-width="5" opacity=".6"/>
      <path d="M262,330 Q232,500 196,646" fill="none" stroke="${c.shade}" stroke-width="10" opacity=".14" stroke-linecap="round"/>
      <path d="M300,330 L300,668" stroke="${c.shade}" stroke-width="8" opacity=".12"/>
      <path d="M338,330 Q368,500 404,646" fill="none" stroke="${c.shade}" stroke-width="10" opacity=".14" stroke-linecap="round"/>`,
  },
  falda: {
    body: 'M218,168 L382,168 L384,206 L468,626 Q300,660 132,626 L216,206 Z',
    details: (c) => `
      <path d="M218,168 L382,168 L384,206 L216,206 Z" fill="${c.dark}" opacity=".35"/>
      <circle cx="368" cy="187" r="6" fill="${c.button}" stroke="${c.dark}" stroke-width="1.5"/>
      <path d="M258,214 Q230,420 196,640" fill="none" stroke="${c.shade}" stroke-width="8" opacity=".14" stroke-linecap="round"/>
      <path d="M342,214 Q370,420 404,640" fill="none" stroke="${c.shade}" stroke-width="8" opacity=".14" stroke-linecap="round"/>`,
  },
  chaqueta: {
    body: 'M240,118 L300,150 L360,118 L436,140 Q486,176 500,252 L530,572 L470,588 L410,296 L414,654 L186,654 L190,296 L130,588 L70,572 L100,252 Q114,176 164,140 Z',
    details: (c) => `
      <path d="M240,118 L300,150 L272,250 L236,200 Z" fill="${c.dark}" opacity=".45"/>
      <path d="M360,118 L300,150 L328,250 L364,200 Z" fill="${c.dark}" opacity=".45"/>
      <path d="M300,150 L300,654" stroke="${c.dark}" stroke-width="4" opacity=".7"/>
      ${[300, 380, 460, 540].map((y) => `<circle cx="314" cy="${y}" r="7" fill="${c.button}" stroke="${c.dark}" stroke-width="1.5"/>`).join('')}
      <rect x="208" y="470" width="66" height="14" rx="3" fill="${c.dark}" opacity=".45"/>
      <rect x="326" y="470" width="66" height="14" rx="3" fill="${c.dark}" opacity=".45"/>
      <path d="M78,556 L132,572" stroke="${c.dark}" stroke-width="14" opacity=".3"/>
      <path d="M522,556 L468,572" stroke="${c.dark}" stroke-width="14" opacity=".3"/>
      <path d="M188,640 L412,640" stroke="${c.dark}" stroke-width="14" opacity=".28"/>`,
  },
  sudadera: {
    body: 'M236,132 L300,168 L364,132 L438,152 Q488,188 500,262 L528,560 L470,576 L410,300 L414,620 Q420,644 400,650 L200,650 Q180,644 186,620 L190,300 L130,576 L72,560 L100,262 Q112,188 162,152 Z',
    details: (c) => `
      <path d="M226,140 Q228,72 300,64 Q372,72 374,140 Q340,118 300,170 Q260,118 226,140 Z" fill="${c.hood}" stroke="${c.dark}" stroke-width="2.5"/>
      <path d="M244,136 Q300,96 356,136" fill="none" stroke="${c.dark}" stroke-width="3" opacity=".45"/>
      <path d="M284,170 L280,268" stroke="${c.light}" stroke-width="4" stroke-linecap="round"/>
      <path d="M316,170 L320,268" stroke="${c.light}" stroke-width="4" stroke-linecap="round"/>
      <path d="M220,452 L380,452 L404,566 L196,566 Z" fill="none" stroke="${c.dark}" stroke-width="3" opacity=".5"/>
      <path d="M190,616 L410,616 L410,650 L190,650 Z" fill="${c.dark}" opacity=".3"/>
      ${Array.from({ length: 22 }, (_, i) => `<line x1="${196 + i * 10}" y1="618" x2="${196 + i * 10}" y2="648" stroke="${c.shade}" stroke-width="1.5" opacity=".25"/>`).join('')}
      <path d="M78,546 L130,562" stroke="${c.dark}" stroke-width="16" opacity=".32"/>
      <path d="M522,546 L470,562" stroke="${c.dark}" stroke-width="16" opacity=".32"/>`,
  },
};

function patternDefs(id, pattern, c) {
  switch (pattern) {
    case 'rayas':
      return `<pattern id="${id}" width="40" height="40" patternUnits="userSpaceOnUse"><rect width="40" height="40" fill="${c.base}"/><rect y="24" width="40" height="12" fill="${c.accent}"/></pattern>`;
    case 'floral':
      return `<pattern id="${id}" width="70" height="70" patternUnits="userSpaceOnUse"><rect width="70" height="70" fill="${c.base}"/>
        <g transform="translate(18 18)">${[0, 72, 144, 216, 288].map((a) => `<ellipse rx="4" ry="8" transform="rotate(${a}) translate(0 -7)" fill="${c.accent}"/>`).join('')}<circle r="3" fill="${c.light}"/></g>
        <g transform="translate(53 52) scale(.7)">${[0, 72, 144, 216, 288].map((a) => `<ellipse rx="4" ry="8" transform="rotate(${a}) translate(0 -7)" fill="${c.accent2}"/>`).join('')}<circle r="3" fill="${c.light}"/></g>
        <path d="M44 20 q6 6 0 12" stroke="${c.leaf}" stroke-width="2" fill="none"/></pattern>`;
    case 'denim':
      return `<pattern id="${id}" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="8" height="8" fill="${c.base}"/><line x1="0" y1="0" x2="0" y2="8" stroke="${c.light}" stroke-width="2" opacity=".35"/></pattern>`;
    case 'acanalado':
      return `<pattern id="${id}" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="${c.base}"/><rect width="5" height="12" fill="${c.dark}" opacity=".18"/></pattern>`;
    case 'pana':
      return `<pattern id="${id}" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="${c.base}"/><rect width="4" height="10" fill="${c.light}" opacity=".25"/></pattern>`;
    case 'plisado':
      return `<pattern id="${id}" width="26" height="26" patternUnits="userSpaceOnUse"><rect width="26" height="26" fill="${c.base}"/><rect width="9" height="26" fill="${c.dark}" opacity=".2"/><rect x="9" width="2" height="26" fill="${c.light}" opacity=".3"/></pattern>`;
    default:
      return '';
  }
}

function embroideryBand(y, c) {
  const colors = ['#B4233C', '#E9B949', '#0E6B58', '#2A78D6', '#E86A92'];
  let s = `<g opacity=".95">`;
  s += `<rect x="150" y="${y}" width="300" height="44" fill="${c.base}"/>`;
  for (let i = 0; i < 15; i++) {
    const x = 150 + i * 20;
    const col = colors[i % colors.length];
    s += `<path d="M${x},${y + 22} L${x + 10},${y + 6} L${x + 20},${y + 22} L${x + 10},${y + 38} Z" fill="${col}"/>`;
    s += `<circle cx="${x + 10}" cy="${y + 22}" r="3" fill="${c.light}"/>`;
  }
  s += `<line x1="150" y1="${y + 2}" x2="450" y2="${y + 2}" stroke="${colors[0]}" stroke-width="3"/>`;
  s += `<line x1="150" y1="${y + 42}" x2="450" y2="${y + 42}" stroke="${colors[2]}" stroke-width="3"/></g>`;
  return s;
}

export function garmentSVG({ shape, color, pattern = null, accent = null, background = '#F2F3F0' }) {
  const s = SHAPES[shape];
  if (!s) throw new Error('Forma desconocida: ' + shape);
  const isLight = luminance(color) > 0.6;
  const c = {
    base: color,
    dark: mix(color, '#000000', isLight ? 0.22 : 0.35),
    shade: mix(color, '#000000', 0.55),
    light: mix(color, '#FFFFFF', isLight ? 0.6 : 0.35),
    button: isLight ? '#D9D4CB' : mix(color, '#FFFFFF', 0.55),
    accent: accent || (isLight ? '#1F3A5F' : '#F5F5F2'),
    accent2: accent ? mix(accent, '#FFFFFF', 0.35) : '#E9B949',
    leaf: '#2F6B4F',
    hood: mix(color, '#000000', isLight ? 0.08 : 0.15),
  };
  const pid = `pat-${shape}`;
  const defs = pattern && pattern !== 'bordado' ? patternDefs(pid, pattern, c) : '';
  const fill = defs ? `url(#${pid})` : color;
  const bg = mix(background, color, 0.08);
  const outline = isLight ? mix(color, '#000000', 0.3) : mix(color, '#000000', 0.25);
  const embroidery = pattern === 'bordado'
    ? `<g clip-path="url(#clip-${shape})">${embroideryBand(shape === 'vestido' ? 196 : 170, c)}${shape === 'vestido' ? embroideryBand(600, c) : ''}</g>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${mix(bg, '#FFFFFF', 0.55)}"/>
      <stop offset="1" stop-color="${bg}"/>
    </linearGradient>
    <linearGradient id="light" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity=".22"/>
      <stop offset=".45" stop-color="#FFFFFF" stop-opacity="0"/>
      <stop offset="1" stop-color="#000000" stop-opacity=".16"/>
    </linearGradient>
    <radialGradient id="floor" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="#000000" stop-opacity=".16"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="clip-${shape}"><path d="${s.body}"/></clipPath>
    ${defs}
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <ellipse cx="300" cy="690" rx="210" ry="22" fill="url(#floor)"/>
  <g>
    <path d="${s.body}" fill="${fill}" stroke="${outline}" stroke-width="2.5" stroke-linejoin="round"/>
    ${embroidery}
    <g>${s.details(c)}</g>
    <path d="${s.body}" fill="url(#light)"/>
  </g>
</svg>`;
}

export const SHAPE_NAMES = Object.keys(SHAPES);
