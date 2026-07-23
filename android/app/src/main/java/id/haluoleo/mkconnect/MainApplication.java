package id.haluoleo.mkconnect;

import android.app.Application;
import android.content.Context;
import android.os.Process;

/**
 * Installs a global uncaught-exception handler as early as possible
 * (attachBaseContext, before any ContentProvider - including FileProvider
 * and Firebase's/WorkManager's auto-init providers pulled in transitively by
 * the native plugins - is created) so a startup crash is always captured:
 * logged to Logcat, written to crash.txt, and shown on-screen via the
 * separate-process CrashActivity, even on a device with no adb access.
 */
public class MainApplication extends Application {

    @Override
    protected void attachBaseContext(Context base) {
        super.attachBaseContext(base);
        StartupDiagnostics.log(base, "MainApplication.attachBaseContext() -- installing global crash handlers");
        installCrashHandler();
    }

    private void installCrashHandler() {
        final Context appContext = this;
        Thread.setDefaultUncaughtExceptionHandler((thread, throwable) -> {
            try {
                String report = StartupDiagnostics.reportFatal(
                    appContext,
                    "Uncaught exception on thread \"" + thread.getName() + "\"",
                    throwable
                );
                StartupDiagnostics.launchCrashActivity(appContext, report);
                // Give the separate :crash process time to actually start
                // before this (broken) process is torn down.
                Thread.sleep(400);
            } catch (Throwable ignored) {
                // Diagnostics must never be the reason the crash isn't handled.
            } finally {
                Process.killProcess(Process.myPid());
                Runtime.getRuntime().exit(10);
            }
        });
    }

    @Override
    public void onCreate() {
        super.onCreate();
        StartupDiagnostics.log(
            this,
            "MainApplication.onCreate() reached -- process/ContentProvider init " +
            "(including Firebase auto-init) completed without crashing."
        );
    }
}
