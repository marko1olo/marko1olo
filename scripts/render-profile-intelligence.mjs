import { mkdir, writeFile } from "node:fs/promises";

const [username, outputDirectory] = process.argv.slice(2);

if (!username || !outputDirectory) {
  throw new Error(
    "Usage: node scripts/render-profile-intelligence.mjs <github-user> <output-directory>",
  );
}

const headers = {
  Accept: "application/vnd.github+json",
  "User-Agent": "marko1olo-profile-intelligence",
};

if (process.env.GITHUB_TOKEN) {
  headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
}

const fetchJson = async (url) => {
  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(`GitHub API request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
};

const escapeXml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const compactText = (value, limit) => {
  const normalised = String(value).replace(/\s+/g, " ").trim();
  return normalised.length > limit ? `${normalised.slice(0, limit - 1).trimEnd()}…` : normalised;
};

const compactDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toISOString().slice(0, 10);
};

const languageColors = {
  TypeScript: "#38bdf8",
  JavaScript: "#facc15",
  Python: "#a78bfa",
  "C#": "#c084fc",
  "C++": "#60a5fa",
  C: "#94a3b8",
  HTML: "#fb923c",
  CSS: "#f472b6",
  Shell: "#4ade80",
  PowerShell: "#60a5fa",
  Rust: "#fb7185",
  Go: "#22d3ee",
  Java: "#f97316",
  Kotlin: "#a78bfa",
};

const repositories = await fetchJson(
  `https://api.github.com/users/${encodeURIComponent(username)}/repos?per_page=100&type=owner&sort=pushed&direction=desc`,
);

const ownedPublicRepositories = repositories.filter(
  (repository) => !repository.fork && !repository.private,
);

// Fetch recent push events to external (non-owned) repos
let externalContributions = [];
try {
  const events = await fetchJson(
    `https://api.github.com/users/${encodeURIComponent(username)}/events/public?per_page=100`,
  );
  const ownedNames = new Set(ownedPublicRepositories.map((r) => r.full_name));
  const seenRepos = new Set();
  for (const event of events) {
    if (event.type !== "PushEvent") continue;
    const repoName = event.repo?.name;
    if (!repoName || ownedNames.has(repoName) || seenRepos.has(repoName)) continue;
    seenRepos.add(repoName);
    const commit = event.payload?.commits?.at(-1);
    if (!commit) continue;
    externalContributions.push({
      name: repoName.split("/")[1] ?? repoName,
      fullName: repoName,
      message: commit.message?.split("\n")[0] ?? "",
      date: event.created_at?.slice(0, 10) ?? "",
    });
    if (externalContributions.length >= 5) break;
  }
} catch {
  // Events API may be unavailable; proceed without external contributions
}

const languagePayloads = await Promise.all(
  ownedPublicRepositories.map(async (repository) => ({
    name: repository.name,
    languages: await fetchJson(repository.languages_url),
  })),
);

const languageTotals = new Map();
for (const { languages } of languagePayloads) {
  for (const [language, bytes] of Object.entries(languages)) {
    languageTotals.set(language, (languageTotals.get(language) ?? 0) + bytes);
  }
}

const totalLanguageBytes = [...languageTotals.values()].reduce((sum, bytes) => sum + bytes, 0);
const topLanguages = [...languageTotals.entries()]
  .sort(([, firstBytes], [, secondBytes]) => secondBytes - firstBytes)
  .slice(0, 5)
  .map(([name, bytes]) => ({
    name,
    bytes,
    percentage: totalLanguageBytes === 0 ? 0 : Math.round((bytes / totalLanguageBytes) * 100),
    color: languageColors[name] ?? "#22d3ee",
  }));

const latestRepositoryCommits = await Promise.all(
  ownedPublicRepositories.map(async (repository) => {
    const commits = await fetchJson(`${repository.url}/commits?per_page=1`);
    const commit = commits[0];

    if (!commit) {
      return null;
    }

    const committedAt = commit.commit.author?.date ?? commit.commit.committer?.date;
    return {
      repository: repository.name,
      message: compactText(commit.commit.message.split("\n")[0], 76),
      date: committedAt,
    };
  }),
);

const recentPublicChanges = latestRepositoryCommits
  .filter((commit) => commit !== null)
  .sort((first, second) => new Date(second.date) - new Date(first.date))
  .slice(0, 4)
  .map((commit) => ({ ...commit, date: compactDate(commit.date) }));

const syncedAt = new Date().toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
const languageRows = topLanguages.length
  ? topLanguages
      .map(
        (language, index) => {
          const y = 142 + index * 34;
          const width = Math.max(16, Math.round((language.percentage / 100) * 530));
          return `<text x="48" y="${y + 15}" fill="#e2e8f0" font-size="15" font-weight="700">${escapeXml(language.name)}</text>
  <text x="574" y="${y + 15}" fill="#94a3b8" font-size="14" text-anchor="end">${language.percentage}%</text>
  <rect x="48" y="${y + 23}" width="530" height="8" rx="4" fill="#10233a"/>
  <rect x="48" y="${y + 23}" width="${width}" height="8" rx="4" fill="${language.color}"/>`;
        },
      )
      .join("\n  ")
  : `<text x="48" y="166" fill="#94a3b8" font-size="15">No public language metadata is available yet.</text>`;

const recentRows = recentPublicChanges.length
  ? recentPublicChanges
      .map(
        (change, index) => {
          const y = 133 + index * 38;
          return `<circle cx="48" cy="${y - 5}" r="4" fill="#22d3ee"/>
  <text x="64" y="${y}" fill="#c4b5fd" font-size="13" font-weight="700">${escapeXml(change.repository)}</text>
  <text x="180" y="${y}" fill="#f8fafc" font-size="14">${escapeXml(change.message)}</text>
  <text x="1152" y="${y}" fill="#94a3b8" font-size="12" text-anchor="end">${change.date}</text>
  <line x1="48" y1="${y + 16}" x2="1152" y2="${y + 16}" stroke="#1e3a52" stroke-opacity="0.74"/>`;
        },
      )
      .join("\n  ")
  : `<text x="48" y="154" fill="#94a3b8" font-size="15">No recent public push events are available.</text>`;

const languageSpectrum = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 620 350" role="img" aria-labelledby="title description">
  <title id="title">Language Spectrum for ${escapeXml(username)}</title>
  <desc id="description">Top languages aggregated from owned public repositories by GitHub Linguist byte count.</desc>
  <defs>
    <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#07111f"/>
      <stop offset="100%" stop-color="#171035"/>
    </linearGradient>
    <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="4" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="620" height="350" rx="20" fill="url(#background)"/>
  <rect x="1" y="1" width="618" height="348" rx="19" fill="none" stroke="#24425b"/>
  <circle cx="558" cy="54" r="38" fill="#22d3ee" fill-opacity="0.10" filter="url(#glow)"/>
  <circle cx="558" cy="54" r="16" fill="none" stroke="#a78bfa" stroke-opacity="0.75"/>
  <text x="48" y="52" fill="#a5f3fc" font-family="DejaVu Sans, sans-serif" font-size="13" font-weight="700" letter-spacing="2.4">LANGUAGE SPECTRUM</text>
  <text x="48" y="80" fill="#f8fafc" font-family="DejaVu Sans, sans-serif" font-size="23" font-weight="700">Code composition, not a badge guess</text>
  <text x="48" y="106" fill="#94a3b8" font-family="DejaVu Sans, sans-serif" font-size="12">Top languages by GitHub Linguist bytes across ${ownedPublicRepositories.length} owned public repositories · ${syncedAt}</text>
  <g font-family="DejaVu Sans, sans-serif">
  ${languageRows}
  </g>
</svg>`;

const recentShipping = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 310" role="img" aria-labelledby="title description">
  <title id="title">Recent public shipping for ${escapeXml(username)}</title>
  <desc id="description">Latest commits from author-owned public repositories.</desc>
  <defs>
    <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#07111f"/>
      <stop offset="58%" stop-color="#0b1a2b"/>
      <stop offset="100%" stop-color="#171035"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="310" rx="22" fill="url(#background)"/>
  <rect x="1" y="1" width="1198" height="308" rx="21" fill="none" stroke="#24425b"/>
  <path d="M0 242 C165 176 280 300 440 226 S786 162 950 225 S1114 268 1200 190" fill="none" stroke="#22d3ee" stroke-opacity="0.10" stroke-width="2"/>
  <g font-family="DejaVu Sans, sans-serif">
    <text x="48" y="54" fill="#a5f3fc" font-size="13" font-weight="700" letter-spacing="2.4">RECENT SHIPPING</text>
    <text x="48" y="83" fill="#f8fafc" font-size="23" font-weight="700">Latest public repository commits</text>
    <text x="48" y="108" fill="#94a3b8" font-size="12">Latest commit from each author-owned public repository · messages are shown exactly as published · ${syncedAt}</text>
    ${recentRows}
  </g>
</svg>`;

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(`${outputDirectory}/language-spectrum.svg`, languageSpectrum, "utf8"),
  writeFile(`${outputDirectory}/recent-shipping.svg`, recentShipping, "utf8"),
]);
