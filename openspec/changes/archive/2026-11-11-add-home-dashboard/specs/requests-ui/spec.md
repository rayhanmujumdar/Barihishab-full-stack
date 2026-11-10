## MODIFIED Requirements

### Requirement: Navigation and badge
The app shell SHALL show a **Requests** item (`/[lang]/requests`) in the sidebar and in the mobile navigation (bottom bar or More sheet) for users with `request.view`. Its badge SHALL show the count of PENDING requests for users with `request.view.all`, and for other users the count of their own requests with an unseen decision; no badge when 0. Counts use Bangla digits in বাংলা. Opening `/[lang]/requests?new=1` SHALL open the request form for a user who may create one. (F1, F14; Home PRD §4)

#### Scenario: Super Admin badge
- **WHEN** two requests are PENDING and the Super Admin opens any page
- **THEN** the Requests nav item shows badge "2"

#### Scenario: Owner badge clears
- **WHEN** an owner's request was approved and they open Requests
- **THEN** the screen marks the decision seen (`POST /requests/seen`) and the badge disappears

#### Scenario: Deep link opens form
- **WHEN** an Owner opens `/en/requests?new=1`
- **THEN** the Request money dialog is open

### Requirement: Home tie-ins
Home SHALL show, for `request.view.all`, a **Pending requests** desk tile with the PENDING count in a yellow box (plain when 0), "{n} waiting over 3 days" when any, and a link to the "Needs your decision" tab; and an **Approved, not paid** reminder strip for approved requests past their needed-by date with a **Disburse** button opening that request. For owner-linked users Home SHALL show the My request strip for their newest PENDING or APPROVED request, or once for an unseen REJECTED / DISBURSED decision. (F13, F14; Home PRD F4, F5, F6)

#### Scenario: Pending tile
- **WHEN** one request is PENDING
- **THEN** the Super Admin's Home shows Pending requests "1" in a yellow box linking to `/requests`

#### Scenario: Approved past needed-by
- **WHEN** Nasrin's approved ৳10,000 advance was needed by yesterday
- **THEN** the Super Admin's Home shows "Nasrin Ahmed's ৳10,000 advance was due on {date}." with **Disburse**
