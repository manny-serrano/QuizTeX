/**
 * Quizlet LaTeX Renderer v1.4 — content.js
 *
 * ROOT CAUSE OF v1.3 BUG (infinite observer feedback loop):
 *   MathJax's own DOM mutations — adding <mjx-container> elements during
 *   typesetPromise(), and removing them in fullReset() — were firing the
 *   MutationObserver. This created a cycle:
 *
 *     fullReset() removes <mjx-container>
 *       → observer fires → pendingRender = true
 *     typesetPromise() adds <mjx-container>
 *       → observer fires → pendingRender stays true
 *     .then() sees pendingRender → calls render() again
 *       → fullReset() removes freshly rendered containers
 *       → observer fires again → ...
 *
 *   During a card switch, React is also mutating the DOM simultaneously,
 *   making the feedback loop non-deterministic. The net result: rendered
 *   math gets torn down immediately after being built, leaving raw LaTeX.
 *
 * THE FIX:
 *   Disconnect the MutationObserver BEFORE fullReset() and typesetPromise(),
 *   then reconnect it AFTER the Promise resolves. MathJax's DOM mutations are
 *   invisible to the observer, breaking the feedback loop entirely.
 *
 * ADDITIONAL FIXES:
 *   - Patch history.pushState / replaceState — Quizlet uses these for SPA
 *     navigation (popstate does NOT fire on pushState calls, so the old code
 *     relied solely on 1500ms polling to catch mode switches).
 *   - Mutation filter in onMutation() — belt-and-suspenders guard against
 *     MathJax mutations that could slip through (e.g., during reconnect race).
 *   - Debounce raised to 150 ms — gives React more time to finish its
 *     reconciliation pass before we snapshot the DOM.
 *   - Broader SELECTORS — covers newer Quizlet class-name patterns.
 */
(function () {
  'use strict';

  // ── Prevent double-injection ─────────────────────────────────────────────
  if (window.__qlLatex) return;
  window.__qlLatex = true;

  // ── MathJax config (must exist before tex-chtml.js initialises) ──────────
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
      typeset: false   // we call typesetPromise() manually
    }
  };

  // ── Quizlet selectors — where card/question content lives ────────────────
  // Quizlet uses hashed/generated class names but always includes a stable
  // human-readable fragment. We match on that fragment with [class*=].
  var SELECTORS = [
    // Classic flashcard views
    '[class*="CardSide"]',
    '[class*="flashcard"]',
    '[class*="TermText"]',
    '[class*="richText"]',
    '[class*="FormattedText"]',
    // Learn / Test / Match modes
    '[class*="questionText"]',
    '[class*="answerText"]',
    '[class*="learnSide"]',
    '[class*="WordText"]',
    '[class*="matchText"]',
    // Word list / set page
    '[class*="word-list"]',
    // Newer Quizlet class name patterns (2024–2025 redesigns)
    '[class*="SetPageTerm"]',
    '[class*="studiable"]',
    '[class*="StudyModePage"]',
    '[class*="card-content"]',
    '[class*="term-definition"]',
    '[class*="TermDefinition"]',
    '[class*="NestableFlashcard"]',
    '[class*="LearnModeQuestion"]'
  ].join(',');

  var OBSERVE_CONFIG = { childList: true, subtree: true, characterData: true };

  // ── State ─────────────────────────────────────────────────────────────────
  var observer      = null;   // kept so we can disconnect/reconnect
  var isRendering   = false;
  var pendingRender = false;
  var lastUrl       = location.href;
  var debounceTimer = null;

  // ── fullReset ─────────────────────────────────────────────────────────────
  // Wipe MathJax's internal caches and all rendered output from the DOM so
  // the next typesetPromise() treats the page as completely fresh.
  // (Called while observer is disconnected, so DOM mutations don't re-trigger.)
  function fullReset() {
    try {
      var doc = MathJax.startup && MathJax.startup.document;
      if (!doc) return;

      doc.state(0);

      if (doc.math && typeof doc.math.clear === 'function') {
        doc.math.clear();
      } else if (doc.math && doc.math.list) {
        doc.math.list = [];
      }

      if (doc.math && typeof doc.math.toArray === 'function') {
        try {
          var items = doc.math.toArray();
          for (var i = items.length - 1; i >= 0; i--) {
            try { doc.math.remove(items[i]); } catch (_) {}
          }
        } catch (_) {}
      }
    } catch (_) {}

    // Strip all data-mjx-* attributes (MathJax uses these to detect already-
    // processed nodes; without removing them, MathJax silently skips them).
    try {
      document.querySelectorAll('*').forEach(function (el) {
        var toRemove = [];
        for (var i = 0; i < el.attributes.length; i++) {
          if (el.attributes[i].name.indexOf('data-mjx') === 0) {
            toRemove.push(el.attributes[i].name);
          }
        }
        toRemove.forEach(function (a) { el.removeAttribute(a); });
      });
    } catch (_) {}

    // Remove all rendered MathJax output containers.
    try {
      document.querySelectorAll('mjx-container').forEach(function (c) {
        c.remove();
      });
    } catch (_) {}
  }

  // ── getTargets ────────────────────────────────────────────────────────────
  function getTargets() {
    var els = document.querySelectorAll(SELECTORS);
    return els.length ? Array.from(els) : [document.body];
  }

  // ── Observer pause / resume ───────────────────────────────────────────────
  function pauseObserver() {
    if (observer) observer.disconnect();
  }

  function resumeObserver() {
    if (observer && document.body) {
      observer.observe(document.body, OBSERVE_CONFIG);
    }
  }

  // ── render ────────────────────────────────────────────────────────────────
  function render() {
    if (isRendering) {
      pendingRender = true;
      return;
    }
    if (!window.MathJax || !MathJax.typesetPromise) return;

    isRendering   = true;
    pendingRender = false;

    // KEY FIX: Disconnect so MathJax's own DOM mutations (adding/removing
    // mjx-container elements) don't fire the observer and re-trigger render().
    pauseObserver();
    fullReset();

    MathJax.typesetPromise(getTargets())
      .catch(function () {})
      .then(function () {
        isRendering = false;
        // Re-attach observer AFTER render is fully done — any Quizlet DOM
        // changes that happen from this point onward will be caught.
        resumeObserver();

        if (pendingRender) {
          // Something changed while we were rendering (e.g., React finished a
          // card swap mid-typesetPromise). Schedule exactly one follow-up cycle.
          pendingRender = false;
          scheduleRender();
        }
      });
  }

  // ── scheduleRender ────────────────────────────────────────────────────────
  // 150 ms gives React's reconciliation a comfortable window to finish before
  // we snapshot the DOM. Adjust down if renders feel sluggish on slow machines.
  function scheduleRender() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(render, 150);
  }

  // ── Mutation filter ───────────────────────────────────────────────────────
  // Belt-and-suspenders: even with the pause/resume approach, guard against
  // MathJax mutations slipping through during the brief reconnect window.
  function isMathJaxNode(node) {
    if (!node || !node.nodeName) return false;
    return node.nodeName.toLowerCase().indexOf('mjx-') === 0;
  }

  function onMutation(mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var m = mutations[i];

      // Skip mutations whose target is a MathJax element.
      if (isMathJaxNode(m.target)) continue;

      // Skip batches where every changed node is a MathJax element.
      var changed = Array.from(m.addedNodes).concat(Array.from(m.removedNodes));
      if (changed.length > 0 && changed.every(isMathJaxNode)) continue;

      // A real content change — schedule a render and stop scanning mutations.
      scheduleRender();
      return;
    }
  }

  // ── MutationObserver ──────────────────────────────────────────────────────
  function startObserver() {
    if (!document.body) {
      setTimeout(startObserver, 100);
      return;
    }
    observer = new MutationObserver(onMutation);
    observer.observe(document.body, OBSERVE_CONFIG);
  }

  // ── SPA navigation listeners ──────────────────────────────────────────────
  // popstate fires on browser back/forward but NOT on history.pushState calls.
  // Quizlet uses pushState for every card-mode switch, so we must patch it.
  function patchHistoryMethod(method) {
    var orig = history[method].bind(history);
    history[method] = function () {
      orig.apply(this, arguments);
      scheduleRender();
    };
  }
  try {
    patchHistoryMethod('pushState');
    patchHistoryMethod('replaceState');
  } catch (_) {}

  window.addEventListener('popstate',   scheduleRender);
  window.addEventListener('hashchange', scheduleRender);

  // URL polling — final safety net for any navigation that slips through all
  // of the above (e.g., iframes, custom router events, browser extensions).
  setInterval(function () {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      scheduleRender();
    }
  }, 1500);

  // ── Boot sequence ─────────────────────────────────────────────────────────
  // tex-chtml.js loads asynchronously; poll until MathJax is ready.
  var bootCheck = setInterval(function () {
    if (window.MathJax && MathJax.typesetPromise) {
      clearInterval(bootCheck);
      render();                   // initial render
      startObserver();            // start watching for DOM changes
      setTimeout(render, 2000);  // safety render for late-loading card content
    }
  }, 100);

})();
