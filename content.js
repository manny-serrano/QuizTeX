/**
 * Quizlet LaTeX Renderer v1.5 — content.js
 *
 * ── v1.4 fix (still in place) ───────────────────────────────────────────────
 *   MathJax's own DOM mutations (adding/removing <mjx-container> elements)
 *   were firing the MutationObserver and creating an infinite render loop.
 *   Fix: disconnect the observer before fullReset+typesetPromise, reconnect
 *   after the Promise resolves.
 *
 * ── v1.5 fix ────────────────────────────────────────────────────────────────
 *   "Next card works, flip works, but next card doesn't render LaTeX."
 *
 *   Root cause: Quizlet advances cards by toggling CSS classes / aria-hidden
 *   attributes on card container elements — these are ATTRIBUTE mutations.
 *   The v1.4 observer only watched childList + characterData, so it missed
 *   these transitions entirely, and MathJax was never told to re-run.
 *
 *   Fix A — attribute watching:
 *     Add `attributes: true` + `attributeFilter: ['class','aria-hidden','hidden']`
 *     to the observer config. Now class toggles and aria-hidden flips that
 *     reveal a new card surface are caught immediately.
 *
 *   Fix B — unrendered-math safety poll (500 ms):
 *     Walk the visible DOM every 500 ms; if any text node contains a LaTeX
 *     delimiter that is NOT inside a <mjx-container>, schedule a render.
 *     This is the belt-and-suspenders catch-all for any transition mechanism
 *     the observer still misses (custom events, requestAnimationFrame swaps,
 *     inline-style opacity changes, etc.).
 */
(function () {
  'use strict';

  // ── Prevent double-injection ─────────────────────────────────────────────
  if (window.__qlLatex) return;
  window.__qlLatex = true;

  // ── MathJax config ────────────────────────────────────────────────────────
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

  // ── Observer config ───────────────────────────────────────────────────────
  // attributes: true catches class / aria-hidden toggles that reveal new cards.
  // attributeFilter limits scope so we aren't flooded by every attribute change.
  var OBSERVE_CONFIG = {
    childList:     true,
    subtree:       true,
    characterData: true,
    attributes:    true,
    attributeFilter: ['class', 'aria-hidden', 'hidden', 'style']
  };

  // ── State ─────────────────────────────────────────────────────────────────
  var observer      = null;
  var isRendering   = false;
  var pendingRender = false;
  var lastUrl       = location.href;
  var debounceTimer = null;

  // ── fullReset ─────────────────────────────────────────────────────────────
  // Called while observer is disconnected, so DOM mutations don't re-trigger.
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

    try {
      document.querySelectorAll('mjx-container').forEach(function (c) {
        c.remove();
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

    pauseObserver();   // stop observer so MathJax's own DOM writes don't re-trigger
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

      // Skip MathJax-originated attribute writes (data-mjx-* won't appear
      // here because of attributeFilter, but guard for safety).
      if (m.type === 'attributes') {
        if (m.attributeName && m.attributeName.indexOf('data-mjx') === 0) continue;
        if (isMathJaxNode(m.target)) continue;
        // Any other attribute change on a real element → render.
        scheduleRender();
        return;
      }

      // For childList / characterData: skip if target or all changed nodes
      // are MathJax elements.
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
  // Catches card transitions the observer can't see: inline-style opacity
  // swaps, requestAnimationFrame-based reveals, custom event transitions, etc.
  // A TreeWalker is used (not innerHTML search) so we only visit text nodes
  // and can quickly check their ancestor chain.
  var MATH_RE = /\\\(|\\\[|\$\$?/;

  function hasUnrenderedMath() {
    if (!document.body) return false;
    try {
      var walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null,
        false
      );
      var node;
      while ((node = walker.nextNode())) {
        if (!MATH_RE.test(node.nodeValue)) continue;
        // Confirm this text node is not already inside an mjx-container.
        var el = node.parentElement;
        var rendered = false;
        while (el) {
          if (isMathJaxNode(el)) { rendered = true; break; }
          el = el.parentElement;
        }
        if (!rendered) return true;
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
  // Patch pushState / replaceState — popstate does NOT fire on these calls.
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

  // URL polling — final fallback for anything the above misses.
  setInterval(function () {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      scheduleRender();
    }
  }, 1500);

  // ── Boot sequence ─────────────────────────────────────────────────────────
  var bootCheck = setInterval(function () {
    if (window.MathJax && MathJax.typesetPromise) {
      clearInterval(bootCheck);
      render();
      startObserver();
      setTimeout(render, 2000);
    }
  }, 100);

})();
