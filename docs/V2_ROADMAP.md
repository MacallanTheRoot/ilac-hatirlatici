# Version 2 roadmap — proposals, not implemented features

This is planning documentation. None of the proposals below is in the released v1.0.0 APK, and listing one is not a delivery promise. Scope requires product, privacy, migration, accessibility, and physical Android review before implementation.

## 1. Vision

Keep İlaç Hatırlatıcı simple, readable, practical, and dependable for older Android users. Improve daily medication tasks without turning the app built for the developer's father into a complex healthcare platform. Presentation and language improvements must preserve alarm reliability and local user data.

## 2. Existing v1 baseline

V1 is offline-first and stores medication names, doses, notes, photos, schedules, and dose records on the device. Today, Medications, History, Settings, and the alarm screen support explicit Taken acknowledgement, a five-minute snooze, independent records for medicines due together, Android alarm ringtone selection, and optional full-screen presentation where Android permits it. Xiaomi Android 13 passed the recorded physical acceptance scenarios; one earlier intermittent wake failure did not recur later. Samsung has not undergone physical acceptance. No device-wide guarantee is made.

Every V2 proposal must preserve existing local data and the distinction between a confirmed taken dose and an unanswered reminder. Visual changes must not silently alter scheduling, notification identity, or historical dose records.

## 3. V2 proposed features

Priority is an investigation order, not a promised release date. P0 is a release gate; P1 is a core candidate; P2 is separately scoped; P3 is exploratory. The previously agreed themes of UI/UX modernization, Turkish/English support, light/dark/system themes, and smoking cessation remain V2 proposals. Other ideas are optional.

| Proposal | Priority and status | Complexity, usability, privacy | Draft acceptance criterion |
| --- | --- | --- | --- |
| Modernized UI, navigation, information hierarchy, and medication management | P1 core | Medium; high daily value; low direct data risk | Today, Medications, History, Settings, and alarm actions remain easy to find with large text; add/edit/cancel preserves values and schedules. |
| Turkish and English application localization | P1 core | Medium; broad reach; local preference | Every screen, permission explanation, notification, alarm action, accessibility label, and error has reviewed TR/EN text; selection survives restart. Turkish stays fully supported. |
| Light, dark, and system themes | P1 core | Medium; comfort; local preference | All three modes work on forms, tabs, and alarm screens, remain readable after restart/system changes, and pass contrast review. |
| Optional smoking cessation tracking | P2 separately scoped core proposal | Medium/high; opt-in value; sensitive habit data | Local quit date, optional daily count, and progress survive restart; opt-out does not affect medication alarms; no treatment or cessation-success claim. |
| Medication inventory, remaining stock, configurable low-stock reminders | P2 optional | Medium; useful to some; local stock data | Counts and thresholds survive restart; low-stock alerts stay distinct from dose alarms and never automatically adjust dosage or dose logs. |
| Local backup and restore, including photos | P2 optional; privacy review first | High; device-move value; sensitive export | User chooses destination; test-data round trip succeeds; invalid import leaves existing data intact; content and export risks are explained. |
| Clearer History and calendar presentation | P2 optional | Medium; private usage history | Confirmed dose records appear accurately; unanswered doses are not automatically called taken or missed. |
| Larger typography and touch controls | P1 accessibility requirement; optional preset | Medium layout work; high older-user value | System font scaling and any preset keep names, doses, progress, and actions readable and reachable on small phones. |
| Simple first-run onboarding | P3 optional | Medium; setup value; local completion state | Explains notification, exact-alarm, and full-screen access honestly; reaches a first reminder without claiming permissions are granted. |

### Localization approach

Use a reviewed string catalog with stable keys and a locally stored language choice. Cover UI, notifications delivered while the app is closed, alarm actions, accessibility labels, permissions, errors, and local date/time presentation. Keep stored medication and dose identities language-neutral. Never translate user-entered medicine names or doses.

### Smoking cessation boundary

Treat this as a separate, optional wellbeing area. Do not infer smoking behavior, change medication reminders or doses, give clinical advice, or claim cessation outcomes. Decide export and deletion behavior for habit records before implementation; keep records local by default and show progress only after opt-in.

## 4. UI/UX design reference

**Türkçe:** [PiliTracker](https://pilitracker.github.io/) görsel yaklaşımı, daha sakin ve sade bir V2 arayüzü için ilham kaynağıdır. Bu incelemede ana adres 404 döndü; erişilebilen [tanıtım sayfası](https://pilitracker.github.io/about/?lang=en) temiz/minimal arayüz, basit hatırlatmalar ve yerel veri yaklaşımını anlatıyordu. Ekran ayrıntıları uygulamadan önce ayrıca incelenecek. Kendi Android kimliğimizi, platform beklentilerini ve yaşça büyük kullanıcıların ihtiyaçlarını koruyacağız. PiliTracker'ın kodunu, özel görsellerini, markasını, çizimlerini, logosunu/ticari markalarını veya birebir ekran düzenlerini kopyalamayacağız; lisans ve fikrî mülkiyet sınırlarına uyacağız.

**English:** [PiliTracker](https://pilitracker.github.io/) is a visual-design reference for a calmer, simpler V2 interface. At this review its root URL returned 404; the reachable [about page](https://pilitracker.github.io/about/?lang=en) described a clean/minimal interface, simple reminders, and local data. Screen details need separate design review before implementation. Our app will retain its own visual identity, Android-native expectations, and the needs of older users. We will not copy PiliTracker source code, proprietary assets, branding, illustrations, logos/trademarks, or exact screen layouts; its license and intellectual-property boundaries must be respected.

The intended direction is modern, minimal, calm, and clean: clear typography, consistent spacing and cards, recognizable icons, readable schedules, accessible feedback and navigation, and less unnecessary visual complexity. Evaluate original prototypes with actual Android tasks and screen sizes.

## 5. Accessibility

- Support Android font scaling and large touch targets without clipping photos, names, doses, progress, or action buttons.
- Use accessible contrast in light and dark themes; selected states need shape/text cues beyond color.
- Keep Taken and five-minute snooze visually and semantically distinct, with medication-specific accessible labels.
- Preserve predictable navigation, visible focus, clear date/time formatting, and understandable errors. Test TalkBack and one-handed use on small screens.
- Validate senior-friendly claims with older-user tasks, not visual preference alone.

## 6. Privacy and offline-first principles

Medication photos, dose logs, optional inventory, and smoking data stay local by default. Do not make accounts, cloud sync, telemetry, advertising, or analytics hidden prerequisites. Export is user initiated and can expose sensitive records outside the app; specify destination, contents, protection, and deletion guidance first. Lock-screen medication display remains an explicit choice with its privacy caveat. No automatic dosage adjustment or medical advice is proposed.

## 7. Implementation priorities

1. **P0 reliability/data gate:** map SQLite schemas, notification/channel behavior, native full-screen paths, migration and recovery tests before feature work.
2. **P1 daily-use foundation:** original UI/navigation and accessibility work, Turkish/English coverage, theme tokens, and clearer medication management. Release only after alarm and data-compatibility regressions pass.
3. **P2 separate opt-in/value decisions:** smoking cessation, inventory/low-stock reminders, backup/restore, and calendar history. Scope each independently against usability, privacy, and alarm interaction cost.
4. **P3 after user research:** first-run onboarding and extra presentation presets if current controls remain confusing. Setup must never block an urgent reminder.

Order within a tier is open. Defer any feature that harms simplicity, privacy, or reminder reliability.

## 8. Testing and acceptance criteria

- **Alarm reliability:** preserve offline delivery, permitted full-screen behavior, explicit Taken action, independent dose records, five-minute snooze, same-minute two/three-medication handling, and idempotent rapid actions across foreground, background, locked screen, restart, and process death.
- **Data compatibility:** migrate a copy of v1-format test data without changing medication identities or rewriting dose history. Verify rollback/error handling and that backup import cannot partially overwrite data.
- **Localization, theme, accessibility:** inspect each core task and notification in Turkish and English, light/dark/system modes, after restart and with larger system text. Check contrast, target size, screen-reader labels, and small-device fit.
- **Feature isolation:** inventory alerts and smoking progress cannot schedule or suppress medication alarms. Test opt-in/out and export/delete paths with synthetic records.
- **Physical acceptance:** repeat Xiaomi scenarios after changes. Test Samsung and other Android/OEM combinations before claiming support; mocked tests and emulators do not establish physical acceptance. Record OS, permissions, scenario, and result.
- **Release gate:** announce no V2 proposal as implemented until tests, privacy review, migration path, and physical acceptance evidence pass.

## 9. Risks and open decisions

- Decide the smallest useful V2 scope and whether smoking tracking belongs in the main navigation or a separate opt-in area.
- Assign translation ownership and locale rules, including notification text generated without the UI process.
- Define contrast targets and behavior when the system theme changes while an alarm is visible.
- Decide whether stock changes on Taken, by manual adjustment, or both; avoid silent stock or dosage changes.
- Define backup schema/version, photo inclusion, export protection, and deletion instructions.
- Review the actual PiliTracker visuals and applicable license before prototyping; the root URL was unavailable during this review. Keep the result original.
- Android/OEM alarm restrictions, channel settings, and full-screen permission policy may change; new device claims need physical evidence.

## 10. Non-goals

This roadmap does not change v1.0.0, its APK, medication data, or public Release. It does not implement V2 features, promise a ship date, add cloud accounts or tracking, replace medical care, make treatment or cessation-success claims, or copy protected work from another product. It is a planning diff for a Draft PR only.
