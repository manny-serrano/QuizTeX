# <img src="icon48.png" width="48" height="48" alt="QuizTeX" /> QuizTeX

A Quizlet-tailored Chrome extension that renders LaTeX equations automatically across Quizlet study modes and games. 

The problem with Quizlet is that it stores math as raw LaTeX delimiters (`\( ... \)`, `$ ... $`) but doesn't reliably render them — this extension uses MathJax 3 (SVG output) to display properly typeset formulas.

QuizTeX is purpose-built for Quizlet and optimized for full mode coverage, making it the most complete LaTeX rendering extension for Quizlet flashcards and all other study modes!

Chrome Web Store Link: https://chromewebstore.google.com/detail/ppljcggfeggnfoidkilaiepncfjiipaj?utm_source=item-share-cb 

# Click the thumbnail below to see QuizTeX in action!

[![Watch the video](https://img.youtube.com/vi/lJGdGS-ZKps/maxresdefault.jpg)](https://youtu.be/lJGdGS-ZKps)

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

Visit https://chromewebstore.google.com/detail/ppljcggfeggnfoidkilaiepncfjiipaj?utm_source=item-share-cb to add the extension in your Google Browser. You can also install it manually through the following steps:
1. Clone or download this repo
2. Go to `chrome://extensions` and enable Developer Mode
3. Click "Load unpacked" and select the project folder

## Usage Tips
QuizTeX automatically renders any LaTeX found on Quizlet, which is great for studying but can interfere when you're editing or importing flashcards, since the live rendering will reformat your LaTeX as you type.
To prevent the extension from auto-modifying your data while editing you can turn the extension off during editing then back on once you are ready to practice. You can also configure the extension to run only on demand:

- Select the More Options (three vertical dots) on the QuizTeX extension
- Select "This can read and change site data"
- Select "On quizlet.com"
- Select "This can read and change site data" again
- Select "When you click the extension"
- A popup will ask you to reload — click "Reload"
- 
Once configured this way, the extension will only render LaTeX when you manually click it, so your flashcard data stays untouched while you edit. When you're ready to view your cards with rendered LaTeX, simply click the extension and everything will typeset as expected.

⚠️ Skipping this step can cause data loss. If the extension is left in its default auto-run mode while you edit, it may reformat your raw LaTeX into something else, requiring you to manually fix each card.
Always turn off (or switch to click-only mode) before importing a study set or writing new LaTeX content, then re-enable when you're done.

## Technical Notes

- `content.js` must load before `tex-svg.js` in the manifest so MathJax reads the config before initializing
- The observer is paused during typeset to prevent feedback loops from MathJax's own DOM mutations
- Uses synchronous `MathJax.typeset()` instead of `typesetPromise()` to avoid MathJax 3's internal promise-chain stalling
- Targets are selected from raw LaTeX text nodes (not only class selectors) so dynamic game UI text is still detected
- Fast game modes (Match + Blast) use interaction-triggered and mutation-triggered render bursts to avoid delayed first render
- `all_frames`, `match_about_blank`, and `match_origin_as_fallback` are enabled so rendering also works in related game frames
- Safety polling and post-render checks catch deferred React/UI updates without re-typesetting already-rendered nodes

