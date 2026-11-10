## MODIFIED Requirements

### Requirement: Navigation and home shortcut
The app shell SHALL show "Owners" (`/[lang]/owners`) to users with `owner.view` in both the desktop sidebar and the mobile navigation (bottom bar, where it is labelled "Accounts" for owners, or the More sheet). The Home balance hero SHALL show a **My statement →** link to the viewer's own owner detail when the viewer is linked to an owner, and no hero or link otherwise. (F17; Home PRD F2)

#### Scenario: Owner sees nav and shortcut
- **WHEN** an Owner linked to an owner record opens `/en`
- **THEN** Owners is reachable from the navigation and **My statement →** links to `/en/owners/{theirOwnerId}`

#### Scenario: Unlinked admin
- **WHEN** a Super Admin not linked to an owner opens `/en`
- **THEN** no **My statement →** link is rendered
