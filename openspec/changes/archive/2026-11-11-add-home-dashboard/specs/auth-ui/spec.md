## MODIFIED Requirements

### Requirement: Role-aware home shell (A5)
`/` SHALL render the app shell (sidebar on desktop, bottom nav and More sheet on mobile) for any logged-in user. Users with `dashboard.admin` MUST additionally see the "Bookkeeper's desk" with the House fund, Reconciliation, Pending requests, Open complaints and Invites waiting tiles (Home PRD F5); the Invites waiting tile counts INVITED users. Owners MUST NOT see the desk, any admin block, reminder strip, quick action or admin navigation item.

#### Scenario: Super Admin home
- **WHEN** a Super Admin opens `/` with 2 INVITED users
- **THEN** the Invites waiting tile shows 2

#### Scenario: Owner home
- **WHEN** an Owner opens `/`
- **THEN** no Users nav item and no Bookkeeper's desk block is rendered
