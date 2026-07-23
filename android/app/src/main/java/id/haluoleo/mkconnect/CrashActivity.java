package id.haluoleo.mkconnect;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

/**
 * Standalone crash-report screen. Declared with android:process=":crash" in
 * the manifest so it runs in its own OS process - it can render even when
 * the main app process crashed beyond recovery. Built entirely from
 * framework widgets and a built-in system theme (no app resources, no
 * Capacitor classes) so nothing about the original crash can also break
 * this screen.
 */
public class CrashActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        String report = getIntent() != null ? getIntent().getStringExtra(StartupDiagnostics.EXTRA_REPORT) : null;
        if (report == null || report.isEmpty()) {
            report = "No crash report text was passed to CrashActivity.";
        }
        final String reportText = report;

        int padding = dp(16);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(padding, padding, padding, padding);
        root.setBackgroundColor(Color.WHITE);

        TextView title = new TextView(this);
        title.setText("MK Connect crashed on startup");
        title.setTextColor(Color.parseColor("#B00020"));
        title.setTypeface(null, Typeface.BOLD);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
        root.addView(title);

        TextView subtitle = new TextView(this);
        subtitle.setText(
            "Copy or share this report so it can be diagnosed. A copy was also saved to " +
            "Android/data/id.haluoleo.mkconnect/files/crash.txt on this device."
        );
        subtitle.setTextColor(Color.DKGRAY);
        subtitle.setPadding(0, dp(8), 0, dp(8));
        root.addView(subtitle);

        LinearLayout buttonRow = new LinearLayout(this);
        buttonRow.setOrientation(LinearLayout.HORIZONTAL);

        Button copyButton = new Button(this);
        copyButton.setText("Copy report");
        copyButton.setOnClickListener(v -> {
            ClipboardManager clipboard = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
            if (clipboard != null) {
                clipboard.setPrimaryClip(ClipData.newPlainText("MK Connect crash report", reportText));
                Toast.makeText(CrashActivity.this, "Report copied to clipboard", Toast.LENGTH_SHORT).show();
            }
        });
        buttonRow.addView(copyButton);

        Button shareButton = new Button(this);
        shareButton.setText("Share report");
        shareButton.setOnClickListener(v -> {
            Intent shareIntent = new Intent(Intent.ACTION_SEND);
            shareIntent.setType("text/plain");
            shareIntent.putExtra(Intent.EXTRA_SUBJECT, "MK Connect startup crash report");
            shareIntent.putExtra(Intent.EXTRA_TEXT, reportText);
            startActivity(Intent.createChooser(shareIntent, "Share crash report"));
        });
        LinearLayout.LayoutParams shareParams = new LinearLayout.LayoutParams(
            0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f
        );
        shareParams.setMarginStart(dp(8));
        buttonRow.addView(shareButton, shareParams);

        root.addView(buttonRow);

        TextView body = new TextView(this);
        body.setText(reportText);
        body.setTextIsSelectable(true);
        body.setTypeface(Typeface.MONOSPACE);
        body.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        body.setPadding(0, dp(16), 0, 0);

        ScrollView scroll = new ScrollView(this);
        scroll.addView(body);
        root.addView(
            scroll,
            new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f)
        );

        setContentView(root);
    }

    private int dp(int value) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, getResources().getDisplayMetrics());
    }
}
