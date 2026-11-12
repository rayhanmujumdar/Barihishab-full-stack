## MODIFIED Requirements

### Requirement: Update own profile
`PATCH /api/v1/me` (permission `profile.update.self`) SHALL update first/last/surname, birthday, profession, phone, WhatsApp, `whatsappSameAsPhone`, locale and `emailNotices` (the notices & complaints email setting, boolean) with the shared validation rules, write `user.updated`, and respond `200`; `GET /api/v1/me` SHALL include `emailNotices`. Changing `email` or `username` additionally requires `profile.identity.self`; without it the request MUST respond `403 FORBIDDEN` and change nothing. (USR-06; Notices & Complaints PRD §11)

#### Scenario: Owner updates phone
- **WHEN** an Owner patches phone `01812345678`
- **THEN** the response is `200` and the phone is updated

#### Scenario: Owner tries to change email
- **WHEN** an Owner patches `email`
- **THEN** the response is `403 FORBIDDEN` and no field is changed

#### Scenario: Super Admin changes own username
- **WHEN** a Super Admin patches their username to a free valid value
- **THEN** the response is `200`

#### Scenario: Turn off notices emails
- **WHEN** an Owner patches `emailNotices: false`
- **THEN** the response is `200`, `profile.emailNotices` is false, and the `/me` screen's "Notices & complaints emails" switch shows off
