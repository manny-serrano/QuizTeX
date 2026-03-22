# Reference study set — LaTeX coverage

This file tracks a **Diffusion / GAN / latent-variable** Quizlet set used to validate QuizTeX.  
Goal: every delimiter-wrapped expression should typeset with the **bundled** `tex-svg.js` (no extra network loads).

## MathJax configuration (see `content.js`)

| Mechanism | Purpose |
|-----------|---------|
| Default `tex-svg` stack | `ams`, `newcommand`, `textmacros`, `autoload`, etc. — provides `\dfrac`, `\mathbb`, `\mathcal`, `\text{…}`, `\sum`, `\prod`, `\sqrt`, `\log`, `\min`, `\max`, `\cdots`, `\to`, `\|`, environments |
| `tex.macros.boldsymbol` → `\mathbf{#1}` | Same visual as AMS `\boldsymbol` without loading `boldsymbol.js` (Quizlet CSP blocks that script) |
| `inlineMath` `$…$` / `\(...\)` | Quizlet-style inline math |
| SVG false-positive fix | Card text inside `<svg><foreignObject>` is typeset (see README Technical Notes) |

## Commands appearing in the reference set

- **Vectors / bold**: `\mathbf{z}`, `\mathbf{w}`, `\mathbf{x}`, `\mathbf{0}`, `\mathbf{I}`
- **Bold Greek (macro `\boldsymbol` → `\mathbf`)**: `\boldsymbol{\epsilon}`
- **Blackboard bold**: `\mathbb{E}`
- **Calligraphic**: `\mathcal{N}`, `\mathcal{L}`
- **Operators / calculus**: `\min`, `\max`, `\log`, `\sum`, `\prod`, `\sqrt`, `\frac`, `\dfrac`
- **Delimiters / norms**: `\left(`, `\right)`, `\| … \|`
- **Arrows / relations**: `\to`, `\approx`, `<`, `>`
- **Spacing / ellipsis**: `\,`, `\cdots`
- **Sub/superscripts**: `\theta_G`, `\theta_D`, `\beta_t`, `\bar{\alpha}_t`, `\tau`, `T`, etc.
- **Text inside math**: `C_{\text{out}}`, subscripts like `\text{out}`

## Plain text (not LaTeX)

QuizTeX does not change these — they stay as normal text:

- Middle dot in product names (e.g. “DALL·E”)
- Multiplication sign in prose (e.g. “4×4×1024”)
- Punctuation outside `$…$`

## Manual smoke test

1. Load the extension (reload on `chrome://extensions`).
2. Open the set in **Flashcards**, **Test**, **Match**, and **Blast**.
3. Confirm cards that use `\boldsymbol{\epsilon}` and long GAN / diffusion equations render fully (no red unknown-command fragments).

If a **new** macro fails (rare), prefer defining it under `tex.macros` in `content.js` so nothing is fetched from the network. Avoid `tex.packages['[+]']` for extensions that aren’t already inlined in `tex-svg.js` — Quizlet’s CSP blocks those script loads and can break **all** rendering.
