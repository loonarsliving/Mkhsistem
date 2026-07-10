package id.haluoleo.mkconnect;

import android.graphics.Bitmap;
import android.os.Bundle;
import android.webkit.ConsoleMessage;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        StartupDiagnostics.log(this, "MainActivity.onCreate() starting");
        try {
            // Capacitor Bridge creation + every plugin's load() runs inside
            // this call - this is the step most likely to throw if a native
            // plugin (biometric, push-notifications/Firebase, camera, etc.)
            // fails to initialize.
            super.onCreate(savedInstanceState);
            StartupDiagnostics.log(
                this,
                "MainActivity.onCreate() -- super.onCreate() returned, Capacitor Bridge initialized.\n" +
                "Registered plugins:\n" + StartupDiagnostics.pluginList(this)
            );
            attachWebViewDiagnostics();
        } catch (Throwable t) {
            String report = StartupDiagnostics.reportFatal(
                this,
                "MainActivity.onCreate() (Capacitor Bridge / plugin initialization)",
                t
            );
            StartupDiagnostics.launchCrashActivity(this, report);
            finish();
        }
    }

    /**
     * Wraps the WebView with diagnostic-only subclasses of Capacitor's own
     * client classes (the pattern Capacitor itself exposes via
     * Bridge#setWebViewClient for exactly this purpose) so page-load and
     * JS-console failures are visible even though they are not Java
     * exceptions and would otherwise never reach the uncaught-exception
     * handler. Every override still delegates to super so Capacitor's own
     * bridging/navigation behavior is unchanged.
     */
    private void attachWebViewDiagnostics() {
        try {
            Bridge bridge = getBridge();
            if (bridge == null || bridge.getWebView() == null) {
                StartupDiagnostics.log(this, "attachWebViewDiagnostics() -- bridge/WebView not available, skipping");
                return;
            }
            final WebView webView = bridge.getWebView();

            bridge.setWebViewClient(new BridgeWebViewClient(bridge) {
                @Override
                public void onPageStarted(WebView view, String url, Bitmap favicon) {
                    super.onPageStarted(view, url, favicon);
                    StartupDiagnostics.log(MainActivity.this, "WebView onPageStarted: " + url);
                }

                @Override
                public void onPageFinished(WebView view, String url) {
                    super.onPageFinished(view, url);
                    StartupDiagnostics.log(MainActivity.this, "WebView onPageFinished: " + url);
                }

                @Override
                public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                    super.onReceivedError(view, request, error);
                    boolean mainFrame = request != null && request.isForMainFrame();
                    String detail = "url=" + (request != null ? request.getUrl() : "?")
                        + " mainFrame=" + mainFrame
                        + " error=" + (error != null ? error.getDescription() : "?");
                    StartupDiagnostics.log(MainActivity.this, "WebView onReceivedError: " + detail);
                    if (mainFrame) {
                        String report = StartupDiagnostics.reportFatal(
                            MainActivity.this,
                            "WebView failed to load the main page (production URL unreachable)",
                            new RuntimeException("WebView onReceivedError (main frame): " + detail)
                        );
                        StartupDiagnostics.launchCrashActivity(MainActivity.this, report);
                    }
                }

                @Override
                public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
                    super.onReceivedHttpError(view, request, errorResponse);
                    StartupDiagnostics.log(
                        MainActivity.this,
                        "WebView onReceivedHttpError: url=" + (request != null ? request.getUrl() : "?")
                            + " status=" + (errorResponse != null ? errorResponse.getStatusCode() : "?")
                    );
                }

                @Override
                public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                    String report = StartupDiagnostics.reportFatal(
                        MainActivity.this,
                        "WebView render process gone",
                        new RuntimeException(
                            "onRenderProcessGone: didCrash=" + detail.didCrash()
                                + " rendererPriorityAtExit=" + detail.rendererPriorityAtExit()
                        )
                    );
                    StartupDiagnostics.launchCrashActivity(MainActivity.this, report);
                    finish();
                    return true; // handled -- do not let the platform crash the app a second time
                }
            });

            webView.setWebChromeClient(new BridgeWebChromeClient(bridge) {
                @Override
                public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
                    if (consoleMessage.messageLevel() == ConsoleMessage.MessageLevel.ERROR) {
                        StartupDiagnostics.log(
                            MainActivity.this,
                            "WebView JS console error: " + consoleMessage.message()
                                + " (" + consoleMessage.sourceId() + ":" + consoleMessage.lineNumber() + ")"
                        );
                    }
                    return super.onConsoleMessage(consoleMessage);
                }
            });

            StartupDiagnostics.log(this, "attachWebViewDiagnostics() -- diagnostic WebViewClient/WebChromeClient attached");
        } catch (Throwable t) {
            // Non-fatal: the app can still run without these hooks attached.
            StartupDiagnostics.log(this, "attachWebViewDiagnostics() failed non-fatally: " + t);
        }
    }
}
