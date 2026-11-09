# search-debounce Specification

## Purpose
Free-text search, filter and autocomplete inputs must not send a request per keystroke. They debounce through one shared hook before the value reaches a query key, API call or URL.
## Requirements
### Requirement: Search inputs are debounced before querying
Every free-text search, filter or autocomplete input SHALL debounce its value before that value drives a TanStack Query key, an API request, or a router/URL update. The debounce MUST use the shared `useDebouncedValue` hook from `lib/hooks/use-debounced-value.ts` (default 250 ms); components MUST NOT hand-roll their own `setTimeout` debounce. The input element itself SHALL stay instant: raw state is bound to its `value`, and only the value passed to the query is debounced. The debounced value SHOULD be trimmed. Debounced list queries SHOULD use `placeholderData: keepPreviousData` so results do not flash empty.

#### Scenario: Users search sends one request per typing burst
- **WHEN** a Super Admin types "kar" quickly into the Users search box
- **THEN** exactly one list request is sent with `q=kar`
- **AND** no request is sent for `q=k` or `q=ka`

#### Scenario: Vendor autocomplete sends one request per typing burst
- **WHEN** a user types "DES" quickly into the expense "Payee / vendor" field
- **THEN** exactly one vendor request is sent with `q=DES`
- **AND** no request is sent for `q=D` or `q=DE`

#### Scenario: Input stays responsive
- **WHEN** a user types into a debounced search box
- **THEN** each typed character appears in the input immediately

### Requirement: Combined filters debounce together
When a free-text term and other filters drive the same query, they SHALL be debounced together as one value, so a query never pairs a new filter with a partially typed term.

#### Scenario: Role filter change while typing
- **WHEN** a user types into Users search and changes the role filter within 250 ms
- **THEN** the next request carries both the final term and the new role

### Requirement: Discrete controls are not debounced
Selects, chips, toggles, date pickers and month pickers SHALL NOT be debounced. Each discrete change MAY trigger its query immediately.

#### Scenario: Month picker
- **WHEN** a user picks a month in the Distribution month select
- **THEN** navigation happens immediately without a debounce delay

### Requirement: Every search field has a debounce regression test
Each debounced search field SHALL have a component test that types a burst and asserts exactly one request for the final term. New search fields (for example LST-06 entry search) MUST add the same test.

#### Scenario: Debounce removed
- **WHEN** a developer replaces `useDebouncedValue` with the raw value in a search component
- **THEN** that component's debounce test fails

