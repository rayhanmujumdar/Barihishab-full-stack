## MODIFIED Requirements

### Requirement: Detail drawer and void dialog
Tapping a row (rows are buttons) SHALL open a detail drawer with kicker Income/Expense, category title, large amount, tags (**Void · {reason}**, **Corrected**, **🔒 Locked month**), key–value rows (Month, Date, Fund account, Unit, Payee/vendor, Description, Paid from Reserve, Reference month, Recorded by; empty rows hidden), **Bills & receipts** thumbnails loaded from the same-origin file URL — tapping an image opens the in-app lightbox over the drawer (attachment-viewer) and tapping a PDF opens it from the app's origin in a new tab — and a **History** timeline (created, then each update/void/attachment change with before → after and reason). For `transaction.update`/`transaction.void` holders in an Open month on a non-voided entry it SHALL show **Correct** (primary) and **Void** (secondary). Void SHALL open a confirmation dialog "Void this entry?" with the body from PRD §2.1 and a required Reason (min 5 chars); **Void entry** stays disabled until valid. (DET-01, VOD-01, §6.3–6.4, destructive-action-confirm, attachment-viewer)

#### Scenario: Void flow
- **WHEN** an admin voids an entry with reason "Duplicate entry"
- **THEN** the dialog closes, the row shows **Void**, and the detail shows **Void · Duplicate entry**

#### Scenario: View a receipt without leaving the drawer
- **WHEN** a user taps an image thumbnail under Bills & receipts
- **THEN** the lightbox opens on that image, no new tab opens, and closing it leaves the detail drawer open
