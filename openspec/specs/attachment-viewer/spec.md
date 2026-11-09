# attachment-viewer Specification

## Purpose

Lets users view bill and receipt images inside the app, in a full-screen lightbox served from the app's own origin, instead of being sent to a raw storage link in a new browser tab.

## Requirements

### Requirement: Images open in an in-app lightbox
On every screen that lists attachments (entry detail **Bills & receipts**, owner statement row detail receipt files), activating an image attachment (`image/jpeg`, `image/png`, `image/webp`) SHALL open a full-screen lightbox over the current screen, starting at that image, without opening a new tab or window and without navigating away. The lightbox MUST contain only the image attachments of the same entry/row, in their listed order, and show a position counter ("2 / 3") when there is more than one. Image sources MUST be the same-origin file URL `/api/v1/attachments/:id/file`; the page MUST NOT reference a storage URL anywhere. (Income & Expenses PRD §6.3 "tap → full view", Owners PRD F3)

#### Scenario: Open a receipt photo
- **WHEN** a user taps the second of three image thumbnails on an entry's Bills & receipts
- **THEN** a lightbox opens over the drawer showing that image with counter "2 / 3", no new tab opens, and the image `src` is `/api/v1/attachments/<id>/file` on the app's origin

#### Scenario: Receipt on a statement row
- **WHEN** a user selects a payout row and taps its receipt image file name
- **THEN** the same lightbox opens on that receipt

### Requirement: Lightbox controls
The lightbox SHALL support next/previous (buttons, ←/→ keys, horizontal swipe), close (button, `Esc`, backdrop tap), zoom (buttons, pinch, double-tap/double-click, wheel) and a **Download** action that saves the original file via `/api/v1/attachments/:id/file?download=1`. Each slide MUST show the file name as its caption. Closing MUST return focus to the thumbnail or link that opened it, and MUST leave the underlying drawer or panel open. While the lightbox is open, keyboard focus MUST stay inside it and its controls MUST be operable even though it opens from inside a modal drawer.

#### Scenario: Keyboard navigation
- **WHEN** the lightbox shows image 1 of 2 and the user presses → then `Esc`
- **THEN** image 2 is shown, then the lightbox closes, the detail drawer is still open and focus is on the second thumbnail

#### Scenario: Download original
- **WHEN** the user activates **Download** on a slide named `desco-oct.jpg`
- **THEN** the browser downloads `desco-oct.jpg` from the app's own origin

### Requirement: PDFs open from the app's origin
Activating a PDF attachment SHALL open `/api/v1/attachments/:id/file` (same origin, inline) in a new tab, as a plain link opened in direct response to the click, with `rel="noopener"`. PDFs MUST NOT appear as lightbox slides. The PDF tile MUST show a document icon and the file name for assistive technology. (Income & Expenses PRD §6.3 "PDFs open in a new tab")

#### Scenario: Open a PDF bill
- **WHEN** a user taps a PDF attachment
- **THEN** a new tab opens at `http://<app-origin>/api/v1/attachments/<id>/file` showing the PDF inline, and no storage URL is visible

### Requirement: Load failure and session expiry
When an image or thumbnail fails to load, the UI SHALL attempt one session refresh and reload it once; if it still fails the slide or thumbnail MUST show the message "Couldn't load this file." (বাংলা: "ফাইলটি লোড করা যায়নি।") instead of a broken-image icon, and the rest of the lightbox MUST keep working.

#### Scenario: Access token expired while the drawer was open
- **WHEN** the access token has expired and the user opens an image in the lightbox
- **THEN** the session is refreshed and the image loads on the retry

#### Scenario: File missing in storage
- **WHEN** the file request returns `404`
- **THEN** the slide shows "Couldn't load this file." and next/previous still work

### Requirement: Viewer theming and language
The lightbox SHALL follow the BariHisab design system — paper/ink colour tokens for the backdrop and controls, zero corner radius, the system type for captions and counter, and no additional accent colours — and SHALL label every control (Previous, Next, Close, Zoom in, Zoom out, Download) in the viewer's language (English or বাংলা) with the counter in Bangla digits under বাংলা. Opening and closing animations MUST be disabled when the user prefers reduced motion.

#### Scenario: Bangla labels
- **WHEN** a বাংলা user opens the second of three images
- **THEN** the close button's accessible name is Bangla and the counter reads "২ / ৩"

#### Scenario: Reduced motion
- **WHEN** the OS setting "reduce motion" is on and the lightbox opens
- **THEN** it appears without a fade or swipe animation
