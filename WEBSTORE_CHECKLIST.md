# Chrome Web Store Launch Checklist

## Package Ready

- [x] Manifest version: MV3
- [x] Extension icons declared (`16`, `48`, `128`)
- [x] Version bumped to `1.10.0`
- [x] Unused broad permission removed (`scripting`)
- [x] Privacy policy file added (`PRIVACY.md`)

## Suggested Store Listing Text

### Name
Quizlet LaTeX Renderer

### Short description
Render LaTeX equations on Quizlet automatically in Flashcards, Learn, Match, Blast, and Test modes.

### Detailed description
Quizlet LaTeX Renderer automatically typesets raw LaTeX expressions on Quizlet using MathJax SVG output.

It supports:
- Flashcards
- Learn mode
- Match
- Blast
- Test
- Set/word list pages

The extension runs only on Quizlet pages and does not collect or transmit personal data.

### Category
Productivity (or Education)

### Privacy policy
Publish `PRIVACY.md` at a public URL and paste that URL into the Web Store privacy field.

## Web Store Images You Need

- App icon: 128x128 (already in repo)
- Small tile: 440x280
- Marquee: 1400x560
- At least 1 screenshot (1280x800 or 640x400)

## Permissions Justification

- Host access to `https://*.quizlet.com/*` is required so content scripts can render LaTeX where Quizlet shows study material and game UIs.

## Final Pre-Submit Steps

1. Upload the generated zip from `dist/`.
2. Fill listing content and upload images.
3. Add support URL (GitHub repo or project page).
4. Add privacy policy URL.
5. Submit for review.
