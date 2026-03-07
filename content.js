/**
 * Quizlet LaTeX Renderer v1.8 — content.js
 *
 * LOAD ORDER: This file MUST load BEFORE tex-svg.js in the manifest.
 * It sets window.MathJax config; tex-svg.js reads it and adds its API
 * to the same object.
 *
 * RENDERING STRATEGY:
 *   MathJax 3 is destructive — it REPLACES source text nodes (\( x^2 \))
 *   with <mjx-container> elements. The original text is gone. If you remove
 *   the mjx-container, you get blank space — there's nothing left to re-render.
 *
 *   Therefore we NEVER remove mjx-containers. Instead:
 *     1. Call MathJax.typesetClear() to reset the internal state machine
 *        (so MathJax will re-run findMath on the next typesetPromise call)
 *     2. Call MathJax.typesetPromise(targets) — MathJax scans for text nodes
 *        containing math delimiters. Already-rendered math has no text nodes
 *        (they were consumed), so MathJax only finds and processes NEW content
 *        from card switches. Existing rendered math is untouched.
 *
 *   This makes re-rendering idempotent: calling render() extra times is
 *   harmless — MathJax scans, finds nothing new, and returns.
 */
(function () {
  'use strict';

  if (window.__qlLatex) return;
  window.__qlLatex = true;

  // ── MathJax config — set BEFORE tex-svg.js reads it ────────────────────────
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
    // Match / Scatter game modes
    '[class*="MatchModeQuestionGridTile"]',
    '[class*="MatchModeQuestionGridBoard"]',
    '[class*="MatchModeQuestionScatterBoard"]',
    '[class*="MatchMode"]',
    // Gravity mode
    '[class*="GravityMode"]',
    // Generic game containers
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
    return node.nodeName.toLowerCase().indexOf('mjx-') === 0;
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
  function render() {
    if (isRendering) {
      pendingRender = true;
      return;
    }
    if (!window.MathJax || !MathJax.typesetPromise) return;

    isRendering   = true;
    pendingRender = false;

    pauseObserver();

    // Reset MathJax's internal state machine so findMath() re-scans the DOM.
    // DO NOT remove <mjx-container> elements — MathJax consumed the source
    // text when it created them; removing them leaves blank space.
    try {
      if (typeof MathJax.typesetClear === 'function') {
        MathJax.typesetClear();
      }
    } catch (_) {}

    MathJax.typesetPromise(getTargets())
      .catch(function () {})
      .then(function () {
        isRendering = false;
        resumeObserver();

        if (pendingRender) {
          pendingRender = false;
          scheduleRender();
        }
      });
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
  // Uses \( and \[ and $$ but NOT single $ (too many false positives from
  // currency strings like "$5.99" in Quizlet's UI).
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
    if (window.MathJax && MathJax.typesetPromise) {
      clearInterval(bootCheck);
      render();
      startObserver();
      setTimeout(render, 2000);
    }
  }, 100);

})();
