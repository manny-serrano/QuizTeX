# Chrome Web Store — submission package for QuizTeX

Use this checklist so the listing meets [Chrome Web Store policies](https://developer.chrome.com/docs/webstore/program-policies/) and the [Developer Program Policies](https://developer.chrome.com/docs/webstore/program-policies/).

---

## 1. One-time setup

1. Pay the **Chrome Web Store developer registration** fee (one-time) if you have not already.
2. In [Developer Dashboard](https://chrome.google.com/webstore/devconsole), create or select the **QuizTeX** item.

---

## 2. Build the upload ZIP (store package)

The uploaded package must contain **only** the extension runtime files (no `README`, no `docs/`, no `.git`).

From the repo root:

```bash
./scripts/package-extension.sh
```

Or manually (adjust version if needed):

```bash
mkdir -p dist
zip -j dist/quiztex-v1.10.4.zip \
  manifest.json content.js tex-svg.js popup.html \
  icon16.png icon48.png icon128.png LICENSE
```

- **`-j`** stores files at zip root (no extra folder) — required for a clean upload.
- Upload **`dist/quiztex-v*.zip`** in the Developer Dashboard.

---

## 3. Privacy & data safety (required disclosures)

1. **Privacy policy URL** — Host `docs/privacy-policy.html` on a **public HTTPS** URL, for example:
   - **GitHub Pages:** enable Pages for the repo, publish `/docs`, then use  
     `https://<user>.github.io/QuizTeX/privacy-policy.html`
   - Or paste equivalent content on any site you control.

2. **Developer Dashboard → Privacy practices**
   - **Single purpose:** Yes — render LaTeX on Quizlet study pages.
   - **User data:** Declare that you **do not** collect, transmit, or sell personal data (aligned with `PRIVACY.md` / `privacy-policy.html`).
   - **Certifications:** Complete the data safety questionnaire truthfully; match `PRIVACY.md`.

3. **Permissions justification** (paste into the justification fields when prompted):

   | Item | Suggested justification |
   |------|-------------------------|
   | `https://*.quizlet.com/*` | Required to run the content script only on Quizlet so LaTeX in flashcards and study modes can be typeset locally. No other sites are accessed. |
   | `all_frames` / iframe behavior | Quizlet loads some study modes (e.g. games) in nested frames; access is needed so formulas render in those views. |

---

## 4. Listing content (copy you can adapt)

**Short description** (keep under ~132 characters if the form limits it):

> Renders LaTeX math on Quizlet flashcards and games using MathJax — locally in your browser.

**Detailed description** (expand as needed):

> QuizTeX automatically typesets LaTeX that Quizlet shows as plain text (`$...$`, `\( ... \)`, `\[ ... \]`, `$$...$$`) across common modes: Flashcards, Learn, Test, Match, Blast, and set pages.
>
> **Privacy:** Rendering uses MathJax bundled inside the extension; your cards are not sent to the developer.
>
> **Disclaimer:** QuizTeX is not affiliated with or endorsed by Quizlet Inc. “Quizlet” is a trademark of Quizlet Inc.

**Category:** Productivity or Education (pick the best fit).

**Screenshots** (required for a good review):

| Asset | Size / notes |
|-------|----------------|
| Screenshots | At least **1**; Google recommends **1280×800** or **640×400** (PNG or JPEG). Show before/after or a clear “rendered math” view on `quizlet.com`. |
| Small promo tile | **440×280** (optional but recommended). |
| Marquee / large tile | If the form asks for it, follow the [image guidelines](https://developer.chrome.com/docs/webstore/images/). |

**Video:** Optional; your YouTube demo link can go in the listing if allowed.

---

## 5. Policy compliance checklist (technical)

| Requirement | QuizTeX status |
|-------------|----------------|
| Manifest V3 | Yes (`manifest.json`) |
| Single purpose | Yes — LaTeX rendering on Quizlet only |
| No remote code | Yes — MathJax is bundled; no dynamic script loads for TeX (see `content.js` macro for `\boldsymbol`) |
| No obfuscated abuse | Source is readable (`content.js`) |
| Host permissions scoped | Only `https://*.quizlet.com/*` |
| User data | None collected; document in privacy policy |

---

## 6. Before each release

1. Bump **`version`** in `manifest.json` (semver; must increase for each store upload).
2. Re-run `./scripts/package-extension.sh`.
3. Upload the new ZIP; update release notes (fixes, Quizlet UI changes, etc.).
4. Re-test on `quizlet.com` (Flashcards + one game mode) after installing the **packed** zip via “Load unpacked” from a temp folder (optional but recommended).

---

## 7. Trademark / branding

- Do **not** imply official partnership with Quizlet.
- Use language like “for Quizlet” / “on Quizlet,” not “by Quizlet.”
- README and `privacy-policy.html` already include an independence disclaimer — keep it in the store description.
