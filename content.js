/**
 * Quizlet LaTeX Renderer v1.3 — content.js
 *
 * WHY THE OLD VERSION BROKE:
 * MathJax 3 marks every node it processes with data-mjx-* attributes and wraps
 * rendered output in <mjx-container> elements. Calling document.state(0) and
 * math.clear() alone is NOT enough — MathJax still sees the data-mjx-* attrs
 * on DOM nodes and skips them. Quizlet's React app replaces card DOM nodes on
 * every flip/mode change, but leftover mjx-container elements and attributes
 * from the previous card confuse MathJax into thinking the work is already done.
 *
 * THE FIX (fullReset):
 *   1. Reset MathJax document state to 0
 *   2. Clear the internal math item list
 *   3. Strip ALL data-mjx-* attributes from every element in the page
 *   4. Remove ALL <mjx-container> elements (old rendered output)
 * After this, MathJax treats the page as completely fresh.
 *
 * TRIGGERS: MutationObserver (debounced 80ms), popstate, hashchange,
 *           URL polling every 1500ms, initial render + 2s safety render.
 *
 * STAMPEDE PROTECTION: A lock prevents concurrent typesetPromise() calls.
 *           If a trigger fires mid-render, one follow-up cycle runs after.
 */
(function () {
  'use strict';

  // ── Prevent double-injection ────────────────────────────────────────────
  if (window.__qlLatex) return;
  window.__qlLatex = true;

  // ── MathJax config (must exist before MathJax initialises) ──────────────
  window.MathJax = {
    tex: {
      inlineMath:  [['\\(', '\\)'], ['$', '$']],
      displayMath: [['\\[', '\\]'], ['$$', '$$']],
      processEscapes: true
    },
    options: {
      skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code']
    },
    startup: {
      typeset: false
    }
  };

  // ── Quizlet selectors where card/question content lives ─────────────────
  var SELECTORS = [
    '[class*="CardSide"]',
    '[class*="flashcard"]',
    '[class*="TermText"]',
    '[class*="richText"]',
    '[class*="FormattedText"]',
    '[class*="questionText"]',
    '[class*="answerText"]',
    '[class*="WordText"]',
    '[class*="matchText"]',
    '[class*="learnSide"]',
    '[class*="word-list"]'
  ].join(',');

  // ── State ───────────────────────────────────────────────────────────────
  var isRendering   = false;
  var pendingRender = false;
  var lastUrl       = location.href;
  var debounceTimer = null;

  /**
   * fullReset — Completely wipe MathJax's internal caches.
   * This is the key fix: without steps 3 & 4, MathJax skips nodes it thinks
   * it already processed even though React replaced the actual DOM elements.
   */
  function fullReset() {
    try {
      var doc = MathJax.startup && MathJax.startup.document;
      if (!doc) return;

      // Step 1: Reset document processing state
      doc.state(0);

      // Step 2: Clear the math item list
      if (doc.math && typeof doc.math.clear === 'function') {
        doc.math.clear();
      } else if (doc.math && doc.math.list) {
        doc.math.list = [];
      }

      // Also try removing items individually (belt-and-suspenders)
      if (doc.math && typeof doc.math.toArray === 'function') {
        try {
          var items = doc.math.toArray();
          for (var i = items.length - 1; i >= 0; i--) {
            try { doc.math.remove(items[i]); } catch (_) {}
          }
        } catch (_) {}
      }
    } catch (_) {}

    // Step 3: Strip ALL data-mjx-* attributes from the DOM
    try {
      document.querySelectorAll('*').forEach(function (el) {
        var toRemove = [];
        for (var i = 0; i < el.attributes.length; i++) {
          if (el.attributes[i].name.indexOf('data-mjx') === 0) {
            toRemove.push(el.attributes[i].name);
          }
        }
        for (var j = 0; j < toRemove.length; j++) {
          el.removeAttribute(toRemove[j]);
        }
      });
    } catch (_) {}

    // Step 4: Remove all rendered MathJax output containers
    try {
      document.querySelectorAll('mjx-container').forEach(function (c) {
        c.remove();
      });
    } catch (_) {}
  }

  /** Get Quizlet card elements, or fall back to document.body */
  function getTargets() {
    var els = document.querySelectorAll(SELECTORS);
    return els.length ? Array.from(els) : [document.body];
  }

  /** Run a full reset + typeset cycle, with lock to prevent stampede */
  function render() {
    if (isRendering) {
      pendingRender = true;
      return;
    }
    if (!window.MathJax || !MathJax.typesetPromise) return;

    isRendering = true;
    fullReset();

    MathJax.typesetPromise(getTargets())
      .catch(function () {})
      .then(function () {
        isRendering = false;
        if (pendingRender) {
          pendingRender = false;
          render(); // exactly one follow-up cycle
        }
      });
  }

  /** Debounced render — batches rapid React mutations into one cycle */
  function scheduleRender() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(render, 80);
  }

  // ── MutationObserver ────────────────────────────────────────────────────
  function startObserver() {
    if (!document.body) {
      setTimeout(startObserver, 100);
      return;
    }
    new MutationObserver(function () {
      scheduleRender();
    }).observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  // ── SPA navigation listeners ────────────────────────────────────────────
  window.addEventListener('popstate', scheduleRender);
  window.addEventListener('hashchange', scheduleRender);

  // ── URL polling safety net (catches navigations events miss) ────────────
  setInterval(function () {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      scheduleRender();
    }
  }, 1500);

  // ── Boot sequence: wait for MathJax, then start everything ──────────────
  var bootCheck = setInterval(function () {
    if (window.MathJax && MathJax.typesetPromise) {
      clearInterval(bootCheck);
      render();                    // first render
      startObserver();             // start watching DOM
      setTimeout(render, 2000);   // safety render for late-loading content
    }
  }, 100);

})();
