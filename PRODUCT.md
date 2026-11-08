# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

BariHisab is built for one real house: the author's own family home in Bangladesh, owned jointly by several relatives. Making it a product for other families (PRD Phase 3 SaaS) is a possible later step, not a current goal. Design decisions serve this one family first.

- **Super Admin (the bookkeeper)**: the author, who is usually also a co-owner. They enter rent and expenses, close each month, pay owners, approve requests and manage users. Their main job is the monthly cycle (PRD §7 Flow B), which should take no more than 10 minutes, often on a phone.
- **Owners / Members**: the co-owner relatives. Ages vary and some are elderly with little tech comfort. They mostly use phones and need larger, clearer text. Their main job is answering "how much am I owed?" in 2 clicks / 10 seconds or less (PRD §7 Flow C). They also check any month's accounts, see what other owners received, and later raise requests or objections.
- Later roles (PRD §4, Phase 3): Accountant (enters data only) and Viewer (family member without a share, reports only).

## Product Purpose

BariHisab replaces paper notebooks and scattered records with one shared "family ledger" for a co-owned house. It tracks rental income, expenses, each owner's entitlement by ownership %, payouts, advances, loans, special grants and the House Fund. Everyone sees the same numbers, and every money movement has a visible history.

Success (PRD §2): a month can be entered and closed in 10 minutes or less; shares never mismatch (sum of shares always equals distributable); at least 80% of owners log in monthly; no account complaint stays unresolved for more than 7 days.

## Positioning

A trust instrument for a family, not general accounting software. BariHisab is not a spreadsheet and not double-entry bookkeeping. It encodes the family's own rules: shares that change over time, entitlement kept separate from payment, the Largest Remainder rounding method, and deficit carry-forward. Its records are never deleted, only reversed, and that history is visible to every owner. Its job is preventing disputes among relatives, so being transparent and plainly correct matters more than having many features.

## Operating Context

- Monthly cycle: rent collected, expenses entered with a photo of the bill from the phone camera, distribution preview checked, month closed (then locked), owners paid (PRD §7 B).
- Owners check balances on their phones, often only once a month or after a payment. Monthly summary emails link them back to the dashboard (Phase 2).
- Disputes and corrections: objections can be raised against a specific entry; wrong entries are voided or adjusted with a reason; reopening a closed month notifies everyone (PRD §7 E–F).
- Location and conventions: Dhaka, BDT (৳), Asia/Dhaka timezone, lakh–crore number grouping, Bangla digits and month names in Bangla mode.

## Capabilities and Constraints

- Full requirements live in `docs/barihishab_management_README.md` (PRD v1.0). Auth requirements live in `docs/barihishab_authentication_autorization.md`. These are the source of truth for features, screens (S1–S12), routes and flows.
- Roles: Super Admin and Owner in v1. Permissions are checked on the server by permission name. Users are deactivated, never deleted. At least one active Super Admin must always exist.
- Login is invite-only (no public sign-up): username or email plus password, invite links valid 72 hours, reset links valid 1 hour, revocable sessions.
- Accounting rules that cannot be broken: money is stored as integer paisa; entitlement and payment are separate ledgers; balances are computed, never stored; financial data is never hard-deleted; a closed month never changes silently.
- Language: **Bangla is the default**, with an English toggle. Text uses key-based i18n with no hard-coded strings.
- Responsive web, designed for mobile browsers first, from 360px wide up to desktop. Bottom navigation on mobile, left sidebar on desktop. Installable PWA in Phase 2; native app is not planned for v1.
- Not in v1: tenant portal, online rent collection, multi-house UI, SMS/WhatsApp, tax.
- Undecided (PRD §16.2): equal or unequal split, Special Grant policy, Reserve amount, advance limit, how much of other owners' detail the monthly email shows, start month and opening balances, handling of tenant deposits, domain and hosting.

## Brand Commitments

- Name: **BariHisab** / **বাড়ি হিসাব** ("house accounts").
- Voice: simple, plain Bangla labels first; short, factual, calm. Money and status are always stated in words, never shown by colour alone.
- A visual design system is approved and binding: the `barihisab-design-system` skill (`.agents/skills/barihisab-design-system/SKILL.md`). Visual decisions are defined there, not here.

## Evidence on Hand

- Only the PRD's worked examples: §5.8 (Owner A, 40% share) and the §15.2 calculation test cases.
- No real owner names, figures, ledgers, testimonials or screenshots. Future work must not invent real-looking family data, quotes, user counts or claims. Sample data must stay clearly illustrative and come from the PRD examples.

## Product Principles

1. **Correct before pretty.** Accounting accuracy outranks UI and email polish (PRD design principle 1).
2. **Show the history, never hide it.** Every correction is a visible reversal with a reason, because the product exists to settle family disputes.
3. **One answer in one glance.** The question each owner cares about, their own balance, must be readable immediately on a phone by the least tech-comfortable relative.
4. **Same truth for everyone.** All owners see the same numbers; only who can act on them differs.
5. **Few screens, big numbers, Bangla first.**

## Accessibility & Inclusion

- WCAG AA contrast, keyboard navigation, Light/Dark mode (PRD §8.3).
- Owners include elderly relatives with low tech comfort. Design for large readable text, big-number cards of at least 28px, touch targets of at least 44px, one-handed phone use, and plain-language confirmations.
- Colour is always paired with a text label (green = owed/income, red = advance/deficit, grey = void).
- Bangla script rendering and Bangla digits must be first-class, not a translation afterthought.
