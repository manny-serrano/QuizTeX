/**
 * Quizlet LaTeX Renderer v1.6 — content.js
 *
 * CRITICAL: This file MUST load BEFORE tex-chtml.js in the manifest.
 * MathJax 3 reads window.MathJax for config at initialization. If tex-chtml.js
 * loads first, it initializes with defaults and attaches its API (typesetPromise,
 * startup, etc.) to window.MathJax. Then this script overwrites that object with
 * a plain config literal, destroying every API method. All subsequent render()
 * calls silently bail out because MathJax.typesetPromise is undefined.
 *
 * With the correct order (content.js → tex-chtml.js):
 *   1. This script sets window.MathJax = { config... }
 *   2. tex-chtml.js reads that config and ADDS its runtime API to the same object
 *   3. window.MathJax now has both our config and MathJax's methods
 */
(function () {
  'use strict';

  if (window.__qlLatex) return;
  window.__qlLatex = true;

  // ── MathJax config — set BEFORE tex-chtml.js reads it ─────────────────────
  window.MathJax = {
    tex: {
      inlineMath:  [['\\(', '\\)'], ['$', '$']],
      displayMath: [['\\[', '\\]'], ['$$', '$$']],
      processEscapes: true
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
    '[class*="LearnModeQuestion"]'
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

  // ── fullReset ─────────────────────────────────────────────────────────────
  function fullReset() {
    // Use the official MathJax 3 API to clear typeset state (available 3.0+).
    try {
      if (typeof MathJax.typesetClear === 'function') {
        MathJax.typesetClear();
      }
    } catch (_) {}

    // Remove all rendered MathJax output from the DOM.
    try {
      document.querySelectorAll('mjx-container').forEach(function (c) {
        c.remove();
      });
    } catch (_) {}

    // Strip data-mjx-* attributes so MathJax doesn't skip re-processing nodes.
    try {
      var tagged = document.querySelectorAll('[data-mjx-texclass],[data-mjx-alternate]');
      tagged.forEach(function (el) {
        var toRemove = [];
        for (var i = 0; i < el.attributes.length; i++) {
          if (el.attributes[i].name.indexOf('data-mjx') === 0) {
            toRemove.push(el.attributes[i].name);
          }
        }
        toRemove.forEach(function (a) { el.removeAttribute(a); });
      });
    } catch (_) {}
  }

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
    fullReset();

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
  var MATH_RE = /\\\(|\\\[|\$\$?/;

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
  // tex-chtml.js loads after this file (per manifest order) and adds
  // typesetPromise to the window.MathJax object we created above.
  var bootCheck = setInterval(function () {
    if (window.MathJax && MathJax.typesetPromise) {
      clearInterval(bootCheck);
      render();
      startObserver();
      setTimeout(render, 2000);
    }
  }, 100);

})();
