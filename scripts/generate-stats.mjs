// Genera assets/activity.svg y assets/languages.svg con la paleta de la marca.
// Usa la API oficial de GitHub, asi que los datos son siempre los reales.
// Requiere GH_TOKEN en el entorno.

const USER = "Ragosorio";
const TOKEN = process.env.GH_TOKEN;
if (!TOKEN) {
  console.error("Falta GH_TOKEN");
  process.exit(1);
}

// Paleta: celda vacia + 4 niveles de intensidad hasta el morado de la marca
const EMPTY = "#8b8b96";
const LEVELS = ["#4a3358", "#6d4a85", "#9268b8", "#b890d9"];
// Rampa para lenguajes (mismo rango cromatico)
const RAMP = ["#b890d9", "#a67fce", "#946ec3", "#825db8", "#6f4cad", "#5d3ba2", "#4a3358"];

const api = async (url, opts = {}) =>
  fetch(url, {
    ...opts,
    headers: {
      authorization: `Bearer ${TOKEN}`,
      accept: "application/vnd.github+json",
      "user-agent": USER,
      ...opts.headers,
    },
  });

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ---------- Calendario de contribuciones ----------
async function activity() {
  const query = `query($user:String!){
    user(login:$user){ contributionsCollection{ contributionCalendar{
      totalContributions
      weeks{ contributionDays{ date contributionCount } }
    }}}
  }`;
  const res = await api("https://api.github.com/graphql", {
    method: "POST",
    body: JSON.stringify({ query, variables: { user: USER } }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));

  const cal = json.data.user.contributionsCollection.contributionCalendar;
  const weeks = cal.weeks;

  // Umbrales por cuartiles de los dias con actividad: reparte el color
  // de forma pareja en vez de dejar casi todo en el nivel mas bajo.
  const counts = weeks
    .flatMap((w) => w.contributionDays.map((d) => d.contributionCount))
    .filter((c) => c > 0)
    .sort((a, b) => a - b);
  const q = (p) =>
    counts[Math.floor(Math.min(counts.length - 1, p * counts.length))] || 1;
  const cuts = [q(0.25), q(0.5), q(0.75)];

  const color = (c) => {
    if (c <= 0) return EMPTY;
    if (c <= cuts[0]) return LEVELS[0];
    if (c <= cuts[1]) return LEVELS[1];
    if (c <= cuts[2]) return LEVELS[2];
    return LEVELS[3];
  };

  const CELL = 11, GAP = 3, PAD = 26, TOP = 22;
  const w = PAD + weeks.length * (CELL + GAP) + 10;
  const h = TOP + 7 * (CELL + GAP) + 10;

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  let labels = "", lastMonth = -1;
  weeks.forEach((wk, i) => {
    const d = new Date(wk.contributionDays[0].date);
    if (d.getUTCMonth() !== lastMonth && d.getUTCDate() <= 7) {
      lastMonth = d.getUTCMonth();
      labels += `<text x="${PAD + i * (CELL + GAP)}" y="14" class="lbl">${MONTHS[lastMonth]}</text>`;
    }
  });

  let cells = "";
  weeks.forEach((wk, x) => {
    wk.contributionDays.forEach((day) => {
      const y = new Date(day.date).getUTCDay();
      cells += `<rect x="${PAD + x * (CELL + GAP)}" y="${TOP + y * (CELL + GAP)}" width="${CELL}" height="${CELL}" rx="2" fill="${color(day.contributionCount)}"${day.contributionCount ? "" : ' opacity="0.18"'}><title>${day.date}: ${day.contributionCount}</title></rect>`;
    });
  });

  let days = "";
  [["Mon",1],["Wed",3],["Fri",5]].forEach(([t,i])=>{
    days += `<text x="0" y="${TOP + i*(CELL+GAP) + 9}" class="lbl">${t}</text>`;
  });

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${cal.totalContributions} contribuciones en el ultimo ano">
<style>.lbl{fill:#8b8b96;font:9px -apple-system,Segoe UI,sans-serif}</style>
${labels}${days}${cells}
</svg>`;
  return { svg, total: cal.totalContributions };
}

// ---------- Lenguajes sobre todos los repos ----------
async function languages() {
  const repos = [];
  for (let page = 1; ; page++) {
    const r = await api(`https://api.github.com/user/repos?per_page=100&page=${page}&affiliation=owner`);
    const batch = await r.json();
    if (!Array.isArray(batch) || !batch.length) break;
    repos.push(...batch.filter((x) => !x.fork));
    if (batch.length < 100) break;
  }

  const totals = {};
  for (const repo of repos) {
    const r = await api(`https://api.github.com/repos/${repo.full_name}/languages`);
    const langs = await r.json();
    for (const [k, v] of Object.entries(langs || {})) {
      // HTML/CSS son mayormente archivos generados y distorsionan el stack real
      if (k === "HTML" || k === "CSS") continue;
      totals[k] = (totals[k] || 0) + v;
    }
  }

  const sum = Object.values(totals).reduce((a, b) => a + b, 0);
  const list = Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([name, bytes], i) => ({
      name,
      bytes,
      pct: (bytes / sum) * 100,
      color: RAMP[i % RAMP.length],
    }));

  const W = 480, BAR_Y = 26, BAR_H = 10, COL_H = 20;
  const rows = Math.ceil(list.length / 2);
  const H = BAR_Y + BAR_H + 16 + rows * COL_H + 8;

  let x = 0, bar = "";
  const shown = list.reduce((a, l) => a + l.pct, 0);
  list.forEach((l, i) => {
    const seg = (l.pct / shown) * W;
    const r = i === 0 ? 'rx="2"' : i === list.length - 1 ? 'rx="2"' : "";
    bar += `<rect x="${x.toFixed(1)}" y="${BAR_Y}" width="${seg.toFixed(1)}" height="${BAR_H}" fill="${l.color}" ${r}/>`;
    x += seg;
  });

  const kb = (b) => (b >= 1e6 ? (b / 1e6).toFixed(1) + " MB" : Math.round(b / 1e3) + " kB");
  let legend = "";
  list.forEach((l, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const lx = col * (W / 2), ly = BAR_Y + BAR_H + 26 + row * COL_H;
    legend +=
      `<circle cx="${lx + 5}" cy="${ly - 4}" r="5" fill="${l.color}"/>` +
      `<text x="${lx + 16}" y="${ly}" class="n">${esc(l.name)}</text>` +
      `<text x="${lx + 130}" y="${ly}" class="v" text-anchor="end">${kb(l.bytes)}</text>` +
      `<text x="${lx + 195}" y="${ly}" class="v" text-anchor="end">${l.pct.toFixed(1)}%</text>`;
  });

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Lenguajes mas usados">
<style>
.t{fill:#b890d9;font:bold 13px -apple-system,Segoe UI,sans-serif}
.n{fill:#8b8b96;font:11px -apple-system,Segoe UI,sans-serif}
.v{fill:#8b8b96;font:11px -apple-system,Segoe UI,sans-serif;opacity:.75}
</style>
<text x="0" y="14" class="t">Most used languages</text>
${bar}${legend}
</svg>`;
  return { svg, list };
}

// ---------- main ----------
const fs = await import("node:fs/promises");
await fs.mkdir("assets", { recursive: true });

const a = await activity();
await fs.writeFile("assets/activity.svg", a.svg);
console.log(`activity.svg  ${a.total} contribuciones`);

const l = await languages();
await fs.writeFile("assets/languages.svg", l.svg);
console.log("languages.svg");
l.list.forEach((x) => console.log(`  ${x.name.padEnd(12)} ${x.pct.toFixed(1).padStart(5)}%  ${x.color}`));
