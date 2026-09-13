/* ==========================================================================
   Drops the Push Notifications entitlement.

   expo-notifications adds `aps-environment` to the entitlements whether or
   not the app ever asks for a push token. This one never does: the reminder
   is scheduled by the phone itself, which needs no entitlement, no server and
   no capability — see src/reminders.native.js.

   Declaring it anyway costs something real. A free Apple ID cannot sign an
   app that claims the Push Notifications capability at all, so the
   entitlement alone is the difference between "installs on your phone" and
   "Personal development teams do not support the Push Notifications
   capability". On a paid account it would build, and would still be a claim
   to a capability the app does not use.

   This runs at prebuild, so the fix survives regeneration here and on EAS
   rather than being an edit to ios/ that the next build quietly undoes.
   ========================================================================== */

const { withEntitlementsPlist } = require("expo/config-plugins");

module.exports = function withoutPushEntitlement(config) {
  return withEntitlementsPlist(config, (cfg) => {
    delete cfg.modResults["aps-environment"];
    return cfg;
  });
};
