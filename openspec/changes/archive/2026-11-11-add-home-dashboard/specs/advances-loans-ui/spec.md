## MODIFIED Requirements

### Requirement: Navigation
The app shell SHALL show "Advances & loans" (বাংলায় "অগ্রিম ও ঋণ") linking to `/[lang]/advances` for users with `loan.view`, in the sidebar and the mobile navigation (bottom bar or More sheet), marked current on that route. Users without `loan.view` MUST see the Forbidden view on the route. (S7; Home PRD §4)

#### Scenario: Owner sees the entry
- **WHEN** an Owner opens the app
- **THEN** the navigation contains "Advances & loans" and the page opens
