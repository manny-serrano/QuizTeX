/**
 * Quizlet LaTeX Renderer v2.0 — content.js
 *
 * LOAD ORDER: This file MUST load BEFORE tex-svg.js in the manifest.
 *
 * KEY DESIGN DECISIONS:
 *   - SVG output (tex-svg.js): renders math as vector paths, no external
 *     font files needed, immune to CSP restrictions.
 *   - Synchronous MathJax.typeset(): avoids MathJax 3 promise-chain issues.
 *   - Never removes <mjx-container>: MathJax consumes source text on render.
 *   - Observer paused during typeset to prevent feedback loops.
 *   - Double-requestAnimationFrame scheduling: ensures React has committed
 *     its current render before we typeset. Without this, React's follow-up
 *     re-renders (game state init, timer, layout effects) overwrite our
 *     typeset output before it ever paints.
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
  var rafId1        = null;
  var rafId2        = null;

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

    if (canSync) {
      try {
        MathJax.typeset(targets);
      } catch (_) {}
      renderDone();
      return;
    }

    try {
      if (MathJax.startup && MathJax.startup.promise) {
        MathJax.startup.promise = MathJax.startup.promise.catch(function () {});
      }
    } catch (_) {}

    MathJax.typesetPromise(targets)
      .catch(function () {})
      .then(renderDone);
  }

  // ── scheduleRender ────────────────────────────────────────────────────────
  // Double-rAF: debounce rapid mutations (100 ms), then wait TWO animation
  // frames before running typeset. This ensures React has finished its
  // commit phase and all useLayoutEffect / componentDidUpdate callbacks have
  // run. Without this, React's follow-up renders overwrite our output.
  function cancelScheduled() {
    if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
    if (rafId1) { cancelAnimationFrame(rafId1); rafId1 = null; }
    if (rafId2) { cancelAnimationFrame(rafId2); rafId2 = null; }
  }

  function scheduleRender() {
    cancelScheduled();
    debounceTimer = setTimeout(function () {
      debounceTimer = null;
      rafId1 = requestAnimationFrame(function () {
        rafId1 = null;
        rafId2 = requestAnimationFrame(function () {
          rafId2 = null;
          render();
        });
      });
    }, 100);
  }

  // Also provide an immediate render for boot and tab-return scenarios.
  function renderNow() {
    cancelScheduled();
    render();
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

  // Poll every 300 ms — fast enough to catch match-game tiles that appear
  // after the initial render without noticeable battery impact.
  setInterval(function () {
    if (!isRendering && hasUnrenderedMath()) {
      scheduleRender();
    }
  }, 300);

  // ── Tab visibility / focus ────────────────────────────────────────────────
  // The match game works after a tab switch because React's rAF loop pauses
  // in background tabs and the DOM is settled when you return. Replicate that
  // "settled DOM" effect by rendering on every visibility/focus restoration.
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) scheduleRender();
  });
  window.addEventListener('focus', scheduleRender);

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
      renderNow();
      startObserver();
      // Staggered safety renders to catch async content (match game tiles,
      // learn-mode questions, lazy-loaded card content).
      setTimeout(scheduleRender, 500);
      setTimeout(scheduleRender, 1000);
      setTimeout(scheduleRender, 2000);
      setTimeout(scheduleRender, 4000);
    }
  }, 100);

})();
