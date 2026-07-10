package id.haluoleo.mkconnect;

import android.os.Bundle;
import android.util.Log;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final String CRASH_TAG = "MKConnectStartupCrash";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        try {
            super.onCreate(savedInstanceState);
            Log.i(CRASH_TAG, "MainActivity.onCreate() completed — Capacitor Bridge + all plugins loaded without crashing.");
        } catch (Throwable t) {
            // Re-thrown after logging so MainApplication's global handler
            // (and the platform's own crash reporter) still see it — this
            // just guarantees a clearly-tagged log line confirming the
            // crash happened specifically during Activity/Bridge/plugin
            // initialization, not earlier (Application/ContentProvider) or
            // later (WebView/JS).
            Log.e(CRASH_TAG, "FATAL EXCEPTION in MainActivity.onCreate(): " + t, t);
            throw t;
        }
    }
}
