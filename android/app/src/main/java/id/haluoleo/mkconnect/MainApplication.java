package id.haluoleo.mkconnect;

import android.app.Application;
import android.content.Context;
import android.util.Log;

/**
 * Installs a global uncaught-exception handler as early as possible
 * (attachBaseContext, before any ContentProvider — including FileProvider
 * and any Firebase/WorkManager auto-init providers pulled in transitively
 * by the native plugins — is created) so a startup crash is always logged
 * to Logcat with its full stack trace under a single, greppable tag,
 * regardless of which component throws or how early it throws.
 */
public class MainApplication extends Application {

    private static final String CRASH_TAG = "MKConnectStartupCrash";

    @Override
    protected void attachBaseContext(Context base) {
        super.attachBaseContext(base);
        installCrashLogger();
    }

    private void installCrashLogger() {
        final Thread.UncaughtExceptionHandler previousHandler = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((thread, throwable) -> {
            try {
                Log.e(
                    CRASH_TAG,
                    "FATAL EXCEPTION during startup on thread \"" + thread.getName() + "\": " + throwable,
                    throwable
                );
            } catch (Throwable loggingFailure) {
                // Never let the crash logger itself become the reason the
                // original crash report is lost.
            }
            if (previousHandler != null) {
                previousHandler.uncaughtException(thread, throwable);
            } else {
                // No previous handler (shouldn't normally happen): fall
                // back to killing the process the same way the platform
                // default handler would, so behavior stays unchanged.
                Runtime.getRuntime().exit(10);
            }
        });
    }

    @Override
    public void onCreate() {
        super.onCreate();
        Log.i(CRASH_TAG, "MainApplication.onCreate() reached — process/ContentProvider init completed without crashing.");
    }
}
