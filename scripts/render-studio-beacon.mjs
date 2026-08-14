import { mkdir, writeFile } from "node:fs/promises";

const [timezone = "Europe/Warsaw", outputPath] = process.argv.slice(2);

if (!outputPath) {
  throw new Error(
    "Usage: node scripts/render-studio-beacon.mjs <iana-timezone> <output-svg-path>",
  );
}

const now = new Date();
const parts = new Intl.DateTimeFormat("en-GB", {
  timeZone: timezone,
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
}).formatToParts(now);
const part = (type) => parts.find((item) => item.type === type)?.value ?? "00";
const hour = Number(part("hour"));
const minute = part("minute");
const weekday = part("weekday");

const windows = [
  { label: "NIGHT WATCH", range: "22–05", start: 22, end: 5, color: "#a78bfa" },
  { label: "MORNING BUILD", range: "06–11", start: 6, end: 11, color: "#facc15" },
  { label: "DAY SHIFT", range: "12–17", start: 12, end: 17, color: "#22d3ee" },
  { label: "EVENING DEPLOY", range: "18–21", start: 18, end: 21, color: "#fb923c" },
];

const activeIndex = windows.findIndex((window) =>
  window.start > window.end
    ? hour >= window.start || hour <= window.end
    : hour >= window.start && hour <= window.end,
);
const activeWindow = windows[activeIndex];
const currentTime = `${part("hour")}:${minute}`;
const generatedAt = now.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");

const windowCards = windows
  .map((window, index) => {
    const x = 54 + index * 252;
    const active = index === activeIndex;
    return `<g transform="translate(${x} 109)">
      <rect width="224" height="68" rx="15" fill="${active ? "#102b36" : "#0a1b2a"}" stroke="${active ? window.color : "#1f4054"}" stroke-width="${active ? "2" : "1"}"/>
      <circle cx="28" cy="34" r="7" fill="${window.color}" ${active ? 'filter="url(#glow)"' : 'fill-opacity="0.55"'}/>
      <text x="48" y="30" fill="${active ? "#f8fafc" : "#9ab6c2"}" font-size="13" font-weight="700" letter-spacing="1.2">${window.label}</text>
      <text x="48" y="50" fill="#7296a6" font-size="12">${window.range} local time</text>
      ${active ? `<text x="198" y="50" fill="${window.color}" font-size="12" text-anchor="end">NOW</text>` : ""}
    </g>`;
  })
  .join("\n    ");

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1116 215" role="img" aria-labelledby="title description">
  <title id="title">Studio Beacon for ${timezone}</title>
  <desc id="description">A time-of-day snapshot for the profile location, rendered by the scheduled GitHub workflow.</desc>
  <defs>
    <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#07111f"/>
      <stop offset="100%" stop-color="#10243a"/>
    </linearGradient>
    <filter id="glow" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="4" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="1116" height="215" rx="22" fill="url(#background)"/>
  <rect x="1" y="1" width="1114" height="213" rx="21" fill="none" stroke="#24425b"/>
  <g font-family="DejaVu Sans, sans-serif">
    <text x="54" y="48" fill="#a5f3fc" font-size="13" font-weight="700" letter-spacing="2.4">STUDIO BEACON</text>
    <text x="54" y="79" fill="#f8fafc" font-size="25" font-weight="700">${weekday} · ${currentTime} in Warsaw</text>
    <text x="1060" y="48" fill="${activeWindow.color}" font-size="13" font-weight="700" text-anchor="end">${activeWindow.label}</text>
    <text x="1060" y="72" fill="#7898a7" font-size="11" text-anchor="end">Workflow snapshot · ${generatedAt}</text>
    ${windowCards}
  </g>
</svg>`;

await mkdir(new URL(".", `file://${outputPath}`).pathname, { recursive: true });
await writeFile(outputPath, svg, "utf8");
