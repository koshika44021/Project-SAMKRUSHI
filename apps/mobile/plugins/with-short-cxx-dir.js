// Expo config plugin: optional short CMake staging directory for native
// modules. Windows toolchains fail when pnpm's deep virtual-store paths plus
// CMake scratch folders exceed path limits. When (and only when) the
// environment variable SAMKRUSHI_CXX_DIR is set at build time, every Android
// library/app's CMake build staging directory is redirected under it.
// EAS/CI builds do not set the variable and are unaffected.
//
// Registered in settings.gradle via gradle.beforeProject so the hook is in
// place before each project's build script applies the Android plugin (AGP
// locks this DSL after evaluation).
const { withSettingsGradle } = require('expo/config-plugins');

const MARKER = '// samkrushi:short-cxx-dir';

const SNIPPET = `
${MARKER}
def samkrushiCxxRoot = System.getenv("SAMKRUSHI_CXX_DIR")
if (samkrushiCxxRoot) {
  gradle.beforeProject { p ->
    ["com.android.library", "com.android.application"].each { pluginId ->
      p.plugins.withId(pluginId) {
        p.android.externalNativeBuild.cmake.buildStagingDirectory = new File(samkrushiCxxRoot, p.name)
      }
    }
  }
}
`;

module.exports = function withShortCxxDir(config) {
  return withSettingsGradle(config, (mod) => {
    if (mod.modResults.language === 'groovy' && !mod.modResults.contents.includes(MARKER)) {
      mod.modResults.contents += SNIPPET;
    }
    return mod;
  });
};
