## ADDED Requirements

### Requirement: Notice and complaint attachments
Notices SHALL accept up to 5 attachments (entity type `notice`), complaints up to 5 (`complaint`) and comments up to 3 (`complaint_comment`), all JPG, PNG, WebP or PDF ≤ 5 MB with the same upload validation as entry attachments. Presign SHALL also be allowed with `notice.manage` or `complaint.create`; a non-Super-Admin MUST only link their own unlinked uploads. File metadata and file access MUST, in addition to the existing checks, return `404 NOT_FOUND` unless: for `notice` the viewer holds `notice.view`; for `complaint` and `complaint_comment` the viewer can see the complaint and, for a comment file, the comment is not hidden. (Notices & Complaints PRD G3, G8, Rule 17)

#### Scenario: Private complaint file hidden
- **WHEN** Farzana opens a file of Tanvir's Admin-only complaint
- **THEN** the response is `404 NOT_FOUND`

#### Scenario: Owner attaches to a complaint
- **WHEN** an Owner presigns a PDF and raises a complaint with it
- **THEN** the complaint has one attachment and every member who can see the complaint can open it

#### Scenario: Hidden comment file
- **WHEN** a comment with a photo is hidden by the Super Admin
- **THEN** opening that photo returns `404 NOT_FOUND`
