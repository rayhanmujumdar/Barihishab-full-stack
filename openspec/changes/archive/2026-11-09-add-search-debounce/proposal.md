## Why

Typing in a search box must not fire one API request per keystroke. Each keystroke would create a new TanStack Query cache entry, load the server, and allow a slow response for an old term to land after a newer one. The two search fields in the app (Users search, USR-02, and the expense vendor autocomplete, EXP-03) already debounce through a shared hook, but no spec states the rule and no component test guards it. Future search fields (LST-06 entry search, Owners, Loans, Distribution lists) need the same contract.

## What Changes

- Make "every free-text search, filter or autocomplete input is debounced before it drives a query key, API call or URL update" a spec requirement.
- Name the single shared primitive: `useDebouncedValue` in `lib/hooks/use-debounced-value.ts`, default 250 ms. No per-component `setTimeout` debounce.
- The input itself stays instant (raw state bound to `value`); only the value fed into the query lags.
- When several filters drive one query, they are debounced together as one object, so a filter change never pairs with a half-typed term.
- Discrete controls (select, chips, date pickers, month picker) are exempt: one change, one request.
- Add component tests proving a typing burst sends exactly one request for the final term, for Users search and vendor autocomplete.

## Capabilities

### New Capabilities

- `search-debounce`: The debounce contract for free-text search and autocomplete inputs: shared hook, delay, combined filter debounce, exemptions, and test coverage.

### Modified Capabilities

<!-- None. user-management and entries-ui behaviour is unchanged; this adds a cross-cutting rule. -->

## PRD coverage

- **USR-02** (main PRD + Auth PRD): user list search with role and status filters.
- **EXP-03** (Income & Expenses PRD): vendor autocomplete from previous expenses.
- **LST-06** (P2, not built yet): entry search by description / vendor must follow this rule when built.
- No PRD ID covers debounce itself. It is a performance rule layered on these requirements, with no conflict.

## Out of scope

- Server-side search changes (indexes, trigram search).
- Debouncing discrete controls.
- Changing the 250 ms default.

## Impact

- **Code**: none. `components/users/UsersManager.tsx` and `components/entries/EntryDrawer.tsx` already comply.
- **Tests**: new cases in `components/users/users.test.tsx` and `components/entries/drawers.test.tsx`. Hook unit test already exists in `tests/ui/query-hooks.test.tsx`.
- **APIs / DB / i18n / dependencies**: none.
