/* ==========================================================================
   Keeps the Apple development team in the generated project.

   `expo prebuild` rewrites ios/ from scratch, which throws away anything set
   by hand in Xcode — including the team picked in Signing & Capabilities. The
   result is a build that fails with "requires a development team" every time
   the native project is regenerated, on a setting that was chosen correctly
   weeks earlier.

   The team id is not a secret. It identifies which Apple account signs the
   build; signing still needs the private key in the keychain, which is not
   here and is not in the repository.
   ========================================================================== */

const { withXcodeProject } = require("expo/config-plugins");

const TEAM = "SFXV897A5H";   // anupma sud (Personal Team)

module.exports = function withDevelopmentTeam(config) {
  return withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const configurations = project.pbxXCBuildConfigurationSection();
    Object.values(configurations).forEach((entry) => {
      if (!entry || typeof entry !== "object" || !entry.buildSettings) return;
      // Only the app target: the Pods projects have their own settings and do
      // not want a team.
      if (entry.buildSettings.PRODUCT_BUNDLE_IDENTIFIER) {
        entry.buildSettings.DEVELOPMENT_TEAM = TEAM;
      }
    });
    return cfg;
  });
};
