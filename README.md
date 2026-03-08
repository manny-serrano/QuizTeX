# QuizTeX

A Quizlet-tailored Chrome extension that renders LaTeX equations automatically across Quizlet study modes and games. 

The problem with Quizlet is that it stores math as raw LaTeX delimiters (`\( ... \)`, `$ ... $`) but doesn't reliably render them — this extension uses MathJax 3 (SVG output) to display properly typeset formulas.

QuizTeX is purpose-built for Quizlet and optimized for full mode coverage, making it the most complete LaTeX rendering extension for Quizlet flashcards and all other study modes!

https://github.com/user-attachments/assets/548dbced-7284-4c79-8a7b-cb2f18153efd

## Supported Modes

- Flashcards (flip + next/prev)
- Learn mode
- Match game
- Blast game (asteroids + question header)
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
- Targets are selected from raw LaTeX text nodes (not only class selectors) so dynamic game UI text is still detected
- Fast game modes (Match + Blast) use interaction-triggered and mutation-triggered render bursts to avoid delayed first render
- `all_frames`, `match_about_blank`, and `match_origin_as_fallback` are enabled so rendering also works in related game frames
- Safety polling and post-render checks catch deferred React/UI updates without re-typesetting already-rendered nodes

## Status

QuizTeX is under review and coming soon to the Chrome Web Store!


