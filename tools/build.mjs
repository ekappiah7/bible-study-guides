#!/usr/bin/env node
/* Build the site from content/.
 *
 *   node tools/build.mjs            build published studies
 *   node tools/build.mjs --drafts   include studies marked draft
 *
 * Reads content/site.json, content/studies/*.json and content/scripture/bsb.json,
 * writes the HTML pages at the repository root plus sitemap.xml and robots.txt.
 * No dependencies: it runs on a bare Node install, which is the point. The HTML it
 * writes is fully rendered, so the site needs no framework at runtime, works with
 * JavaScript disabled for reading, and stays fast on a weak connection.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const withDrafts = process.argv.includes('--drafts');

const BANNER = `<!--
  GENERATED FILE. Do not edit by hand: your changes will be overwritten.
  Source: content/studies/*.json and content/site.json
  Rebuild: node tools/build.mjs
-->`;

const read = (p) => JSON.parse(readFileSync(join(REPO, p), 'utf8'));

/* ---------- helpers ---------- */

/** Escape stray ampersands, leaving intended entities and inline markup alone. */
const h = (s) => String(s == null ? '' : s).replace(/&(?!#?\w+;)/g, '&amp;');

/** Escape for an attribute value. */
const attr = (s) => h(s).replace(/"/g, '&quot;');

/** Escape everything, for places where markup must not be interpreted. */
const text = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const indent = (s, pad) => s.split('\n').map((l) => (l ? pad + l : l)).join('\n');

/* ---------- content nodes ---------- */

function renderNodes(nodes = []) {
  return nodes.map((node) => {
    if (node.p) return `<p>${h(node.p)}</p>`;
    if (node.h4) return `<h4>${h(node.h4)}</h4>`;
    if (node.ul) return `<ul>\n${node.ul.map((i) => `    <li>${h(i)}</li>`).join('\n')}\n</ul>`;
    if (node.ol) return `<ol>\n${node.ol.map((i) => `    <li>${h(i)}</li>`).join('\n')}\n</ol>`;
    return '';
  }).filter(Boolean).join('\n');
}

/* ---------- blocks ---------- */

const CARD_CLASS = {
  themes: 'theme-box',
  prose: 'prose-box',
  context: 'historical-context',
  warning: 'warning-box',
  application: 'application-modern',
  observe: 'observe-box',
  wordstudy: 'wordstudy-box',
  hardquestion: 'hardquestion-box',
};

function chip(ref) {
  return `<span class="cross-reference" data-scripture="${attr(ref)}" role="button" tabindex="0">${h(ref)}</span>`;
}

function renderBlock(block, passages, warn) {
  const t = block.type;

  if (CARD_CLASS[t]) {
    const heading = block.heading ? `<h3>${h(block.heading)}</h3>\n` : '';
    return `<div class="${CARD_CLASS[t]}">\n${indent(heading + renderNodes(block.body), '    ')}\n</div>`;
  }

  if (t === 'highlight') {
    const heading = block.heading ? `<p><strong>${h(block.heading)}</strong></p>\n` : '';
    return `<div class="verse-highlight">\n${indent(heading + renderNodes(block.body), '    ')}\n</div>`;
  }

  if (t === 'passage') {
    const body = passages[block.ref];
    if (!body) warn(`no passage text for "${block.ref}" (run tools/one-off/build-scripture-cache.py)`);
    const refs = (block.crossRefs || []).map(chip).join('\n    ');
    // no wrapping quote marks: the card and the reference label already mark this as
    // quoted text, and many passages end with a quotation of their own
    return `<div class="verse-highlight">
    <p><strong>${h(block.ref)}:</strong> ${h(body || '')}</p>${refs ? '\n    ' + refs : ''}
</div>`;
  }

  if (t === 'passageList') {
    const heading = block.heading ? `    <p><strong>${h(block.heading)}</strong></p>\n` : '';
    return `<div class="verse-highlight">\n${heading}    ${block.refs.map(chip).join('\n    ')}\n</div>`;
  }

  if (t === 'pullquote') {
    const body = block.text || passages[block.ref];
    if (!body) warn(`no text for pull quote "${block.ref}"`);
    return `<div class="verse-highlight pullquote">
    <p class="pullquote-text">${h(body || '')}</p>
    <p class="pullquote-ref">${h(block.ref)}</p>
</div>`;
  }

  if (t === 'reflection') {
    const qs = block.questions.map((q) =>
      `    <div class="discussion-question">
        <strong>${h(q.audience)}:</strong> ${h(q.text)}
    </div>`).join('\n');
    return `<div class="reflection-box">
    <h3>${h(block.heading || 'Reflection Questions')}</h3>
${qs}
</div>`;
  }

  if (t === 'notes') {
    return `<div class="notes-section">
    <h3>${h(block.heading || 'Your Notes')}</h3>
    <textarea id="${attr(block.id)}" placeholder="${attr(block.placeholder || 'Write your observations, questions or insights...')}"></textarea>
</div>`;
  }

  if (t === 'checklist') {
    const intro = block.intro ? `    <p>${h(block.intro)}</p>\n` : '';
    const items = block.items.map((item) =>
      `    <div class="checkbox-item">
        <input type="checkbox" id="${attr(item.id)}">
        <label for="${attr(item.id)}">${h(item.text)}</label>
    </div>`).join('\n');
    const badge = block.badge
      ? `\n    <span class="completion-badge" id="${attr(block.badge.id)}">${h(block.badge.text)}</span>`
      : '';
    return `<div class="interactive-element">
    <h3>${h(block.heading || 'Study Checklist')}</h3>
${intro}${items}${badge}
</div>`;
  }

  if (t === 'toolgrid') {
    const cards = block.cards.map((card) => {
      const heading = card.heading ? `<h3>${h(card.heading)}</h3>\n` : '';
      return `    <div class="tool-card">\n${indent(heading + renderNodes(card.body), '        ')}\n    </div>`;
    }).join('\n');
    return `<div class="study-tools">\n${cards}\n</div>`;
  }

  warn(`unknown block type "${t}"`);
  return '';
}

/* ---------- page chrome ---------- */

function head({ docTitle, description, canonical, extraMeta = '' }) {
  const canon = canonical ? `  <link rel="canonical" href="${attr(canonical)}">\n` : '';
  const og = canonical ? `  <meta property="og:url" content="${attr(canonical)}">\n` : '';
  return `<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${text(docTitle)}</title>
  <meta name="description" content="${attr(description)}">
${canon}  <meta property="og:type" content="website">
  <meta property="og:title" content="${attr(docTitle)}">
  <meta property="og:description" content="${attr(description)}">
${og}  <meta name="twitter:card" content="summary">
  <link rel="icon" href="favicon.svg" type="image/svg+xml">
  <link rel="preload" href="assets/fonts/instrument-latin.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="assets/fonts/fraunces-latin.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="assets/css/app.css">
  <meta name="theme-color" content="#6b4423">
${extraMeta}</head>`;
}

/* ---------- a study page ---------- */

function renderStudy(study, scripture, site) {
  const problems = [];
  const warn = (m) => problems.push(m);
  const passages = scripture.passages || {};

  const nav = study.units.map((unit, i) =>
    `                <button class="nav-button${i === 0 ? ' active' : ''}" data-unit="${attr(unit.id)}" role="tab" aria-selected="${i === 0 ? 'true' : 'false'}" aria-controls="${attr(unit.id)}">${h(unit.navLabel)}</button>`
  ).join('\n');

  const sections = study.units.map((unit, i) => {
    const title = unit.title ? `            <h2 class="section-title">${h(unit.title)}</h2>\n` : '';
    const blocks = unit.blocks.map((b) => indent(renderBlock(b, passages, warn), '            ')).join('\n\n');
    const badge = unit.badge
      ? `\n            <span class="completion-badge" id="${attr(unit.badge.id)}">${h(unit.badge.text)}</span>`
      : '';
    return `        <div id="${attr(unit.id)}" class="content-section${i === 0 ? ' active' : ''}" role="tabpanel">
${title}${blocks}${badge}
        </div>`;
  }).join('\n\n');

  // only the passages this page actually needs
  const used = new Set();
  for (const unit of study.units) {
    for (const b of unit.blocks) {
      if (b.ref) used.add(b.ref);
      for (const key of ['crossRefs', 'refs', 'passages']) {
        for (const r of b[key] || []) used.add(r);
      }
    }
    for (const r of unit.passages || []) used.add(r);
  }
  const pagePassages = {};
  for (const ref of [...used].sort()) {
    if (passages[ref]) pagePassages[ref] = passages[ref];
  }

  const canonical = site.baseUrl ? `${site.baseUrl.replace(/\/$/, '')}/${study.slug}` : '';
  const docTitle = study.docTitle || `${study.title}: ${study.tagline || 'Bible study'} - Interactive Bible Study`;

  const html = `${BANNER}
<!DOCTYPE html>
<html lang="en">
${head({ docTitle, description: study.metaDescription || site.metaDescription, canonical })}
<body data-study="${attr(study.id)}" data-opening="${attr(study.progressOpening || 'Ready to begin')}">
    <div class="container">
        <div class="header">
            <h1>${h(study.pageTitle || study.title + ' Study Guide')}</h1>
${study.tagline ? `            <p class="subtitle">${h(study.tagline)}</p>\n` : ''}        </div>

        <div class="progress-tracker">
            <h3>Study Progress</h3>
            <div class="progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-label="Study progress">
                <div class="progress-fill" id="progressFill"></div>
            </div>
            <p id="progressText">0% Complete - ${h(study.progressOpening || 'Ready to begin')}</p>
            <p class="save-status" id="saveStatus" role="status" aria-live="polite"></p>
            <div class="progress-actions">
                <button type="button" class="reset-button" id="resetProgress">Clear my saved notes and ticks</button>
            </div>
        </div>

        <div class="chapter-nav" role="tablist" aria-label="Study sections">
${nav}
        </div>

${sections}

        <footer class="scripture-credit">
            <p><strong>Scripture text.</strong> ${h(scripture.translation.notice)}
            <a href="${attr(scripture.translation.licenceUrl)}" rel="noopener">${h(scripture.translation.licenceUrl.replace(/^https?:\/\//, ''))}</a></p>
            <p><strong>Free to use.</strong> This guide is free for personal, family and church study.
            Your notes and ticks are saved only in this browser on this device, and are never uploaded.</p>
${(study.sources || []).length ? `            <p><strong>Sources.</strong> ${study.sources.map((s) => (s.url ? `<a href="${attr(s.url)}" rel="noopener">${h(s.label)}</a>` : h(s.label))).join('; ')}.</p>\n` : ''}        </footer>

        <button class="back-to-top" type="button" aria-label="Back to top">&uarr;</button>

        <div class="modal-overlay" id="scriptureModal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
            <div class="modal">
                <h3 id="modalTitle"></h3>
                <p id="modalText"></p>
                <button class="modal-close" type="button" aria-label="Close">&times;</button>
            </div>
        </div>
    </div>

    <script type="application/json" id="passageData">${JSON.stringify(pagePassages)}</script>
    <script src="assets/js/study.js"></script>
</body>
</html>
`;
  return { html, problems, passageCount: Object.keys(pagePassages).length };
}

/* ---------- home page ---------- */

function monogram(study) {
  if (study.monogram) return study.monogram;
  const words = study.title.split(/\s+/);
  if (/^[123]$/.test(words[0])) return words[0] + words[1].slice(0, 2);
  return study.title.slice(0, Math.min(4, study.title.length)).replace(/\s+$/, '');
}

function studyCard(study, { href, status, variant }) {
  const inner = `            <div class="study-card">
              <div class="study-icon" aria-hidden="true">${h(monogram(study))}</div>
              <div class="study-name">${h(study.title)}</div>
              <div class="study-status">${h(status)}</div>
            </div>`;
  return href
    ? `          <a href="${attr(href)}" class="study-link">\n${inner}\n          </a>`
    : `          <div class="study-link study-link-pending" aria-disabled="true">\n${inner}\n          </div>`;
}

function renderHome(site, studies) {
  const byKind = (kind) => studies
    .filter((s) => s.kind === kind)
    .sort((a, b) => (a.canon?.order || 999) - (b.canon?.order || 999) || a.title.localeCompare(b.title));

  const sections = site.sections.map((section) => {
    let cards = [];
    if (section.source === 'published-books') {
      cards = byKind('book').map((s) => studyCard(s, { href: `${s.slug}.html`, status: 'Start Studying' }));
    } else if (section.source === 'published-topics') {
      cards = byKind('topic').map((s) => studyCard(s, { href: `${s.slug}.html`, status: 'Start Studying' }));
    } else {
      cards = (section.studies || []).map((s) => studyCard(s, { status: section.status || 'Planned' }));
    }
    if (!cards.length && section.hideWhenEmpty) return '';
    return `      <section class="section ${section.variant}">
        <h2 class="section-title">${h(section.title)}</h2>
        <div class="study-grid">
${cards.join('\n')}
        </div>
      </section>`;
  }).filter(Boolean).join('\n\n');

  const canonical = site.baseUrl ? site.baseUrl.replace(/\/$/, '') + '/' : '';

  return `${BANNER}
<!DOCTYPE html>
<html lang="en">
${head({ docTitle: site.name, description: site.metaDescription, canonical })}
<body>
  <div class="container">
    <header class="header">
      <div class="header-content">
        <h1>${h(site.name)}</h1>
        <p class="subtitle">${h(site.tagline)}</p>
      </div>
    </header>

    <main class="main-content">
${sections}

      <div class="journey-note">
        <h3>${h(site.journeyNote.heading)}</h3>
        <p>${h(site.journeyNote.body)}</p>
      </div>
    </main>

    <footer class="site-footer">
${site.footer.map((p) => `      <p>${h(p)}</p>`).join('\n')}
    </footer>
  </div>
</body>
</html>
`;
}

function renderNotFound(site) {
  const nf = site.notFound;
  return `${BANNER}
<!DOCTYPE html>
<html lang="en">
${head({ docTitle: nf.docTitle, description: nf.body })}
<body>
  <div class="container">
    <header class="header">
      <div class="header-content">
        <h1>${h(site.name)}</h1>
        <p class="subtitle">That page could not be found</p>
      </div>
    </header>
    <main class="notfound">
      <h2>${h(nf.heading)}</h2>
      <p>${h(nf.body)}</p>
      <a class="home" href="/">${h(nf.cta)}</a>
    </main>
  </div>
</body>
</html>
`;
}

/* ---------- run ---------- */

const site = read('content/site.json');
const scripture = read('content/scripture/bsb.json');

const files = readdirSync(join(REPO, 'content/studies'))
  .filter((f) => f.endsWith('.json'))
  .sort();

const all = files.map((f) => read(join('content/studies', f)));
const studies = all.filter((s) => s.status === 'published' || (withDrafts && s.status === 'draft'));

let problems = 0;
const written = new Set(['index.html', '404.html']);

for (const study of studies) {
  const { html, problems: issues, passageCount } = renderStudy(study, scripture, site);
  writeFileSync(join(REPO, `${study.slug}.html`), html, 'utf8');
  written.add(`${study.slug}.html`);
  const units = study.units.length;
  const checks = study.units.reduce((n, u) =>
    n + u.blocks.filter((b) => b.type === 'checklist').reduce((m, b) => m + b.items.length, 0), 0);
  const flag = study.status === 'draft' ? ' [draft]' : '';
  console.log(`  ${study.slug}.html`.padEnd(26) +
    `${units} units, ${checks} checklist items, ${passageCount} passages${flag}`);
  for (const issue of issues) {
    console.log(`    ! ${issue}`);
    problems++;
  }
}

writeFileSync(join(REPO, 'index.html'), renderHome(site, studies), 'utf8');
writeFileSync(join(REPO, '404.html'), renderNotFound(site), 'utf8');
console.log('  index.html'.padEnd(28) + `${studies.length} studies listed`);
console.log('  404.html');

// remove pages this build no longer produces, so an unpublished or renamed study
// cannot linger at the repository root and get deployed
for (const file of readdirSync(REPO).filter((f) => f.endsWith('.html'))) {
  if (written.has(file)) continue;
  const head = readFileSync(join(REPO, file), 'utf8').slice(0, 200);
  if (head.includes('GENERATED FILE')) {
    unlinkSync(join(REPO, file));
    console.log(`  removed ${file} (no longer published)`);
  }
}

if (site.baseUrl) {
  const base = site.baseUrl.replace(/\/$/, '');
  const urls = ['', ...studies.map((s) => '/' + s.slug)];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${base}${u || '/'}</loc></url>`).join('\n')}
</urlset>
`;
  writeFileSync(join(REPO, 'sitemap.xml'), sitemap, 'utf8');
  writeFileSync(join(REPO, 'robots.txt'),
    `User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`, 'utf8');
  console.log('  sitemap.xml, robots.txt');
} else {
  console.log('  (no sitemap: set baseUrl in content/site.json once the domain is known)');
}

if (problems) {
  console.error(`\n${problems} problem(s) found.`);
  process.exit(1);
}
console.log(`\nBuilt ${studies.length} studies from content/.`);
