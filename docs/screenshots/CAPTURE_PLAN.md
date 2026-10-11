# Xiaomi screenshot capture and publication plan

Capture from the **physically accepted B2 standalone APK only**, after separate explicit device approval. The owner has approved public publication of exactly `01-today.png`, `02-medications.png`, and `04-settings.png` after individual image review. They are genuine, unmodified Xiaomi captures. The existing app has one ordinary cold/flu medicine and one ordinary painkiller with real names, commercially available package photos, and usage information; they are not fictional test records. The captured History screen is **not** approved for publication and must stay outside the repository. Do not assume that any future dose, instruction, notification, or History entry is suitable for publication. Do not add, edit, delete, reschedule, or mark any medication Taken to stage a shot. Never clear or replace app data.

## Approved public images and optional future shots

| File | Screen and publication state |
| --- | --- |
| `01-today.png` | Today — approved for public README; genuine dose cards and product photos. |
| `02-medications.png` | Existing medication list — approved for public README. |
| `04-settings.png` | Settings with alarm sound, opt-in state, and developer credit — approved for public README. |
| History | Captured privately but **not approved** for the repository, README, archive or Release. |
| Medication edit/detail, wheel picker | Optional future capture only after separate owner approval; open for viewing and cancel without saving. |
| Full-screen alarm | Optional future capture only if a real alarm naturally appears; review other notifications and lock-screen background. |
| Android ringtone picker | Optional future capture only after separate approval; check for personal ringtone names. |

Keep the original PNG pixels and aspect ratio; use consistent display widths in the README. Only the three approved PNG filenames have narrow `.gitignore` exceptions. Every other screenshot filename remains ignored by default. Do not add private captures, manifests, or review ZIP files to the repository.

## Owner approvals required for any additional capture

1. Explicitly authorize screenshot capture from the existing Xiaomi running the accepted B2 APK. Confirm which existing screens may be opened; do not change medications, dose actions, schedules, app permissions, or device settings to stage them.
2. Confirm that any visible product/package image may be published and that the specific screen contains no patient name, prescription label, patient identifier, private medical record, confidential usage history, or unapproved/proprietary content. A common medicine name alone is not a reason to reject a shot.
3. Separately approve locked-screen and Android ringtone-picker capture after checking the background, other notifications, device identifiers, and ringtone names for private information.
4. Inspect each original image at full resolution and approve that specific file for publication. Only then add a narrow `.gitignore` exception and README link. Capture approval alone is not publication approval.

## Privacy review before any file is added

- Review each real product name, dose, instruction, package photo and History entry in context. Reject any patient identifier, prescription label, private medical record, confidential usage history, sensitive notification content, or unapproved/proprietary image. Check other notification cards and the lock-screen background too.
- Check status bar, account/avatar, contact names, carrier or Wi-Fi labels, device identifiers, and ringtone list for personal details. Retake a shot if any are visible; do not publish a blurred personal-data image as a sample.
- Confirm the screenshot came from the validated app version, matches current UI and permission state, and contains no test token, file path, debug overlay, or developer diagnostics.
- Review each image at full size before any deliberate staging and inspect the staged diff before publication. Never stage the private capture folder. Only the three named images above have public approval.
