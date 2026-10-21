// Navigation bar shared by the HTML pages of reviews/_index/ (they sit in the same folder, so the links are relative and work from file://).
const PAGES = [
  ['dashboard', 'dashboard.html', 'Dashboard'],
  ['insights', 'insights.html', 'Insights'],
  ['oos', 'fora-do-escopo.html', 'Fora do escopo'],
  ['pendencias', 'pendencias-tickets.html', 'Pendências e tickets'],
];

function navHtml(current) {
  const links = PAGES.map(([id, file, label]) =>
    id === current
      ? `<b aria-current="page">${label}</b>`
      : `<a href="${file}" style="color:inherit">${label}</a>`
  ).join('');
  return `<nav class="crnav" aria-label="Relatórios" style="display:flex;gap:18px;flex-wrap:wrap;padding:8px 24px;border-bottom:1px solid rgba(128,128,128,.35);font:13px/1.4 system-ui,Segoe UI,Arial,sans-serif">${links}</nav>`;
}

module.exports = { navHtml, PAGES };
