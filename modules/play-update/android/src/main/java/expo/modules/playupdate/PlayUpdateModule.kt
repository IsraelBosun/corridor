package expo.modules.playupdate

import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.appupdate.AppUpdateOptions
import com.google.android.play.core.install.model.AppUpdateType
import com.google.android.play.core.install.model.UpdateAvailability
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Google Play's in-app update screen. Play draws it, downloads the update and
 * restarts the app. Resolves true if the screen was shown. It only works on
 * an install that came from Play, and resolves false anywhere else.
 */
class PlayUpdateModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PlayUpdate")

    AsyncFunction("promptIfAvailable") { promise: Promise ->
      val context = appContext.reactContext
      val activity = appContext.currentActivity
      if (context == null || activity == null) {
        promise.resolve(false)
      } else {
        val manager = AppUpdateManagerFactory.create(context)
        manager.appUpdateInfo
          .addOnSuccessListener { info ->
            val availability = info.updateAvailability()
            val ready = availability == UpdateAvailability.UPDATE_AVAILABLE &&
              info.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE)
            // Someone left an update part way through: pick it up again.
            val resume = availability == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS
            if (ready || resume) {
              manager
                .startUpdateFlow(info, activity, AppUpdateOptions.defaultOptions(AppUpdateType.IMMEDIATE))
                .addOnSuccessListener { promise.resolve(true) }
                .addOnFailureListener { promise.resolve(false) }
            } else {
              promise.resolve(false)
            }
          }
          .addOnFailureListener { promise.resolve(false) }
      }
    }
  }
}
