/* ==========================================================================
   Keeps the Apple development team in the generated project.

   `expo prebuild` rewrites ios/ from scratch, which throws away anything set
   by hand in Xcode — including the team picked in Signing & Capabilities. The
   result is a build that fails with "requires a development team" every time
   the native project is regenerated, on a setting that was chosen correctly
   weeks earlier.

   It applies to local builds only. On EAS the team comes from the Apple
   account the build is signed with, and a team stamped into the project by
   hand contradicts it — a free personal team id left in the file after
   enrolling in the paid programme is exactly the kind of thing that fails a
   cloud build with a signing error that mentions neither. `EAS_BUILD` is set
   by the build worker, so the plugin stands aside there.

   The team id is not a secret. It identifies which Apple account signs the
   build; signing still needs the private key in the keychain, which is not
   here and is not in the repository. Override it with APPLE_TEAM_ID when
   building locally against a different account.
   ========================================================================== */

const { withXcodeProject } = require("expo/config-plugins");

const TEAM = process.env.APPLE_TEAM_ID || "SFXV897A5H";   // anupma sud (Personal Team)

module.exports = function withDevelopmentTeam(config) {
  if (process.env.EAS_BUILD) return config;

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
