#!/usr/bin/env node
/* Check every content file before it reaches the site.
 *
 *   node tools/validate.mjs
 *
 * The rules that matter most are the ones about ids. A reader's notes and ticks are
 * saved in their own browser against the ids in these files, so a duplicated or
 * renamed id silently destroys someone's work. This catches that.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const errors = [];
const warnings = [];

const NODE_KEYS = ['p', 'h4', 'ul', 'ol'];
const CARD_TYPES = ['themes', 'prose', 'context', 'warning', 'application',
  'highlight', 'observe', 'wordstudy', 'hardquestion'];
const ALL_TYPES = [...CARD_TYPES, 'passage', 'passageList', 'pullquote',
  'reflection', 'notes', 'checklist', 'toolgrid'];
const REF = /^(?:[123]\s+)?[A-Z][a-zA-Z]+\.?\s+\d+(?::[\d,\-\s]+)?$/;

function checkNodes(nodes, where) {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    errors.push(`${where}: body must be a non-empty array of content nodes`);
    return;
  }
  nodes.forEach((node, i) => {
    const keys = Object.keys(node);
    if (keys.length !== 1) {
      errors.push(`${where}.body[${i}]: a node needs exactly one key, got [${keys.join(', ')}]`);
      return;
    }
    const key = keys[0];
    if (!NODE_KEYS.includes(key)) {
      errors.push(`${where}.body[${i}]: unknown node key "${key}", expected one of ${NODE_KEYS.join(', ')}`);
      return;
    }
    if ((key === 'ul' || key === 'ol') && (!Array.isArray(node[key]) || !node[key].length)) {
      errors.push(`${where}.body[${i}]: "${key}" must be a non-empty array of strings`);
    }
    if ((key === 'p' || key === 'h4') && typeof node[key] !== 'string') {
      errors.push(`${where}.body[${i}]: "${key}" must be a string`);
    }
  });
}

function checkStudy(file, study, scripture, seenIds, seenSlugs) {
  const at = (s) => `${file} ${s}`;

  for (const field of ['id', 'kind', 'status', 'slug', 'title', 'units']) {
    if (study[field] === undefined) errors.push(at(`is missing required field "${field}"`));
  }
  if (study.id && !/^[a-z0-9-]+$/.test(study.id)) {
    errors.push(at(`id "${study.id}" must be lowercase letters, digits and hyphens`));
  }
  if (study.slug && !/^[a-z0-9-]+$/.test(study.slug)) {
    errors.push(at(`slug "${study.slug}" must be lowercase letters, digits and hyphens`));
  }
  if (!['book', 'topic'].includes(study.kind)) {
    errors.push(at(`kind must be "book" or "topic", got ${JSON.stringify(study.kind)}`));
  }
  if (!['published', 'draft'].includes(study.status)) {
    errors.push(at(`status must be "published" or "draft", got ${JSON.stringify(study.status)}`));
  }
  if (seenIds.has(study.id)) errors.push(at(`id "${study.id}" is already used by ${seenIds.get(study.id)}`));
  else seenIds.set(study.id, file);
  if (seenSlugs.has(study.slug)) errors.push(at(`slug "${study.slug}" is already used by ${seenSlugs.get(study.slug)}`));
  else seenSlugs.set(study.slug, file);

  if (study.kind === 'book') {
    if (!study.canon) warnings.push(at('is a book with no canon block, so it cannot be ordered on the home page'));
    else if (!['old', 'new'].includes(study.canon.testament)) {
      errors.push(at(`canon.testament must be "old" or "new", got ${JSON.stringify(study.canon.testament)}`));
    }
  }
  if (!study.metaDescription) warnings.push(at('has no metaDescription, so search results will read poorly'));
  if (study.kind === 'book' && !(study.sources || []).length) {
    warnings.push(at('cites no sources, though it makes historical claims'));
  }

  if (!Array.isArray(study.units) || !study.units.length) {
    errors.push(at('needs at least one unit'));
    return;
  }

  const elementIds = new Map();
  const unitIds = new Set();

  const claim = (id, where) => {
    if (!id) { errors.push(`${where}: missing id`); return; }
    if (elementIds.has(id)) {
      errors.push(`${where}: id "${id}" is already used at ${elementIds.get(id)}. ` +
        'Saved notes and ticks are keyed to these ids, so they must be unique.');
    } else {
      elementIds.set(id, where);
    }
  };

  study.units.forEach((unit, ui) => {
    const where = at(`units[${ui}]`);
    if (!unit.id || !/^[a-z0-9]+$/.test(unit.id)) {
      errors.push(`${where}: id must be lowercase letters and digits, got ${JSON.stringify(unit.id)}`);
    }
    if (unitIds.has(unit.id)) errors.push(`${where}: duplicate unit id "${unit.id}"`);
    unitIds.add(unit.id);
    if (!unit.navLabel) errors.push(`${where}: needs a navLabel for its tab`);
    if (!Array.isArray(unit.blocks)) {
      errors.push(`${where}: blocks must be an array`);
      return;
    }
    if (unit.badge) claim(unit.badge.id, `${where}.badge`);

    unit.blocks.forEach((block, bi) => {
      const bw = at(`units[${ui}] (${unit.id}) blocks[${bi}]`);
      if (!ALL_TYPES.includes(block.type)) {
        errors.push(`${bw}: unknown type ${JSON.stringify(block.type)}. Known types: ${ALL_TYPES.join(', ')}`);
        return;
      }
      if (CARD_TYPES.includes(block.type)) checkNodes(block.body, bw);

      if (block.type === 'passage' || block.type === 'pullquote') {
        if (!block.ref) errors.push(`${bw}: needs a "ref"`);
        else if (!REF.test(block.ref)) warnings.push(`${bw}: "${block.ref}" does not look like a reference`);
        if (block.text) {
          warnings.push(`${bw}: has inline "text". Passage text should come from ` +
            'content/scripture so the translation stays consistent and correctly licensed.');
        }
      }
      if (block.type === 'passageList') {
        if (!Array.isArray(block.refs) || !block.refs.length) errors.push(`${bw}: needs a non-empty "refs" array`);
      }
      if (block.type === 'reflection') {
        if (!Array.isArray(block.questions) || !block.questions.length) {
          errors.push(`${bw}: needs at least one question`);
        } else {
          block.questions.forEach((q, qi) => {
            if (!q.audience) errors.push(`${bw}.questions[${qi}]: needs an "audience", e.g. Personal or Group Discussion`);
            if (!q.text) errors.push(`${bw}.questions[${qi}]: needs "text"`);
          });
        }
      }
      if (block.type === 'notes') {
        claim(block.id, bw);
        const expected = new RegExp(`^notes-${unit.id}-\\d+$`);
        if (block.id && !expected.test(block.id)) {
          warnings.push(`${bw}: id "${block.id}" does not follow notes-${unit.id}-<n>`);
        }
      }
      if (block.type === 'checklist') {
        if (!Array.isArray(block.items) || !block.items.length) {
          errors.push(`${bw}: needs at least one item`);
        } else {
          block.items.forEach((item, ii) => {
            claim(item.id, `${bw}.items[${ii}]`);
            if (!item.text) errors.push(`${bw}.items[${ii}]: needs "text"`);
          });
        }
        if (block.badge) claim(block.badge.id, `${bw}.badge`);
      }
      if (block.type === 'toolgrid') {
        if (!Array.isArray(block.cards) || !block.cards.length) errors.push(`${bw}: needs at least one card`);
        else block.cards.forEach((card, ci) => checkNodes(card.body, `${bw}.cards[${ci}]`));
      }

      // every reference must have text available
      const refs = [block.ref, ...(block.crossRefs || []), ...(block.refs || [])].filter(Boolean);
      for (const ref of refs) {
        if (block.type === 'pullquote' && block.text) continue;
        if (!scripture.passages[ref]) {
          errors.push(`${bw}: no text cached for "${ref}". Run ` +
            'tools/one-off/build-scripture-cache.py to add it.');
        }
      }
    });

    const hasChecklist = unit.blocks.some((b) => b.type === 'checklist');
    const hasNotes = unit.blocks.some((b) => b.type === 'notes');
    if (unit.id !== 'overview' && !hasChecklist) {
      warnings.push(`${where} (${unit.id}): no checklist, so it contributes nothing to progress`);
    }
    if (/^study/.test(unit.id || '') && !hasNotes) {
      warnings.push(`${where} (${unit.id}): no notes box`);
    }
  });
}

/* ---------- run ---------- */

const scripturePath = join(REPO, 'content/scripture/bsb.json');
if (!existsSync(scripturePath)) {
  console.error('content/scripture/bsb.json is missing. Build it with tools/one-off/build-scripture-cache.py');
  process.exit(1);
}
const scripture = JSON.parse(readFileSync(scripturePath, 'utf8'));
if (!scripture.translation || !scripture.passages) {
  console.error('content/scripture/bsb.json needs "translation" and "passages"');
  process.exit(1);
}

const dir = join(REPO, 'content/studies');
const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
const seenIds = new Map();
const seenSlugs = new Map();
let studies = 0;

for (const file of files) {
  let study;
  try {
    study = JSON.parse(readFileSync(join(dir, file), 'utf8'));
  } catch (e) {
    errors.push(`${file}: not valid JSON (${e.message})`);
    continue;
  }
  studies++;
  checkStudy(file, study, scripture, seenIds, seenSlugs);
}

const site = JSON.parse(readFileSync(join(REPO, 'content/site.json'), 'utf8'));
for (const field of ['name', 'tagline', 'metaDescription', 'sections', 'journeyNote', 'footer', 'notFound']) {
  if (site[field] === undefined) errors.push(`content/site.json is missing "${field}"`);
}

for (const w of warnings) console.log(`warning  ${w}`);
for (const e of errors) console.error(`ERROR    ${e}`);

console.log(`\n${studies} studies checked, ${Object.keys(scripture.passages).length} passages cached, ` +
  `${errors.length} error(s), ${warnings.length} warning(s).`);
process.exit(errors.length ? 1 : 0);
