## Purpose

Defines how BariHisab screens look while their data is still loading. Every page and data-loading overlay shows a skeleton with the same shape as its real layout, so users see the page's structure at once and content does not jump when the data arrives.

## ADDED Requirements

### Requirement: No bare loading text or blank areas
While a page under `/[lang]/` (app, auth or print group), or an overlay that fetches data on open, is waiting for its data, the system SHALL show a skeleton placeholder. It MUST NOT show only a "Loading…"-style text line, and it MUST NOT show an empty area. This applies to Home, Income & expenses, Owners, Owner detail, Distribution, Advances & loans, Requests, Users, Settings, Profile, the login / forgot / invite / reset forms, the owner and loan print statements, the entry Detail drawer, the Close-month dialog preview and the Generate-rent dialog preview. Mutation busy states, upload labels and "Load more" buttons are not covered.

#### Scenario: Owners list loading
- **WHEN** a user opens `/en/owners` and the owner list has not streamed yet
- **THEN** a skeleton is shown in the main area and the text "Loading owners…" is not shown as a visible paragraph

#### Scenario: Settings loading
- **WHEN** a user opens `/bn/settings` and the master data has not streamed yet
- **THEN** a skeleton is shown in the main area instead of an empty page

#### Scenario: Detail drawer loading
- **WHEN** an admin opens an entry's Detail drawer and the entry detail request is still pending
- **THEN** the drawer body shows a skeleton of the detail fields (kicker, title, amount, field rows), and the visible kicker does not read "Loading…"

### Requirement: Skeleton mirrors the real page layout
Each page skeleton SHALL copy the main structure of the page it stands in for, using the same layout containers and section rules, so the real content replaces it without a large layout shift. At minimum:
- every page skeleton starts with a page head (kicker bar + title bar) like the real page;
- **Owners**: a card grid of owner-card placeholders followed by a section head and list rows;
- **Owner detail**: page head, a 5-cell stat grid with a 2px ink top rule, then a section head and a statement table of placeholder rows;
- **Distribution**: page head with an action-button placeholder, a month-picker placeholder, the staircase stat grid, and an owner board of rows;
- **Advances & loans**: page head, a 4-cell stat grid, a tab bar with a 2px ink bottom rule, a two-column filter row, and a stacked list of loan-card placeholders (2px ink top rule);
- **Requests**: page head, a tab bar with a 2px ink bottom rule, and a stacked list of request-card placeholders (2px ink top rule);
- **Users**: page head and a table placeholder (header row + body rows);
- **Settings**: page head and section heads with list rows;
- **Profile**: page head, a section with a two-column field grid, and a session list;
- **Income & expenses**: page head, a two-tab placeholder with a 2px ink top rule, and exactly 6 skeleton rows (§6.1);
- **Home**: the Home page wrapper fallback shows a greeting/head placeholder and block placeholders (the per-block skeletons stay as defined by the Home spec);
- **Auth forms**: a title placeholder, field placeholders (label bar + 44px input bar) and a full-width button placeholder;
- **Print statements**: a header placeholder and a table of placeholder rows.

#### Scenario: Owner detail stat grid
- **WHEN** `/en/owners/<id>` is loading
- **THEN** the skeleton shows a stat grid with 5 cells under a 2px ink top rule, followed by a table placeholder

#### Scenario: Entries keeps six rows
- **WHEN** `/en/entries` is loading
- **THEN** the skeleton shows exactly 6 placeholder list rows

#### Scenario: Requests tabs
- **WHEN** `/en/requests` is loading
- **THEN** the skeleton shows a tab bar placeholder with a 2px ink bottom rule above a stacked list of card placeholders

### Requirement: App shell skeleton
While the signed-in app shell (session, house name, nav badges) is still loading, the system SHALL show a shell skeleton instead of an empty page. At ≥860px it MUST show a 252px sidebar placeholder (brand square, nav item bars, avatar footer) with its 2px divider edge and a top-bar placeholder. Below 860px it MUST show a top-bar placeholder and a fixed bottom-nav placeholder of 5 equal cells with a 2px ink top border. The main area MUST show a generic page skeleton.

#### Scenario: Desktop hard load
- **WHEN** a signed-in user hard-loads `/en/owners` at 1280px wide before the session has resolved
- **THEN** a sidebar placeholder 252px wide and a top-bar placeholder are visible, and the page is not blank

#### Scenario: Mobile hard load
- **WHEN** the same load happens at 375px wide
- **THEN** no sidebar placeholder is visible and a 5-cell bottom-nav placeholder is fixed to the bottom of the viewport

### Requirement: Skeletons follow the design system
Skeleton blocks SHALL use only design tokens. The fill MUST be `--color-neutral-200` and the radius MUST be 0. Card placeholders MUST keep the real card's frame (2px ink top rule) but MUST NOT be filled, so the neutral bars stay visible against the page. They MUST have no shadows and no gradients, and they MUST NOT use the signal yellow or the red/green money colors. Section rules shown in a skeleton (2px ink top/bottom rules, 1px divider row rules) MUST match the real page. Skeleton rows and inputs MUST keep the real control heights (≥44px rows/inputs, 48px main CTAs) so the content does not shift on swap. Layout MUST follow the same breakpoints as the real page (stacked/grids collapse below 860px, no horizontal page overflow at 360px).

#### Scenario: No colored placeholders
- **WHEN** any skeleton is rendered
- **THEN** no skeleton element has a border-radius above 0, a box-shadow, or a background other than the neutral-200 token

#### Scenario: Small screen
- **WHEN** a page skeleton renders at 360px wide
- **THEN** the document has no horizontal scroll

### Requirement: Skeleton motion respects reduced motion
Skeleton blocks SHALL pulse gently (opacity only) while shown. When the user has `prefers-reduced-motion: reduce`, the pulse MUST be disabled.

#### Scenario: Reduced motion
- **WHEN** a skeleton renders with `prefers-reduced-motion: reduce`
- **THEN** skeleton blocks have no running animation

### Requirement: Skeletons are accessible and bilingual
Each skeleton container SHALL set `aria-busy="true"` and an accessible name (`aria-label`) in the current locale that names what is loading (e.g. "Loading owners…" / its Bangla equivalent). Individual placeholder blocks MUST be hidden from assistive technology. Skeletons MUST NOT contain focusable elements, so keyboard focus is not trapped in or moved to placeholders. When the real content replaces the skeleton, the busy container MUST no longer be in the document.

#### Scenario: Screen reader announcement in Bangla
- **WHEN** `/bn/distribution` is loading
- **THEN** the skeleton container has `aria-busy="true"` and a Bangla `aria-label`, and no placeholder block is exposed to the accessibility tree

#### Scenario: No focus targets
- **WHEN** a user presses Tab while any page skeleton is shown
- **THEN** focus never lands on an element inside the skeleton

#### Scenario: Swap to content
- **WHEN** the page data finishes loading
- **THEN** the skeleton is removed and no element with `aria-busy="true"` remains for that page
