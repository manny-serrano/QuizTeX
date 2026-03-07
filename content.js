/**
 * Quizlet LaTeX Renderer v1.9 — content.js
 *
 * LOAD ORDER: This file MUST load BEFORE tex-svg.js in the manifest.
 *
 * KEY DESIGN DECISIONS:
 *   - SVG output (tex-svg.js): renders math as vector paths, no external
 *     font files needed, immune to CSP restrictions.
 *   - Synchronous MathJax.typeset(): avoids a critical MathJax 3 bug where
 *     typesetPromise()'s internal promise chain breaks permanently if any
 *     call rejects. typeset() uses try/catch instead — no chain to break.
 *   - Never removes <mjx-container> elements: MathJax consumes source text
 *     when rendering; deleting containers leaves blank space.
 *   - Observer paused during typeset to prevent feedback loops.
 */
(function () {
  'use strict';

  if (window.__qlLatex) return;
  window.__qlLatex = true;

  // ── MathJax config — set BEFORE tex-svg.js reads it ───────────────────────
  window.MathJax = {
    tex: {
      inlineMath:  [['\\(', '\\)'], ['$', '$']],
      displayMath: [['\\[', '\\]'], ['$$', '$$']],
      processEscapes: true
    },
    svg: {
      fontCache: 'local'
    },
    options: {
      skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code']
    },
    startup: { typeset: false }
  };

  // ── Quizlet selectors ─────────────────────────────────────────────────────
  var SELECTORS = [
    '[class*="CardSide"]',
    '[class*="flashcard"]',
    '[class*="TermText"]',
    '[class*="richText"]',
    '[class*="FormattedText"]',
    '[class*="questionText"]',
    '[class*="answerText"]',
    '[class*="learnSide"]',
    '[class*="WordText"]',
    '[class*="matchText"]',
    '[class*="word-list"]',
    '[class*="SetPageTerm"]',
    '[class*="studiable"]',
    '[class*="StudyModePage"]',
    '[class*="card-content"]',
    '[class*="term-definition"]',
    '[class*="TermDefinition"]',
    '[class*="NestableFlashcard"]',
    '[class*="LearnModeQuestion"]',
    '[class*="MatchMode"]',
    '[class*="MatchModeQuestionGridTile"]',
    '[class*="MatchModeQuestionGridBoard"]',
    '[class*="MatchModeQuestionScatterBoard"]',
    '[class*="GravityMode"]',
    '[class*="GameTile"]',
    '[class*="game-tile"]'
  ].join(',');

  var OBSERVE_CONFIG = {
    childList:       true,
    subtree:         true,
    characterData:   true,
    attributes:      true,
    attributeFilter: ['class', 'aria-hidden', 'hidden', 'style']
  };

  // ── State ─────────────────────────────────────────────────────────────────
  var observer      = null;
  var isRendering   = false;
  var pendingRender = false;
  var lastUrl       = location.href;
  var debounceTimer = null;

  // ── helpers ───────────────────────────────────────────────────────────────
  function getTargets() {
    var els = document.querySelectorAll(SELECTORS);
    return els.length ? Array.from(els) : [document.body];
  }

  function isMathJaxNode(node) {
    if (!node || !node.nodeName) return false;
    var name = node.nodeName.toLowerCase();
    return name.indexOf('mjx-') === 0 || name === 'svg';
  }

  function pauseObserver() {
    if (observer) observer.disconnect();
  }

  function resumeObserver() {
    if (observer && document.body) {
      observer.observe(document.body, OBSERVE_CONFIG);
    }
  }

  // ── render ────────────────────────────────────────────────────────────────
  function renderDone() {
    isRendering = false;
    resumeObserver();
    if (pendingRender) {
      pendingRender = false;
      scheduleRender();
    }
  }

  function render() {
    if (isRendering) {
      pendingRender = true;
      return;
    }
    if (!window.MathJax) return;

    var canSync  = typeof MathJax.typeset === 'function';
    var canAsync = typeof MathJax.typesetPromise === 'function';
    if (!canSync && !canAsync) return;

    isRendering   = true;
    pendingRender = false;
    pauseObserver();

    var targets = getTargets();

    // Prefer synchronous typeset — immune to the MathJax 3 promise-chain
    // bug where a single rejection permanently stalls all future calls.
    if (canSync) {
      try {
        MathJax.typeset(targets);
      } catch (_) {}
      renderDone();
      return;
    }

    // Async fallback: repair the internal promise chain before appending.
    try {
      if (MathJax.startup && MathJax.startup.promise) {
        MathJax.startup.promise = MathJax.startup.promise.catch(function () {});
      }
    } catch (_) {}

    MathJax.typesetPromise(targets)
      .catch(function () {})
      .then(renderDone);
  }

  function scheduleRender() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(render, 150);
  }

  // ── Mutation filter ───────────────────────────────────────────────────────
  function onMutation(mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var m = mutations[i];

      if (m.type === 'attributes') {
        if (m.attributeName && m.attributeName.indexOf('data-mjx') === 0) continue;
        if (isMathJaxNode(m.target)) continue;
        scheduleRender();
        return;
      }

      if (isMathJaxNode(m.target)) continue;

      var changed = Array.from(m.addedNodes).concat(Array.from(m.removedNodes));
      if (changed.length > 0 && changed.every(isMathJaxNode)) continue;

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

  // ── Unrendered-math safety poll ───────────────────────────────────────────
  var MATH_RE = /\\\(|\\\[|\$\$/;

  function hasUnrenderedMath() {
    if (!document.body) return false;
    try {
      var walker = document.createTreeWalker(
        document.body, NodeFilter.SHOW_TEXT, null, false
      );
      var node;
      while ((node = walker.nextNode())) {
        if (!MATH_RE.test(node.nodeValue)) continue;
        var el = node.parentElement;
        var inside = false;
        while (el) {
          if (isMathJaxNode(el)) { inside = true; break; }
          el = el.parentElement;
        }
        if (!inside) return true;
      }
    } catch (_) {}
    return false;
  }

  setInterval(function () {
    if (!isRendering && hasUnrenderedMath()) {
      scheduleRender();
    }
  }, 500);

  // ── SPA navigation listeners ──────────────────────────────────────────────
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

  setInterval(function () {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      scheduleRender();
    }
  }, 1500);

  // ── Boot ──────────────────────────────────────────────────────────────────
  var bootCheck = setInterval(function () {
    if (window.MathJax && (MathJax.typeset || MathJax.typesetPromise)) {
      clearInterval(bootCheck);
      render();
      startObserver();
      setTimeout(render, 2000);
    }
  }, 100);

})();
