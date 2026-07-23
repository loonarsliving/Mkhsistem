package id.haluoleo.mkconnect;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.firebase.FirebaseApp;

/**
 * Exposes whether a default FirebaseApp exists, so lib/native/push.ts can
 * skip push-notification registration instead of crashing.
 * FirebaseMessaging.getInstance() (called by
 * @capacitor/push-notifications' PushNotificationsPlugin#register())
 * throws IllegalStateException whenever no default FirebaseApp is
 * initialized -- which is exactly what happens on any build that doesn't
 * have a real google-services.json in android/app/ yet (see
 * docs/android/BUILD.md). Once that file is added, the Google Services
 * Gradle plugin (conditionally applied in app/build.gradle) generates the
 * resources Firebase's own auto-init ContentProvider needs, a default
 * FirebaseApp exists automatically, and this starts returning true with no
 * further code changes required.
 */
@CapacitorPlugin(name = "FirebaseStatus")
public class FirebaseStatusPlugin extends Plugin {

    @PluginMethod
    public void isConfigured(PluginCall call) {
        boolean configured = !FirebaseApp.getApps(getContext()).isEmpty();
        JSObject result = new JSObject();
        result.put("configured", configured);
        call.resolve(result);
    }
}
