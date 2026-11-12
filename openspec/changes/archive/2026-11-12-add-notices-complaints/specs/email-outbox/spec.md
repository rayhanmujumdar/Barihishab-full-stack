## ADDED Requirements

### Requirement: Notice email template
The system SHALL provide a `NOTICE` template in `bn` and `en` whose payload holds the event (`PUBLISHED`, `EDITED`, `REMINDER`), notice id, title, body, urgent flag and author name. The subject MUST start with "[Urgent] " (Bangla equivalent in `bn`) for urgent notices; the body MUST render the notice text with only bold, bullets and safe links (all other text escaped) and link to `/{locale}/notices?notice={id}`. (Notices & Complaints PRD §11, Rule 3, G4)

#### Scenario: Urgent subject
- **WHEN** a `PUBLISHED` urgent notice "Water tank cleaning — Sunday 26 Oct" is rendered in `en`
- **THEN** the subject starts with "[Urgent] Water tank cleaning"

#### Scenario: HTML escaped
- **WHEN** the body contains `<img src=x onerror=alert(1)>`
- **THEN** the email shows it as text

### Requirement: Complaint email template
The system SHALL provide a `COMPLAINT_UPDATE` template in `bn` and `en` whose payload holds the event (`NEW`, `NEW_PRIVATE`, `IN_REVIEW`, `RESOLVED`, `REJECTED`, `WITHDRAWN`, `REOPENED`), complaint id, title, complainant name, actor name, the explanation for `RESOLVED`/`REJECTED`, and whether to include a link. It MUST link to `/{locale}/complaints/{id}` only when the link flag is set, and MUST NOT contain the complaint body, any phone number, email address or bank detail. (Notices & Complaints PRD §11; main PRD §11 privacy)

#### Scenario: New complaint email has no body
- **WHEN** a `NEW` email for "September electricity bill looks high" is rendered
- **THEN** it names Farzana and the title, links to the complaint, and does not contain the description

#### Scenario: Resolution without link
- **WHEN** a `RESOLVED` email for a member who cannot see the complaint is rendered
- **THEN** it shows the title and explanation and contains no link to the complaint
