# Northlight Studio – UI design prompt ("Harbour Light")

> Direction chosen by the assistant because the project owner said "do something default". The owner can replace any value below and the CSS tokens in `css/base.css` will follow.

## 1. Who and what
The site is used by two groups. **Visitors** (small-business owners looking for a brand, web or product designer) should feel they are meeting a calm, careful, human studio. **Northlight staff** (Design, Sales and IT) use the internal tools all day and should feel they are in a well-kept studio logbook rather than a cold admin console. The design should create *trust, warmth and clarity*: a lighthouse that makes the next step obvious.

## 2. Mood
**Five mood words:** warm, precise, calm, editorial, trustworthy.
**Three styles it must never resemble:**
1. The generic blue "SaaS admin template" with a dark sidebar, soft-shadow cards and purple gradients.
2. Neon, glassmorphism or "AI product" gradients on black.
3. Pastel stock-photo corporate sites with rounded blobs and no personality.

## 3. Colours (HEX)
- **Main (ink / harbour navy):** `#14304A` for the header, headings, borders and links.
- **Accent (lantern amber):** `#F2A71B` for primary buttons, the header rule and active markers. Amber is only ever used as a fill behind dark text, never as small text on paper.
- **Background (paper):** `#F4EFE4`, with raised surfaces in `#FFFBF2`.
- Text ink `#1A2230`; muted text `#565C69`. Status colours stay semantic: success `#14693F`, warning `#7A4E00`, danger `#A4231A`, info `#1A4F8F`, each on a pale tint.
- Light theme only. Dark mode is intentionally not offered because the printed-paper look is the identity.

## 4. Fonts (local/system fonts only, no external requests)
- **Headings:** a book serif stack: `"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif`.
- **Body and interface:** `"Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif`. Numbers use the sans stack with lining, tabular figures.
- **Sizes:** body 17 px / line height 1.6; H1 clamp 2.2–3.6 rem; H2 1.75 rem; H3 1.25 rem; small text 0.875 rem; table headers 0.75 rem in letter-spaced capitals.

## 5. Layout
- **Navigation** is a horizontal bar at the top (wordmark left, links inline, amber rule underneath) on desktop and tablet. On phones it collapses behind a "Menu" button. There is no sidebar.
- Every page opens with a **page header**: a small kicker (the section name), a large serif title and a short intro.
- Content sits in a centred column up to 1160 px, in two or three columns on desktop, one on mobile. Spacing follows an 8 px scale. Sections are separated by a heavy 3 px ink rule, like a printed page.

## 6. Components
- **Cards:** paper surface, 2 px ink border, 4 px corners and a hard, un-blurred offset shadow.
- **Buttons:** 2 px ink border; primary is amber with ink text; secondary is transparent. Minimum height 44 px.
- **Forms:** white fields with 2 px ink borders, labels above, errors in red text with a warning mark and `aria-describedby`.
- **Tables:** no vertical lines, a 2 px ink rule under the header, thin row rules, wide tables scroll inside their own container.
- **Badges:** small square "stamps" with text, never colour alone.
- **Icons:** simple geometric glyphs inside small square tiles; the logo is a lantern mark.

## 7. Motion
Short (120–160 ms) ease-out transitions only on hover, focus and press. Buttons lift by 1 px on hover and press down by 2 px on click. Menus and disclosures open without large movement. There are no entrance animations or parallax. `prefers-reduced-motion` disables all transitions.

## 8. Rules
- Meet WCAG 2.1 AA: 4.5:1 text contrast (checked by a unit test on the colour tokens and by an axe-core scan of every page), visible focus rings, 44 px touch targets, semantic HTML.
- Fully responsive for phone, tablet and desktop with no horizontal page scrolling.
- **Preserve all functionality.** A redesign must never remove a feature; all Playwright tests must still pass.
- No external fonts, icon libraries or CSS frameworks.
