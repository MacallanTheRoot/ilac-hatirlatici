const { withMainActivity, withMainApplication } = require('expo/config-plugins');

// Expo SDK 57's Android template can leave the Kotlin package derived from the
// Turkish display name while Gradle uses android.package. Keep them aligned in
// generated native files without committing an android/ directory.
function withAndroidKotlinPackage(config) {
  const packageName = config.android?.package;
  if (!packageName) {
    throw new Error('android.package is required for the generated Kotlin package');
  }

  const alignPackage = (mod) => {
    if (mod.modResults.language !== 'kt') {
      throw new Error('Expected Kotlin Android application sources');
    }
    const source = mod.modResults.contents;
    if (!/^package [\w.]+/m.test(source)) {
      throw new Error('Generated Kotlin source has no package declaration');
    }
    mod.modResults.contents = source.replace(/^package [\w.]+/m, `package ${packageName}`);
    return mod;
  };

  config = withMainActivity(config, alignPackage);
  return withMainApplication(config, alignPackage);
}

module.exports = withAndroidKotlinPackage;
