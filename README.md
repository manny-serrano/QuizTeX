# QuizTeX

A Chrome extension that renders LaTeX equations on Quizlet. Quizlet stores math as raw LaTeX delimiters (`\( ... \)`, `$ ... $`) but doesn't render them — this extension uses MathJax 3 (SVG output) to display them as properly typeset formulas.

## Supported Modes

- Flashcards (flip + next/prev)
- Learn mode
- Match game (renders after tab switch; known limitation)
- Test mode
- Set/word list pages

## How It Works

The extension injects MathJax's `tex-svg.js` bundle as a content script. A `MutationObserver` detects DOM changes from Quizlet's React SPA (card switches, mode changes, navigation) and re-typesets new content automatically. SVG output is used instead of CHTML to avoid CSP restrictions on external font loading.

## Install

1. Clone or download this repo
2. Go to `chrome://extensions` and enable Developer Mode
3. Click "Load unpacked" and select the project folder

## Technical Notes

- `content.js` must load before `tex-svg.js` in the manifest so MathJax reads the config before initializing
- The observer is paused during typeset to prevent feedback loops from MathJax's own DOM mutations
- Uses synchronous `MathJax.typeset()` instead of `typesetPromise()` to avoid MathJax 3's internal promise-chain stalling
- A 500ms safety poll catches content that the observer misses
