## Context

- `lib/hooks/use-debounced-value.ts` exports `useDebouncedValue<T>(value, ms = 250)`: returns `value` only after it stops changing for `ms`. Unit-tested in `tests/ui/query-hooks.test.tsx`.
- `UsersManager` debounces `{ q: q.trim(), role, status }` as one memoized object and uses it as the `qk.users.list(...)` key.
- `EntryDrawer` debounces `form.vendor.trim()` into `qk.transactions.vendors(vendorQ)` with `keepPreviousData` and a 5 min `staleTime`.

## Goals / Non-Goals

**Goals:** one rule, one primitive, a regression test per search field.

**Non-Goals:** new hooks, new libraries, server search changes.

## Decisions

- **D1 Debounce the value, not the handler.** Bind raw state to the input; pass the debounced value into the query key. Keeps typing responsive and lets TanStack dedupe by key. Alternative (debounced `onChange`) rejected: input lags and the controlled value desyncs.
- **D2 250 ms default.** Below typical inter-keystroke gaps for fast typists' bursts ending, short enough to feel instant. Callers may pass another value when a field needs it.
- **D3 Combined filter object.** Several filters feeding one query are debounced as one `useMemo` object, so they settle together.
- **D4 `keepPreviousData`** on debounced list queries so results don't flash empty during the wait.
- **D5 Test by request count.** Component tests type a burst with `userEvent.type` and assert exactly one search request, for the final term. Mutation-checked: removing the debounce makes both tests fail.

## Risks / Trade-offs

- 250 ms latency before results update → acceptable; input itself is instant.
- Tests rely on `userEvent.type` keystrokes being faster than 250 ms → true in jsdom (no delay by default).
