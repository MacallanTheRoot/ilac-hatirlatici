# Third-party notices

The project's [MIT license](LICENSE) covers this application's original source. Dependencies retain their own copyright and license terms. The build uses Expo and a local patch applied to the installed `expo-notifications` source; the upstream Expo notice is retained here as well as in the installed dependency package. The local patch does not remove upstream notices.

## Expo and expo-notifications — MIT

The MIT License (MIT)

Copyright (c) 2015-present 650 Industries, Inc. (aka Expo)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

The notice above is byte-for-byte the installed `expo@57.0.27` and `expo-notifications@57.0.22` `LICENSE` text. It also matches the installed Expo module licenses checked during this audit. The local full-screen patch does not remove the upstream notice.

## Assets verified in the accepted Android APK

The accepted B2 APK is identified by SHA-256 `f914803864837082fe54ad2bd3b3c1bf36feb4488fce70b544ebad0837a0cce9`. [APK evidence](third_party_licenses/APK_EVIDENCE.md) records the embedded file hashes, byte matches and version markers. The application's MIT license does not replace the terms below.

| Component and provenance | Applicable terms and retained text |
| --- | --- |
| Material Design Icons font (`res/oI.ttf`), byte-identical to the `MaterialCommunityIcons.ttf` vendored by installed `@expo/vector-icons@15.1.1` | [Pictogrammers Free License](third_party_licenses/Pictogrammers-Material-Design-Icons-LICENSE.txt); font/icons distributed under Apache 2.0, subject to the upstream license's icon exceptions. [Apache 2.0 text](third_party_licenses/Google-Material-Symbols-Apache-2.0.txt). The app uses `calendar-today`, `calendar-blank-outline`, `pill` and `history`, not brand/logo icons. The embedded font's generic “Version 1.0” does not establish the upstream icon collection release. |
| Material Symbols Regular font (`res/V6.ttf`), byte-identical to installed `@expo-google-fonts/material-symbols@0.4.48` regular font; package metadata `v99`, font internal version `2.970`, embedded copyright `Copyright 2026 Google LLC. All Rights Reserved.` | Font: [installed Apache 2.0 license text](third_party_licenses/Google-Material-Symbols-Apache-2.0.txt). Package code: [installed Expo MIT notice](third_party_licenses/Expo-Material-Symbols-MIT.txt). |
| AndroidX artifacts with embedded version markers and five Apache license resources | [Apache 2.0 text copied exactly from the APK](third_party_licenses/AndroidX-Apache-2.0-from-APK.txt). The [evidence list](third_party_licenses/APK_EVIDENCE.md) names all 80 AndroidX markers; one `androidx.arch.core` marker contains a build-task string rather than a usable version. |
| OkHttp's bundled `publicsuffixes.gz` | [Exact APK `NOTICE`](third_party_licenses/OkHttp-Public-Suffix-NOTICE-from-APK.txt) identifies the Public Suffix List and MPL 2.0; [full Mozilla MPL 2.0 text](third_party_licenses/Mozilla-Public-License-2.0.txt). The resource is byte-identical to the cached OkHttp **4.9.2** JAR and to the pinned upstream OkHttp 4.9.2 source tree. The corresponding plain-text source snapshot and verification are linked below. |

The APK also carries version markers for `com.google.android.material:material` `1.13.0` and `kotlinx.coroutines` `1.10.2`; their cached published POMs and upstream projects identify Apache 2.0. OkHttp 4.9.2's cached POM identifies Apache 2.0 and declares Okio 2.8.0; Okio's cached POM also identifies Apache 2.0. **Okio 2.8.0 is a declared dependency, not a version independently recovered from the APK.** The Apache text linked above is retained for these components; original copyright and notice resources remain inside the immutable APK. Embedded markers and cache files do not prove a complete native dependency graph.

## Public Suffix List source and redistribution

The accepted APK includes OkHttp's compiled Public Suffix List data resource (`okhttp3/internal/publicsuffix/publicsuffixes.gz`), SHA-256 `a1ef3d0e4ec2cbce14c1884ab0f3a4fef46e258de83530dc562ebb805bdb12fd`. The exact [NOTICE carried inside the APK](third_party_licenses/OkHttp-Public-Suffix-NOTICE-from-APK.txt) credits the Public Suffix List and identifies its MPL 2.0 terms. The [full MPL 2.0 license](third_party_licenses/Mozilla-Public-License-2.0.txt) is retained here. The original list's copyright/license comments remain in the source file linked next; this project did not alter the list.

**Corresponding covered source:** recipients can obtain the plain-text [`public_suffix_list.dat` snapshot](https://github.com/square/okhttp/blob/3edf17ca8a5048912d19e84d0fc2a7941a97c07d/okhttp/src/test/resources/okhttp3/internal/publicsuffix/public_suffix_list.dat) from OkHttp's pinned `parent-4.9.2` commit `3edf17ca8a5048912d19e84d0fc2a7941a97c07d` (source SHA-256 `cbbaa4b3ff5a9683c86c43ac1739dd9dc937fd0464f5e301aeb4728600581e4e`). The same commit contains the [generation instructions and code](https://github.com/square/okhttp/blob/3edf17ca8a5048912d19e84d0fc2a7941a97c07d/okhttp/src/test/java/okhttp3/internal/publicsuffix/PublicSuffixListGenerator.java) and the [compiled resource](https://github.com/square/okhttp/blob/3edf17ca8a5048912d19e84d0fc2a7941a97c07d/okhttp/src/main/resources/okhttp3/internal/publicsuffix/publicsuffixes.gz). The APK resource matches that compiled resource byte-for-byte. Independently applying the generator's sorting, exception separation and length-prefix transformation to the pinned plain-text list produces bytes identical to the decompressed APK resource (8,845 rules and 8 exceptions). This verifies the source-to-resource relationship; the current rolling list at publicsuffix.org is **not** substituted for this historical snapshot.

Under [MPL 2.0 section 3.2](https://www.mozilla.org/en-US/MPL/2.0/) and [Mozilla's guidance](https://www.mozilla.org/en-US/MPL/2.0/FAQ/), recipients of this compiled covered resource must be told how to obtain its covered source form. The pinned source link above is the release-facing access method; include a link to this notice with the APK. This obligation concerns the Public Suffix List resource, not unrelated application source. If that covered list had been modified, those modifications would require MPL source treatment; the byte match found no project modification. Independent release review should confirm the notice and source-access presentation before public distribution.

## Other installed application dependencies

The following exact installed notices are retained because the source uses these components. Their npm versions identify the local source dependency, not independently proven APK package versions.

- `@expo/vector-icons@15.1.1` package code: [MIT notice](third_party_licenses/Expo-Vector-Icons-MIT.txt). Its bundled Material Design Icons **font** has the separate terms above.
- `react@19.2.3` and `react-native@0.86.3`: identical installed [MIT notice](third_party_licenses/React-and-React-Native-MIT.txt).
- `react-native-safe-area-context@5.7.0`: installed [MIT notice](third_party_licenses/React-Native-Safe-Area-Context-MIT.txt).
- `react-native-screens@4.26.2`: installed [MIT notice](third_party_licenses/React-Native-Screens-MIT.txt).

For redistribution, retain these exact license/NOTICE texts and make them accessible alongside the APK, with a release-page link to this file and the pinned Public Suffix List source location. The [APK metadata inventory](third_party_licenses/APK_EVIDENCE.md) is supporting evidence, not itself a required user notice. Build-only tools and every transitive entry in `package-lock.json` are not automatically APK-shipped. The accepted APK has not been rebuilt or modified to add this documentation. An exhaustive native binary component inventory, the exact APK-resolved Okio version and the Pictogrammers font's upstream collection release remain unverified; independent release review should assess these limits before distribution.
