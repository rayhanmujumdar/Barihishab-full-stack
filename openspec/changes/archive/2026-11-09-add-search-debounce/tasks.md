## 1. Audit

- [x] 1.1 Find every free-text search / autocomplete input (`type="search"`, `role="search"`, query-driving `onChange`). Result: Users search (`UsersManager.tsx`) and vendor autocomplete (`EntryDrawer.tsx`); both already use `useDebouncedValue`. Other filters are discrete controls (exempt).

## 2. Regression tests

- [x] 2.1 `components/users/users.test.tsx`: typing "kar" sends exactly one `/users?q=kar` request.
- [x] 2.2 `components/entries/drawers.test.tsx`: typing "DES" sends exactly one `/transactions/vendors?q=DES` request.
- [x] 2.3 Mutation check: replacing the debounced value with the raw value makes each test fail; restored.

## 3. Verification

- [x] 3.1 `pnpm vitest run --project ui` for both files green.
- [x] 3.2 No endpoints changed; Swagger registration not applicable.
