/* Study page behaviour, shared by every guide.
 *
 * What it does: tab navigation with deep links, progress tracking, the passage
 * reader, and saving the reader's notes and ticks on their own device.
 *
 * Storage contract, which must not change: notes are saved under
 * bsg:<studyId>:notes:<textarea id> and ticks under bsg:<studyId>:check:<checkbox id>.
 * Those ids come from the content files. Change an id and a reader loses that note.
 */
(function () {
  'use strict';

  const root = document.body;
  const STUDY = root.dataset.study;
  const OPENING = root.dataset.opening || 'Ready to begin';
  const PREFIX = 'bsg:' + STUDY + ':';

  const passages = (function () {
    const el = document.getElementById('passageData');
    if (!el) { return {}; }
    try { return JSON.parse(el.textContent) || {}; } catch (e) { return {}; }
  })();

  /* ---------- storage that never throws ---------- */

  const store = (function () {
    let backend = null;
    try {
      const probe = '__bsg_probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      backend = window.localStorage;
    } catch (e) {
      backend = null;
    }
    const memory = {};
    return {
      durable: backend !== null,
      get: function (key) {
        try {
          return backend ? backend.getItem(PREFIX + key) : (key in memory ? memory[key] : null);
        } catch (e) { return null; }
      },
      set: function (key, value) {
        try {
          if (backend) { backend.setItem(PREFIX + key, value); } else { memory[key] = value; }
          return true;
        } catch (e) { return false; }
      },
      clearStudy: function () {
        try {
          if (!backend) {
            Object.keys(memory).forEach(function (k) { delete memory[k]; });
            return true;
          }
          const doomed = [];
          for (let i = 0; i < backend.length; i++) {
            const k = backend.key(i);
            if (k && k.indexOf(PREFIX) === 0) { doomed.push(k); }
          }
          doomed.forEach(function (k) { backend.removeItem(k); });
          return true;
        } catch (e) { return false; }
      }
    };
  })();

  /* ---------- migration from the original index-based keys ---------- */

  function migrateLegacyKeys() {
    if (!store.durable || store.get('schema') === '2') { return; }
    try {
      document.querySelectorAll('textarea[id]').forEach(function (el, i) {
        const old = window.localStorage.getItem(STUDY + '-notes-' + i);
        if (old !== null && store.get('notes:' + el.id) === null) {
          store.set('notes:' + el.id, old);
        }
      });
      document.querySelectorAll('input[type="checkbox"][id]').forEach(function (el, i) {
        const old = window.localStorage.getItem(STUDY + '-checkbox-' + i);
        if (old !== null && store.get('check:' + el.id) === null) {
          store.set('check:' + el.id, old === 'true' ? '1' : '0');
        }
      });
    } catch (e) { /* best effort */ }
    store.set('schema', '2');
  }

  /* ---------- passage reader ---------- */

  let lastFocus = null;

  function showScriptureModal(reference) {
    const modal = document.getElementById('scriptureModal');
    if (!modal) { return; }
    lastFocus = document.activeElement;
    document.getElementById('modalTitle').textContent = reference;
    document.getElementById('modalText').textContent =
      passages[reference] || 'Passage text is not loaded for this reference yet.';
    modal.style.display = 'flex';
    const closer = modal.querySelector('.modal-close');
    if (closer) { closer.focus(); }
  }

  function closeScriptureModal() {
    const modal = document.getElementById('scriptureModal');
    if (!modal) { return; }
    modal.style.display = 'none';
    if (lastFocus && lastFocus.focus) { lastFocus.focus(); }
  }

  /* ---------- units ---------- */

  function unitIds() {
    return Array.prototype.map.call(
      document.querySelectorAll('.content-section'),
      function (el) { return el.id; }
    ).filter(Boolean);
  }

  function showSection(sectionId, options) {
    const target = document.getElementById(sectionId);
    if (!target) { return; }
    const opts = options || {};

    document.querySelectorAll('.content-section').forEach(function (el) {
      el.classList.remove('active');
    });
    document.querySelectorAll('.nav-button').forEach(function (el) {
      el.classList.remove('active');
      el.setAttribute('aria-selected', 'false');
    });

    target.classList.add('active');
    const button = document.querySelector('.nav-button[data-unit="' + sectionId + '"]');
    if (button) {
      button.classList.add('active');
      button.setAttribute('aria-selected', 'true');
      if (button.scrollIntoView) {
        button.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    }

    store.set('section', sectionId);
    if (!opts.silent && window.location.hash !== '#' + sectionId) {
      history.replaceState(null, '', '#' + sectionId);
    }
    refreshBadges();
    if (opts.scroll !== false) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function refreshBadges() {
    unitIds().forEach(function (id) {
      const section = document.getElementById(id);
      if (!section) { return; }
      const boxes = section.querySelectorAll('input[type="checkbox"]');
      const badge = section.querySelector('.completion-badge');
      if (!badge) { return; }
      const done = boxes.length > 0 &&
        Array.prototype.every.call(boxes, function (b) { return b.checked; });
      badge.classList.toggle('show', done);
    });
  }

  /* ---------- progress ---------- */

  function progressMessage(pct) {
    if (pct === 0) { return OPENING; }
    if (pct < 25) { return 'Great start, keep studying!'; }
    if (pct < 50) { return 'Making good progress!'; }
    if (pct < 75) { return "Over halfway, you're doing well!"; }
    if (pct < 100) { return 'Almost there!'; }
    return 'Study complete. Well done!';
  }

  function updateProgress() {
    const all = document.querySelectorAll('input[type="checkbox"]');
    const done = document.querySelectorAll('input[type="checkbox"]:checked');
    const pct = all.length ? Math.round((done.length / all.length) * 100) : 0;

    const fill = document.getElementById('progressFill');
    if (fill) {
      fill.style.width = pct + '%';
      const bar = fill.parentElement;
      if (bar) { bar.setAttribute('aria-valuenow', String(pct)); }
    }
    const text = document.getElementById('progressText');
    if (text) {
      text.textContent = pct + '% Complete - ' + progressMessage(pct) +
        ' (' + done.length + ' of ' + all.length + ')';
    }
    refreshBadges();
  }

  /* ---------- save indicator ---------- */

  let saveTimer = null;

  function flagSaved(ok) {
    const el = document.getElementById('saveStatus');
    if (!el) { return; }
    if (!store.durable) {
      el.textContent = 'Private browsing: your notes will not be kept after you close this tab.';
      return;
    }
    el.textContent = ok ? 'Saved on this device' : 'Could not save (storage full?)';
    if (saveTimer) { window.clearTimeout(saveTimer); }
    saveTimer = window.setTimeout(function () { el.textContent = ''; }, 2000);
  }

  /* ---------- wiring ---------- */

  function restoreAndBind() {
    document.querySelectorAll('textarea[id]').forEach(function (el) {
      const saved = store.get('notes:' + el.id);
      if (saved !== null) { el.value = saved; }
      let debounce = null;
      el.addEventListener('input', function () {
        if (debounce) { window.clearTimeout(debounce); }
        debounce = window.setTimeout(function () {
          flagSaved(store.set('notes:' + el.id, el.value));
        }, 400);
      });
    });

    document.querySelectorAll('input[type="checkbox"][id]').forEach(function (el) {
      if (store.get('check:' + el.id) === '1') { el.checked = true; }
      el.addEventListener('change', function () {
        flagSaved(store.set('check:' + el.id, el.checked ? '1' : '0'));
        updateProgress();
      });
    });

    document.querySelectorAll('.nav-button[data-unit]').forEach(function (button) {
      button.addEventListener('click', function () {
        showSection(button.dataset.unit);
      });
    });

    document.querySelectorAll('[data-scripture]').forEach(function (chip) {
      const ref = chip.dataset.scripture;
      chip.addEventListener('click', function () { showScriptureModal(ref); });
      chip.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          showScriptureModal(ref);
        }
      });
    });

    const closer = document.querySelector('.modal-close');
    if (closer) { closer.addEventListener('click', closeScriptureModal); }

    const top = document.querySelector('.back-to-top');
    if (top) {
      top.addEventListener('click', function () {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }

    const reset = document.getElementById('resetProgress');
    if (reset) {
      reset.addEventListener('click', function () {
        const warning = 'This clears every note and tick you have saved for this study on ' +
          'this device. It cannot be undone. Continue?';
        if (!window.confirm(warning)) { return; }
        store.clearStudy();
        document.querySelectorAll('textarea[id]').forEach(function (el) { el.value = ''; });
        document.querySelectorAll('input[type="checkbox"][id]').forEach(function (el) {
          el.checked = false;
        });
        updateProgress();
        const el = document.getElementById('saveStatus');
        if (el) { el.textContent = 'Cleared'; }
      });
    }
  }

  function toggleBackToTop() {
    const button = document.querySelector('.back-to-top');
    if (button) { button.classList.toggle('show', window.scrollY > 300); }
  }

  function openingUnit() {
    const fromHash = window.location.hash.replace('#', '');
    if (fromHash && document.getElementById(fromHash)) { return fromHash; }
    const saved = store.get('section');
    if (saved && document.getElementById(saved)) { return saved; }
    return null;
  }

  function start() {
    migrateLegacyKeys();
    restoreAndBind();
    updateProgress();

    const unit = openingUnit();
    if (unit) { showSection(unit, { scroll: false, silent: true }); }

    window.addEventListener('hashchange', function () {
      const id = window.location.hash.replace('#', '');
      if (id && document.getElementById(id)) { showSection(id, { silent: true }); }
    });

    window.addEventListener('scroll', toggleBackToTop);
    toggleBackToTop();

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeScriptureModal(); }
    });

    document.addEventListener('click', function (e) {
      const modal = document.getElementById('scriptureModal');
      if (modal && e.target === modal) { closeScriptureModal(); }
    });

    if (!store.durable) { flagSaved(false); }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
