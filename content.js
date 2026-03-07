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

  var MATCH_GAME_SELECTOR = '[class*="MatchModeQuestionGridBoard"], [class*="MatchModeQuestionScatterBoard"], [class*="MatchModeQuestionGridTile"]';

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
  var debounceTimer     = null;
  var matchGameBurstTimer = null;

  // ── helpers ───────────────────────────────────────────────────────────────
  function isMatchGameActive() {
    return document.body && document.body.querySelector(MATCH_GAME_SELECTOR);
  }

  function isLikelyMatchModeRoute() {
    var href = String(location.href || '').toLowerCase();
    return href.indexOf('/match') !== -1;
  }

  function getTargets() {
    var results = [];
    function collect(root) {
      try {
        var els = root.querySelectorAll(SELECTORS);
        for (var i = 0; i < els.length; i++) results.push(els[i]);
        var hosts = root.querySelectorAll('*');
        for (var i = 0; i < hosts.length; i++) {
          if (hosts[i].shadowRoot) collect(hosts[i].shadowRoot);
        }
      } catch (_) {}
    }
    if (document.body) collect(document.body);
    return results.length ? results : [document.body];
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
      return;
    }
    // Match game and similar modes often add content in the next animation frame.
    // Run a quick rAF check to catch deferred DOM updates we might have missed.
    requestAnimationFrame(function () {
      if (!isRendering && hasUnrenderedMath()) {
        scheduleRender();
      }
    });
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

    // Clear MathJax's internal record so it won't throw "already typeset"
    // when the same container (e.g. document.body) is re-scanned. Already-
    // rendered SVGs stay in the DOM; only new raw LaTeX gets processed.
    try {
      if (typeof MathJax.typesetClear === 'function') {
        MathJax.typesetClear(targets);
      }
    } catch (_) {}

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
    var inMatchFlow = isMatchGameActive() || isLikelyMatchModeRoute();
    var delay = inMatchFlow ? 30 : 150;

    // In match mode, avoid starvation from continuous mutations by not
    // repeatedly resetting an already-scheduled render.
    if (debounceTimer) {
      if (inMatchFlow) return;
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(function () {
      debounceTimer = null;
      render();
    }, delay);
  }

  // Run immediate render + staggered follow-ups for match game (content appears
  // when user clicks Start, often in stages; debounce alone is too slow).
  function matchGameBurst() {
    if (matchGameBurstTimer) clearTimeout(matchGameBurstTimer);
    matchGameBurstTimer = setTimeout(function () {
      matchGameBurstTimer = null;
      if (!isMatchGameActive() && !isLikelyMatchModeRoute()) return;
      render();
      setTimeout(function () { if (hasUnrenderedMath()) scheduleRender(); }, 80);
      setTimeout(function () { if (hasUnrenderedMath()) scheduleRender(); }, 250);
      setTimeout(function () { if (hasUnrenderedMath()) scheduleRender(); }, 500);
      setTimeout(function () { if (hasUnrenderedMath()) scheduleRender(); }, 900);
      setTimeout(function () { if (hasUnrenderedMath()) scheduleRender(); }, 1500);
    }, 0);
  }

  // ── Mutation filter ───────────────────────────────────────────────────────
  function mutationAffectsMatchGame(m) {
    if (m.addedNodes && m.addedNodes.length > 0) {
      for (var i = 0; i < m.addedNodes.length; i++) {
        var n = m.addedNodes[i];
        if (n.nodeType !== 1) continue;
        if (n.querySelector && n.querySelector(MATCH_GAME_SELECTOR)) return true;
        if (n.matches && n.matches(MATCH_GAME_SELECTOR)) return true;
      }
    }
    var el = m.target.nodeType === 1 ? m.target : (m.target.parentElement || m.target);
    while (el && el !== document.body) {
      if (el.matches && el.matches(MATCH_GAME_SELECTOR)) return true;
      el = el.parentElement;
    }
    return false;
  }

  function onMutation(mutations) {
    var sawMatchGame = false;
    for (var i = 0; i < mutations.length; i++) {
      var m = mutations[i];

      if (m.type === 'attributes') {
        if (m.attributeName && m.attributeName.indexOf('data-mjx') === 0) continue;
        if (isMathJaxNode(m.target)) continue;
        scheduleRender();
        if (mutationAffectsMatchGame(m)) sawMatchGame = true;
        continue;
      }

      if (isMathJaxNode(m.target)) continue;

      var changed = Array.from(m.addedNodes).concat(Array.from(m.removedNodes));
      if (changed.length > 0 && changed.every(isMathJaxNode)) continue;

      if (mutationAffectsMatchGame(m)) sawMatchGame = true;
      scheduleRender();
    }
    if (sawMatchGame) matchGameBurst();
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
    function walk(root) {
      try {
        var walker = document.createTreeWalker(
          root, NodeFilter.SHOW_TEXT, null, false
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
        var hosts = root.querySelectorAll('*');
        for (var i = 0; i < hosts.length; i++) {
          if (hosts[i].shadowRoot && walk(hosts[i].shadowRoot)) return true;
        }
      } catch (_) {}
      return false;
    }
    return walk(document.body);
  }

  setInterval(function () {
    if (!isRendering && hasUnrenderedMath()) {
      scheduleRender();
    }
  }, 500);

  // Match game: poll every 100ms when active (board appears on Start click,
  // often after boot; 500ms is too slow for initial render).
  setInterval(function () {
    if (isMatchGameActive() && !isRendering && hasUnrenderedMath()) {
      scheduleRender();
    }
  }, 100);

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

  // Start button interaction in match mode can happen before the board tiles
  // are fully mounted. Kick a burst on user interaction to catch first paint.
  document.addEventListener('pointerup', function () {
    if (isLikelyMatchModeRoute() || isMatchGameActive()) {
      matchGameBurst();
    }
  }, true);

  // Tab visibility: match game (and other modes) often defer DOM updates until
  // the tab is focused — requestAnimationFrame doesn't run when hidden.
  // When the user switches back, run staggered renders to catch newly painted content.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      scheduleRender();
      setTimeout(scheduleRender, 50);
      setTimeout(scheduleRender, 200);
      setTimeout(scheduleRender, 500);
    }
  });

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
      // Staggered renders catch match game and other modes that load content
      // asynchronously or defer DOM updates to requestAnimationFrame.
      setTimeout(scheduleRender, 500);
      setTimeout(scheduleRender, 1000);
      setTimeout(scheduleRender, 2000);
      setTimeout(scheduleRender, 3500);
    }
  }, 100);

})();
