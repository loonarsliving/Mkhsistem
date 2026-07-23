package id.haluoleo.mkconnect;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.os.Build;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Self-diagnosis helpers shared by MainApplication, MainActivity and
 * CrashActivity. Every method here must be safe to call from inside a crash
 * handler, so every failure path is swallowed internally instead of thrown -
 * diagnostics must never become a second reason startup fails.
 */
final class StartupDiagnostics {

    static final String LOG_TAG = "MKConnectStartupCrash";
    static final String EXTRA_REPORT = "id.haluoleo.mkconnect.extra.CRASH_REPORT";

    // Pinned in package.json at build time; there is no runtime API to read
    // the Capacitor core version, so this is kept in sync by hand.
    private static final String CAPACITOR_CORE_VERSION = "8.4.1";

    private static final String STARTUP_LOG_FILE = "startup.log";
    private static final String CRASH_REPORT_FILE = "crash.txt";
    private static final long MAX_STARTUP_LOG_BYTES = 256 * 1024;

    private StartupDiagnostics() {}

    /** Appends a timestamped line to Logcat and to startup.log. Never throws. */
    static void log(Context context, String message) {
        try {
            Log.i(LOG_TAG, message);
        } catch (Throwable ignored) {}
        try {
            writeToFile(context, STARTUP_LOG_FILE, timestamp() + "  " + message + "\n", true);
        } catch (Throwable ignored) {}
    }

    /**
     * Builds the full crash report, logs it, writes it to crash.txt, and
     * returns the text so the caller can hand it to CrashActivity. Never
     * throws.
     */
    static String reportFatal(Context context, String origin, Throwable throwable) {
        String report;
        try {
            report = buildReport(context, origin, throwable);
        } catch (Throwable buildFailure) {
            report = "MK Connect crash reporter itself failed while building the report: "
                + buildFailure + "\n\nOriginal exception (" + origin + "): " + throwable;
        }
        try {
            Log.e(LOG_TAG, report);
        } catch (Throwable ignored) {}
        try {
            writeToFile(context, CRASH_REPORT_FILE, report, false);
        } catch (Throwable ignored) {}
        return report;
    }

    private static String buildReport(Context context, String origin, Throwable throwable) {
        StringBuilder sb = new StringBuilder();
        sb.append("MK Connect startup crash report\n");
        sb.append("Generated: ").append(timestamp()).append("\n");
        sb.append("Origin: ").append(origin).append("\n\n");

        sb.append("=== Exception ===\n");
        if (throwable != null) {
            sb.append("Class: ").append(throwable.getClass().getName()).append("\n");
            sb.append("Message: ").append(throwable.getMessage()).append("\n\n");
            sb.append("=== Full stack trace (includes \"Caused by\" chain) ===\n");
            sb.append(Log.getStackTraceString(throwable)).append("\n");
        } else {
            sb.append("(no throwable supplied)\n");
        }

        sb.append("\n=== Device ===\n");
        sb.append("Manufacturer: ").append(Build.MANUFACTURER).append("\n");
        sb.append("Brand: ").append(Build.BRAND).append("\n");
        sb.append("Model: ").append(Build.MODEL).append("\n");
        sb.append("Device: ").append(Build.DEVICE).append("\n");
        sb.append("Android version: ").append(Build.VERSION.RELEASE)
            .append(" (SDK ").append(Build.VERSION.SDK_INT).append(")\n");
        sb.append("Primary ABI: ")
            .append(Build.SUPPORTED_ABIS.length > 0 ? Build.SUPPORTED_ABIS[0] : "unknown").append("\n");

        sb.append("\n=== App ===\n");
        sb.append("Package: ").append(context.getPackageName()).append("\n");
        try {
            PackageInfo info = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
            sb.append("Version name: ").append(info.versionName).append("\n");
            long versionCode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                ? info.getLongVersionCode()
                : info.versionCode;
            sb.append("Version code: ").append(versionCode).append("\n");
        } catch (Throwable t) {
            sb.append("Version: unavailable (").append(t).append(")\n");
        }
        sb.append("Capacitor core (pinned at build time): ").append(CAPACITOR_CORE_VERSION).append("\n");

        sb.append("\n=== Registered Capacitor plugins (capacitor.plugins.json) ===\n");
        sb.append(pluginList(context));

        return sb.toString();
    }

    /** Reads the build-generated plugin manifest. Safe to call at any time, even pre-Bridge-init. */
    static String pluginList(Context context) {
        StringBuilder sb = new StringBuilder();
        try (InputStream is = context.getAssets().open("capacitor.plugins.json")) {
            BufferedReader reader = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8));
            StringBuilder raw = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                raw.append(line);
            }
            JSONArray plugins = new JSONArray(raw.toString());
            for (int i = 0; i < plugins.length(); i++) {
                JSONObject plugin = plugins.getJSONObject(i);
                sb.append("- ").append(plugin.optString("pkg", "?"))
                    .append(" -> ").append(plugin.optString("classpath", "?")).append("\n");
            }
        } catch (Throwable t) {
            sb.append("(could not read capacitor.plugins.json: ").append(t).append(")\n");
        }
        return sb.toString();
    }

    /** Launches the standalone (separate-process) crash screen. Never throws. */
    static void launchCrashActivity(Context context, String report) {
        try {
            Intent intent = new Intent(context, CrashActivity.class);
            intent.addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_CLEAR_TASK
            );
            intent.putExtra(EXTRA_REPORT, report);
            context.startActivity(intent);
        } catch (Throwable ignored) {
            // Logcat + crash.txt remain as the fallback record.
        }
    }

    private static void writeToFile(Context context, String fileName, String content, boolean append) {
        File dir = context.getExternalFilesDir(null);
        if (dir == null) {
            dir = context.getFilesDir();
        }
        File file = new File(dir, fileName);
        if (append && file.exists() && file.length() > MAX_STARTUP_LOG_BYTES) {
            file.delete();
        }
        try (FileWriter writer = new FileWriter(file, append)) {
            writer.write(content);
        } catch (IOException ignored) {
        }
    }

    private static String timestamp() {
        return new SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS", Locale.US).format(new Date());
    }
}
