---
name: "barihisab-design-system"
description: "Use for any BariHisab (বাড়ি হিসাব) screen, component, page or code so its colors, type, layout and UI patterns match the approved design."
---

# BariHisab design system

BariHisab is a house-rent and owner-share bookkeeping app (Dhaka, bilingual English / বাংলা). Its look is **Modernist, ink-on-paper, with one yellow signal**: flat, zero radius, strong 2px rules, flush-left everything, big heavy numbers. Every new screen, component or piece of code for this project must follow the rules below exactly. Do not invent new colors, radii, shadows or fonts.

## 1. Tokens (source of truth)

Put this in the global stylesheet (or map 1:1 into Tailwind theme / CSS-in-JS). Always use the variables, never raw hex in components.

```css
@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@400;600;800&family=Hind+Siliguri:wght@400;600;700&display=swap');
:root{
  /* ground & ink */
  --color-bg:#f3f2f2;        /* page */
  --color-surface:#eae9e9;   /* inputs, info panels, cards */
  --color-text:#201e1d;      /* ink: text, primary buttons, strong rules */
  --color-divider:color-mix(in srgb,#201e1d 40%,transparent);

  /* the ONE highlight */
  --signal:#F4C300;          /* yellow: active nav, badges, totals, urgent, FAB */
  --signal-100:#FFF7D1;

  /* primary action = ink (accent overridden to black) */
  --color-accent:#201e1d; --color-accent-500:#201e1d;
  --color-accent-600:#3d3a38; /* hover */  --color-accent-700:#000000; /* pressed */
  --color-accent-100:#FFF4C2; --color-accent-200:#FFEA8A; --color-accent-300:#FADA4D; --color-accent-400:#F4C300;
  --color-accent-800:#5a4500; --color-accent-900:#2e2400; /* .tag-accent = pale yellow bg + dark olive text */

  /* semantic money colors */
  --neg-100:#fff2ef; --neg-700:#ae1800; --neg-800:#7c1405;   /* negative / error / danger */
  --pos:oklch(0.46 0.11 150); --pos-bg:oklch(0.94 0.04 150); /* positive / owed / success */

  /* neutrals */
  --color-neutral-100:#f8f4f4; --color-neutral-200:#eae7e7; /* row & button hover */
  --color-neutral-300:#d7d3d3; --color-neutral-400:#bab6b6; --color-neutral-500:#9b9797;
  --color-neutral-600:#7d7979; /* voided / muted values */
  --color-neutral-700:#605d5d; /* labels, kickers, secondary text */
  --color-neutral-800:#444141; /* body copy on notes */
  --color-neutral-900:#2d2b2b; /* backdrop base */

  --font: Archivo,'Hind Siliguri',system-ui,sans-serif;
  --space-1:4px; --space-2:8px; --space-3:12px; --space-4:16px; --space-6:24px; --space-8:32px;
  --radius-sm:0; --radius-md:0; --radius-lg:0;
  --shadow-sm:0 1px 2px color-mix(in srgb,#2d2b2b 14%,transparent);
  --shadow-md:0 3px 10px color-mix(in srgb,#2d2b2b 16%,transparent);
  --shadow-lg:0 12px 32px color-mix(in srgb,#2d2b2b 22%,transparent);
}
body{margin:0;background:var(--color-bg);color:var(--color-text);font-family:var(--font);font-size:15px;line-height:1.55;font-variant-numeric:tabular-nums}
:focus-visible{outline:2px solid var(--color-accent);outline-offset:2px}
```

### Color roles — strict

| Use | Color |
|---|---|
| Page background | `--color-bg` |
| Inputs, info boxes, reminder strips | `--color-surface` |
| Text, primary button fill, section top-rules, drawer edges, toast bg, avatar | `--color-text` (ink) |
| Active nav item marker, nav badges, "Distributable =" total cell, pending count, Urgent tag, mobile + FAB, chart expense bars, login wordmark | `--signal` yellow |
| Positive balance ("Owed"), success ticks, "Balanced", income amounts | `--pos` text on `--pos-bg` tag |
| Negative balance ("Advance outstanding"), errors, warnings, deficits, Log out | `--neg-700` text; alert boxes `--neg-100` bg + `--neg-800` text + 2px `--neg-700` top border |
| Zero / settled | ink text on `--color-neutral-200` |
| Voided rows | `--color-neutral-600` |

Rules:
- Yellow is a **fill**, never a text color on the light ground (fails contrast). Text on yellow is always ink.
- Red is **only** for negative money and errors — never decoration, never a primary button.
- Green is only for positive money / success states.
- The app is otherwise ink on paper. If a screen looks colorful, it's wrong.

## 2. Typography

- One family: **Archivo** (Latin) with **Hind Siliguri** fallback for Bangla. Bangla display text (e.g. "বাড়ির হিসাব") uses Hind Siliguri 700.
- Weights: 400 body, 600 labels/nav, 800 headings, numbers, buttons.
- Headings: tight `letter-spacing:-.015em` to `-.03em`, `line-height:1.12`. Page title `clamp(30px,4vw,44px)`; section title h3 20px; drawer title 22px; dialog title 20px.
- **Kicker** (above titles / stat labels): `11px; letter-spacing:.1em; text-transform:uppercase; font-weight:600; color:var(--color-neutral-700)`.
- Field labels 12px neutral-700. Secondary text 12–13px neutral-700.
- **Money**: always `font-weight:800`, tabular numerals, negative tracking. Hero balance `clamp(48px,7vw,84px); letter-spacing:-.045em; line-height:.95`. Stat values 26–28px. Table money right-aligned.
- Currency: `৳` prefix with thousands separators (৳6,300). Store amounts as integer paisa; display in BDT. Support Bangla digits when language = bn.

## 3. Layout & structure

- **Zero radius everywhere.** No rounded corners, pills or circles (except native radio dot).
- **Rules do the organising**, not whitespace or shadows:
  - Section header: title + optional meta, then `border-bottom:2px solid var(--color-text); padding-bottom:8px`.
  - Stat grids: `border-top:2px solid var(--color-text)`, cells divided by `1px solid var(--color-divider)` right/bottom borders. No gaps, no card boxes.
  - List rows: `padding:12px 0; border-bottom:1px solid var(--color-divider)`.
  - Shell chrome (sidebar edge, top bar bottom): `2px solid var(--color-divider)`.
- Grids: `repeat(auto-fit,minmax(min(100%,Npx),1fr))` (N = 150 stats, 220 desk tiles, 320–360 panels).
- Page padding `clamp(16px,3vw,40px)`, `max-width:1320px`, bottom padding 120px (room for mobile nav). Section gap 28–40px.
- Everything **flush left** — headings, copy, and labels inside wide buttons (`justify-content:space-between` with a trailing arrow icon).
- Touch targets: **min-height 44px** for every button/input/row; 48px for main CTAs; 56px amount input; 60px mobile nav.

## 4. App shell

- **Breakpoint 860px.** ≥860 desktop sidebar; <860 mobile bottom nav.
- **Desktop sidebar** 252px, sticky full height, right border 2px divider. Top: 28px yellow square + "BariHisab" 22px/800 + kicker (house · area). Nav items 44px, 14px/600, icon 18px; **active item = ink background + bg-colored text**; hover neutral-200; badges = yellow fill, ink 11px/800 text, square. Bottom: 36px ink square avatar with initials + name/role + logout icon button.
- **Top bar** sticky, bg color, bottom 2px divider: month picker (2px ink box, prev/next 40px cells separated by 2px ink lines, lock icon for closed months, `Draft` tag), "View as" segmented control, language toggle (secondary btn), primary action ("+ New entry" / "+ Request money").
- **Mobile bottom nav**: fixed, 5 equal columns, `border-top:2px solid var(--color-text)`; each item icon 22px + 11px/700 label; **active = 4px yellow top bar**; center/plus slot is a solid yellow FAB cell. "More" opens a 2-column grid sheet above the nav with a dim backdrop.

## 5. Components

Use the Modernist classes (`.btn`, `.input`, `.field`, `.seg`, `.tag`, `.table`, `.dialog`) styled from the tokens above.

- **Buttons**: `.btn-primary` ink fill, bg text, hover accent-600, pressed black. `.btn-secondary` transparent + divider border, hover 7% ink tint. `.btn-ghost` text link-style with trailing arrow (`padding-left:0` when aligned to text). `.btn-icon` 36×36. Labels 14px/800. Icon + label gap 6px. Disabled = 45% opacity.
- **Inputs**: surface bg, 1px divider border, 0 radius, focus border ink. Label above (12px). Amount field: 56px tall, 28px/800 text, label "Amount (৳)". Native `<select class="input">` with `appearance:auto`. Checkbox 18px, accent ink.
- **Segmented control** (`.seg`/`.seg-opt`): radio inputs inside labels; checked = ink fill + bg text; 1px divider separators. Used for type pickers, methods, role switch.
- **Tags**: square, 11px. `.tag-accent` (pale yellow / olive) for Draft; yellow-fill ink-800 for Urgent; `.tag-neutral` for Pinned; `.tag-outline` for New; balance tags use pos/neg/neutral bg + matching text, 13px/800.
- **Stat cell**: kicker label (+ operator `+ − =` right-aligned 20px/800) above 26px/800 value. The final **result cell is yellow-filled** with ink text and `=`.
- **Tables** (`.table`): uppercase 11px neutral headers with 2px divider under, 1px row rules, hover 4% ink tint; wrap in `overflow-x:auto` with a `min-width` — never squash columns. Money columns right-aligned.
- **Side drawer** (forms like New entry): fixed right, `width:min(540px,100vw)`, bg color, `border-left:2px solid var(--color-text)`, shadow-lg; header row with title + X icon button and 2px ink bottom rule; scrollable body gap 16px; sticky footer actions. Backdrop `color-mix(in srgb,var(--color-neutral-900) 50%,transparent)`.
- **Dialog** (confirmations, approvals): `.dialog-backdrop` + `.dialog` (surface, shadow-lg, 0 radius), title 20px/800, body 14px, actions right-aligned (secondary "Cancel/Not yet" then primary). Inside, comparisons use a 2-col grid with 2px ink top rule.
- **Alert strip**: `--neg-100` bg, `--neg-800` text, 2px `--neg-700` top border, alert icon. **Reminder strip**: surface bg, 2px **yellow** top border, red alert icon, text + primary button.
- **Toast**: fixed bottom-center (above mobile nav, `bottom:84px`), ink bg, bg-colored 14px/600 text, yellow check icon, shadow-lg.
- **Attachment drop**: `2px dashed var(--color-divider)` box with secondary "Add bill / receipt" button + camera icon.
- **Charts**: flat bars, no radius, no gridlines; income = ink, expense = yellow; 2px ink baseline; square legend swatches 12px.
- **Login screen**: split grid — left ink panel with huge yellow "Bari/Hisab" wordmark (`clamp(64px,10vw,136px)`, 800, `line-height:.86`), Bangla subtitle in bg color, yellow 2px rule over a 3-column tagline; right panel form max 520px.

## 6. Icons

Lucide-style inline SVG: `viewBox 0 0 24 24`, `fill:none`, `stroke:currentColor`, `stroke-width:2`, round caps/joins. Sizes 14 (inline), 18 (nav/buttons), 22 (mobile nav). Icon-only buttons need `aria-label`/`title`.

## 7. Content & UX patterns

- Bilingual: every label has `en` and `bn`; language toggle always visible (top bar + login). Don't hard-code one language.
- Roles: Super Admin (bookkeeper actions: income, expense, generate rent, close month) vs Owner (request money). Show role-appropriate primary CTA; admin-only blocks labelled "Super Admin only".
- Months: Draft vs Closed (lock icon). Closed months are read-only; corrections require a reason (saved to audit log).
- Destructive or financial-final actions (close & lock, approve, void, reject) always go through a dialog; rejections/resolutions require a written reason.
- Copy is short, plain, sentence-case, specific ("Close-the-month reminder.", "Every owner’s share, to the paisa.").
- Empty states: one plain sentence + one action.

## 8. Accessibility

- Real `<button>`, `<a href>`, `<label>` + `<input>`; never clickable divs.
- Text contrast ≥ 4.5:1 (labels use neutral-700, not lighter). Never yellow text on light bg.
- Positive/negative also differ by label text ("Owed" / "Advance outstanding" / "Settled"), not color alone.
- Focus ring: 2px ink outline, offset 2px.

## Do / Don't

**Do:** ink on paper · one yellow highlight per area · 2px rules between sections · big bold numbers · flush-left · 44px targets · `৳` with separators · tokens only.

**Don't:** rounded corners · gradients · colored cards · drop shadows on static content (shadows only on overlays) · red primary buttons · centered button labels or hero copy · hairline-only section dividers · new hues (blue, purple, etc.) · emoji as icons.

## Final check before delivering any BariHisab UI

1. Only token colors used? Yellow used as fill only, red/green only for money/status?
2. Radius 0 everywhere?
3. Section headers have the 2px ink rule; stat grids are ruled, not carded?
4. Fonts Archivo + Hind Siliguri; numbers 800 + tabular?
5. Desktop sidebar ≥860px, bottom nav <860px, active states (ink chip / yellow bar) correct?
6. All targets ≥44px, labels flush left, bilingual strings in place?