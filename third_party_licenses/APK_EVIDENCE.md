# Accepted B2 APK third-party evidence

Build `4019c617-63f7-4bc4-aa8c-18df39d5fe75`; SHA-256 `f914803864837082fe54ad2bd3b3c1bf36feb4488fce70b544ebad0837a0cce9`. These are ZIP members and embedded metadata from the accepted APK, not a full software bill of materials. A version marker does not, by itself, prove which classes survived shrinking.

## Byte-matched font assets

| APK member | Font family / embedded version | SHA-256 | Installed byte match |
| --- | --- | --- | --- |
| `res/V6.ttf` | Material Symbols Regular / 2.970; metadata package v99 | `8f57384eaa4ecdb719ca491147d53505fb48dcc44534c61355316c2409660fef` | `@expo-google-fonts/material-symbols@0.4.48/400Regular/MaterialSymbols_400Regular.ttf` |
| `res/oI.ttf` | Material Design Icons / embedded version 1.0 (not a reliable upstream release number) | `61e8aba5a4e981fe22cf7c8e8bcdbea00476e75c62c37f01bf7ee33361d68428` | `@expo/vector-icons@15.1.1` vendored `MaterialCommunityIcons.ttf` |

## Embedded license and notice resources

| APK member | Bytes | SHA-256 |
| --- | ---: | --- |
| `META-INF/androidx/annotation/annotation/LICENSE.txt` | 10175 | `809fa1ed21450f59827d1e9aec720bbc4b687434fa22283c6cb5dd82a47ab9c0` |
| `META-INF/androidx/collection/collection-ktx/LICENSE.txt` | 10175 | `809fa1ed21450f59827d1e9aec720bbc4b687434fa22283c6cb5dd82a47ab9c0` |
| `META-INF/androidx/collection/collection/LICENSE.txt` | 10175 | `809fa1ed21450f59827d1e9aec720bbc4b687434fa22283c6cb5dd82a47ab9c0` |
| `META-INF/androidx/lifecycle/lifecycle-common-java8/LICENSE.txt` | 10175 | `809fa1ed21450f59827d1e9aec720bbc4b687434fa22283c6cb5dd82a47ab9c0` |
| `META-INF/androidx/lifecycle/lifecycle-common/LICENSE.txt` | 10175 | `809fa1ed21450f59827d1e9aec720bbc4b687434fa22283c6cb5dd82a47ab9c0` |
| `okhttp3/internal/publicsuffix/NOTICE` | 218 | `8a9c58fbded5ea3474315e4a9824ca8b1486098a1a03e897e0b19419d5e1876a` |

`okhttp3/internal/publicsuffix/publicsuffixes.gz` is present. Its SHA-256 is `a1ef3d0e4ec2cbce14c1884ab0f3a4fef46e258de83530dc562ebb805bdb12fd`. This resource and its NOTICE match the locally cached published `okhttp-4.9.2.jar` byte-for-byte; the cached `okhttp-4.12.0.jar` has a different list resource. A DEX string `okhttp/4.9.2` corroborates the 4.9.2 identification. This pins the bundled **resource** to that JAR, though shrinker output and the absence of a retained resolved dependency report limit proof of every class's origin. The cached OkHttp 4.9.2 POM identifies Apache 2.0 and declares `com.squareup.okio:okio:2.8.0`; the cached Okio 2.8.0 POM also identifies Apache 2.0. The exact Okio version included in the APK is not independently proven by the POM alone.

The accepted EAS build's read-only log was accessible, but contains no OkHttp, Okio, AndroidX or coroutine dependency coordinates or resolved Gradle graph. The signed log URL is intentionally not retained in release documentation. No generated root `android/` project or EAS upload archive is available locally.

The APK resource also matches the `publicsuffixes.gz` file in OkHttp's pinned `parent-4.9.2` commit [`3edf17ca8a5048912d19e84d0fc2a7941a97c07d`](https://github.com/square/okhttp/tree/3edf17ca8a5048912d19e84d0fc2a7941a97c07d). That commit retains the preferred modifiable [plain-text list snapshot](https://github.com/square/okhttp/blob/3edf17ca8a5048912d19e84d0fc2a7941a97c07d/okhttp/src/test/resources/okhttp3/internal/publicsuffix/public_suffix_list.dat), 220,051 bytes, SHA-256 `cbbaa4b3ff5a9683c86c43ac1739dd9dc937fd0464f5e301aeb4728600581e4e`, and its [generator](https://github.com/square/okhttp/blob/3edf17ca8a5048912d19e84d0fc2a7941a97c07d/okhttp/src/test/java/okhttp3/internal/publicsuffix/PublicSuffixListGenerator.java). A read-only independent transformation of the source's 8,845 ordinary rules and 8 exception rules, following the generator's UTF-8 byte sorting and length-prefix format, matched the decompressed APK resource exactly (104,170 bytes). The compiled `.gz` bytes also match the pinned commit exactly. The current rolling [upstream list](https://github.com/publicsuffix/list) is not used as a substitute for this historical source snapshot.

## Embedded version markers

These 84 values are copied from `META-INF/*.version`. The `androidx.arch.core` marker is a build-task string rather than a usable version.

| Marker | Embedded value |
| --- | --- |
| `androidx.activity_activity-compose` | `1.11.0` |
| `androidx.activity_activity-ktx` | `1.11.0` |
| `androidx.activity_activity` | `1.11.0` |
| `androidx.annotation_annotation-experimental` | `1.4.1` |
| `androidx.appcompat_appcompat-resources` | `1.7.1` |
| `androidx.appcompat_appcompat` | `1.7.1` |
| `androidx.arch.core_core-runtime` | `task ':arch:core:core-runtime:writeVersionFile' property 'version'` |
| `androidx.autofill_autofill` | `1.3.0` |
| `androidx.cardview_cardview` | `1.0.0` |
| `androidx.compose.animation_animation-core` | `1.11.0-beta02` |
| `androidx.compose.animation_animation` | `1.11.0-beta02` |
| `androidx.compose.foundation_foundation-layout` | `1.11.0-beta02` |
| `androidx.compose.foundation_foundation` | `1.11.0-beta02` |
| `androidx.compose.material3_material3` | `1.5.0-alpha17` |
| `androidx.compose.material_material-ripple` | `1.11.0-beta02` |
| `androidx.compose.runtime_runtime-annotation` | `1.11.0-beta02` |
| `androidx.compose.runtime_runtime-retain` | `1.11.0-beta02` |
| `androidx.compose.runtime_runtime-saveable` | `1.11.0-beta02` |
| `androidx.compose.runtime_runtime` | `1.11.0-beta02` |
| `androidx.compose.ui_ui-geometry` | `1.11.0-beta02` |
| `androidx.compose.ui_ui-graphics` | `1.11.0-beta02` |
| `androidx.compose.ui_ui-text` | `1.11.0-beta02` |
| `androidx.compose.ui_ui-unit` | `1.11.0-beta02` |
| `androidx.compose.ui_ui-util` | `1.11.0-beta02` |
| `androidx.compose.ui_ui` | `1.11.0-beta02` |
| `androidx.coordinatorlayout_coordinatorlayout` | `1.2.0` |
| `androidx.core_core-ktx` | `1.18.0` |
| `androidx.core_core-viewtree` | `1.0.0` |
| `androidx.core_core` | `1.18.0` |
| `androidx.cursoradapter_cursoradapter` | `1.0.0` |
| `androidx.customview_customview-poolingcontainer` | `1.0.0` |
| `androidx.customview_customview` | `1.1.0` |
| `androidx.databinding_viewbinding` | `8.12.0` |
| `androidx.datastore_datastore-core` | `1.1.7` |
| `androidx.datastore_datastore-preferences-core` | `1.1.7` |
| `androidx.datastore_datastore-preferences` | `1.1.7` |
| `androidx.datastore_datastore` | `1.1.7` |
| `androidx.documentfile_documentfile` | `1.1.0` |
| `androidx.drawerlayout_drawerlayout` | `1.1.1` |
| `androidx.dynamicanimation_dynamicanimation` | `1.1.0` |
| `androidx.emoji2_emoji2-views-helper` | `1.4.0` |
| `androidx.emoji2_emoji2` | `1.4.0` |
| `androidx.exifinterface_exifinterface` | `1.4.1` |
| `androidx.fragment_fragment-ktx` | `1.8.9` |
| `androidx.fragment_fragment` | `1.8.9` |
| `androidx.graphics_graphics-path` | `1.0.1` |
| `androidx.graphics_graphics-shapes` | `1.1.0` |
| `androidx.interpolator_interpolator` | `1.0.0` |
| `androidx.legacy_legacy-support-core-utils` | `1.0.0` |
| `androidx.lifecycle_lifecycle-livedata-core-ktx` | `2.10.0` |
| `androidx.lifecycle_lifecycle-livedata-core` | `2.10.0` |
| `androidx.lifecycle_lifecycle-livedata` | `2.10.0` |
| `androidx.lifecycle_lifecycle-process` | `2.10.0` |
| `androidx.lifecycle_lifecycle-runtime-compose` | `2.10.0` |
| `androidx.lifecycle_lifecycle-runtime-ktx` | `2.10.0` |
| `androidx.lifecycle_lifecycle-runtime` | `2.10.0` |
| `androidx.lifecycle_lifecycle-viewmodel-ktx` | `2.10.0` |
| `androidx.lifecycle_lifecycle-viewmodel-savedstate` | `2.10.0` |
| `androidx.lifecycle_lifecycle-viewmodel` | `2.10.0` |
| `androidx.loader_loader` | `1.0.0` |
| `androidx.localbroadcastmanager_localbroadcastmanager` | `1.0.0` |
| `androidx.print_print` | `1.0.0` |
| `androidx.profileinstaller_profileinstaller` | `1.4.0` |
| `androidx.recyclerview_recyclerview` | `1.2.1` |
| `androidx.savedstate_savedstate-compose` | `1.4.0` |
| `androidx.savedstate_savedstate-ktx` | `1.4.0` |
| `androidx.savedstate_savedstate` | `1.4.0` |
| `androidx.startup_startup-runtime` | `1.1.1` |
| `androidx.swiperefreshlayout_swiperefreshlayout` | `1.1.0` |
| `androidx.tracing_tracing-ktx` | `1.2.0` |
| `androidx.tracing_tracing` | `1.2.0` |
| `androidx.transition_transition-ktx` | `1.7.0` |
| `androidx.transition_transition` | `1.7.0` |
| `androidx.vectordrawable_vectordrawable-animated` | `1.1.0` |
| `androidx.vectordrawable_vectordrawable` | `1.1.0` |
| `androidx.versionedparcelable_versionedparcelable` | `1.1.1` |
| `androidx.viewpager2_viewpager2` | `1.0.0` |
| `androidx.viewpager_viewpager` | `1.0.0` |
| `androidx.window_window-core` | `1.5.1` |
| `androidx.window_window` | `1.5.1` |
| `com.google.android.material_material` | `1.13.0` |
| `kotlinx_coroutines_android` | `1.10.2` |
| `kotlinx_coroutines_core` | `1.10.2` |
| `kotlinx_coroutines_play_services` | `1.10.2` |
