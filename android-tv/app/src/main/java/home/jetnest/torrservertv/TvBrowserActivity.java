package home.jetnest.torrservertv;

import android.annotation.SuppressLint;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.activity.OnBackPressedCallback;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.Collections;
import org.json.JSONObject;
import org.json.JSONException;

public final class TvBrowserActivity extends AppCompatActivity {
    private static final String TAG = "TorrServerTV";
    private WebView webView;
    private LinearLayout errorPanel;
    private String navigationScript;
    private String serverUrl;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        TvFrameRate.recover(this);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        hideSystemUi();
        serverUrl = AppPreferences.serverUrl(this);
        navigationScript = readAsset("tv-navigation.js");
        buildUi();
        configureWebView();
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() { handleBack(); }
        });
        webView.loadUrl(serverUrl);
    }

    private void buildUi() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(7, 17, 31));
        webView = new WebView(this);
        root.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        errorPanel = new LinearLayout(this);
        errorPanel.setOrientation(LinearLayout.VERTICAL);
        errorPanel.setGravity(Gravity.CENTER);
        errorPanel.setPadding(dp(48), dp(48), dp(48), dp(48));
        errorPanel.setBackgroundColor(Color.rgb(7, 17, 31));
        TextView message = new TextView(this);
        message.setText(R.string.connection_error);
        message.setTextColor(Color.WHITE);
        message.setTextSize(24);
        message.setGravity(Gravity.CENTER);
        errorPanel.addView(message);
        Button retry = new Button(this);
        retry.setText(R.string.retry);
        retry.setTextSize(20);
        retry.setOnClickListener(v -> {
            errorPanel.setVisibility(View.GONE);
            webView.reload();
        });
        LinearLayout.LayoutParams retryParams = new LinearLayout.LayoutParams(dp(260), dp(72));
        retryParams.topMargin = dp(28);
        errorPanel.addView(retry, retryParams);
        Button settings = new Button(this);
        settings.setText(R.string.settings_title);
        settings.setTextSize(18);
        settings.setOnClickListener(v -> showSettings());
        LinearLayout.LayoutParams settingsParams = new LinearLayout.LayoutParams(dp(320), dp(64));
        settingsParams.topMargin = dp(16);
        errorPanel.addView(settings, settingsParams);
        errorPanel.setVisibility(View.GONE);
        root.addView(errorPanel, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
    }

    @SuppressLint({"SetJavaScriptEnabled", "JavascriptInterface"})
    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        settings.setSupportMultipleWindows(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setUserAgentString(settings.getUserAgentString() + " TorrServerTV/0.2 TV");
        WebView.setWebContentsDebuggingEnabled(
                (getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0);
        webView.setBackgroundColor(Color.rgb(7, 17, 31));
        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);
        webView.addJavascriptInterface(new AppBridge(), "AndroidTorrServer");
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (!"GET".equals(request.getMethod()) ||
                        !StreamUrls.belongsToServer(request.getUrl().toString(), serverUrl)) return null;
                String path = request.getUrl().getPath();
                if (path == null) return null;
                if (path.equals("/") || path.isEmpty()) path = "/index.html";
                boolean bundled = path.equals("/index.html") || path.startsWith("/static/") ||
                        path.equals("/site.webmanifest") || path.startsWith("/favicon") ||
                        path.startsWith("/apple-touch-icon") || path.startsWith("/android-chrome");
                if (!bundled) return null;
                String mime = path.endsWith(".html") ? "text/html" :
                        path.endsWith(".js") ? "application/javascript" :
                        path.endsWith(".css") ? "text/css" :
                        path.endsWith(".woff2") ? "font/woff2" :
                        path.endsWith(".svg") ? "image/svg+xml" :
                        path.endsWith(".png") ? "image/png" :
                        path.endsWith(".ico") ? "image/x-icon" : "application/json";
                try {
                    if (path.contains("..")) throw new IOException("Invalid asset path");
                    return new WebResourceResponse(mime, "UTF-8", 200, "OK",
                            Collections.singletonMap("Cache-Control", "no-cache"),
                            getAssets().open("cinema" + path));
                } catch (IOException ignored) {
                    return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found",
                            Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return routeUrl(request.getUrl().toString());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return routeUrl(url);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (!StreamUrls.belongsToServer(url, serverUrl)) return;
                errorPanel.setVisibility(View.GONE);
                view.evaluateJavascript(navigationScript, null);
                if (!view.hasFocus()) view.requestFocus();
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) errorPanel.setVisibility(View.VISIBLE);
            }
        });
    }

    private boolean routeUrl(String url) {
        if (StreamUrls.isPlayable(url) && StreamUrls.belongsToServer(url, serverUrl)) {
            launchPlayer(url, getString(R.string.app_name));
            return true;
        }
        if (StreamUrls.belongsToServer(url, serverUrl)) return false;
        if (url.startsWith("vlc://")) {
            String stream = url.substring("vlc://".length());
            launchExternal(stream, "org.videolan.vlc");
            return true;
        }
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (RuntimeException ignored) {
        }
        return true;
    }

    private void launchPlayer(String url, String title) {
        Log.i(TAG, "Opening internal player for " + Uri.parse(url).getPath());
        Intent intent = new Intent(this, PlayerActivity.class);
        intent.putExtra(PlayerActivity.EXTRA_URL, url);
        intent.putExtra(PlayerActivity.EXTRA_TITLE, title);
        startActivity(intent);
    }

    private void launchExternal(String url, String packageName) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.setDataAndType(Uri.parse(url), "video/*");
            intent.setPackage(packageName);
            startActivity(intent);
        } catch (RuntimeException ignored) {
            launchPlayer(url, getString(R.string.app_name));
        }
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (event.getAction() != KeyEvent.ACTION_DOWN || errorPanel.getVisibility() == View.VISIBLE) {
            return super.dispatchKeyEvent(event);
        }
        String command = null;
        switch (event.getKeyCode()) {
            case KeyEvent.KEYCODE_DPAD_LEFT: command = "left"; break;
            case KeyEvent.KEYCODE_DPAD_RIGHT: command = "right"; break;
            case KeyEvent.KEYCODE_DPAD_UP: command = "up"; break;
            case KeyEvent.KEYCODE_DPAD_DOWN: command = "down"; break;
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER: command = "enter"; break;
            case KeyEvent.KEYCODE_MENU:
            case KeyEvent.KEYCODE_SETTINGS:
                showSettings();
                return true;
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
                command = "enter";
                break;
            default:
                return super.dispatchKeyEvent(event);
        }
        webView.evaluateJavascript("window.TorrTvNav&&window.TorrTvNav." + command + "()", null);
        return true;
    }

    private void handleBack() {
        webView.evaluateJavascript("window.TorrTvNav&&window.TorrTvNav.back()", value -> {
            if ("true".equals(value)) return;
            if (webView.canGoBack()) webView.goBack();
            else new AlertDialog.Builder(this)
                    .setMessage(R.string.exit_question)
                    .setPositiveButton(android.R.string.ok, (d, w) -> finish())
                    .setNegativeButton(R.string.cancel, null)
                    .show();
        });
    }

    private void showSettings() {
        EditText input = new EditText(this);
        input.setSingleLine(true);
        input.setText(serverUrl);
        input.setSelectAllOnFocus(true);
        int padding = dp(24);
        FrameLayout wrapper = new FrameLayout(this);
        wrapper.setPadding(padding, dp(8), padding, 0);
        wrapper.addView(input, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle(R.string.settings_title)
                .setMessage(R.string.server_url)
                .setView(wrapper)
                .setPositiveButton(R.string.save_and_open, null)
                .setNegativeButton(R.string.cancel, null)
                .create();
        dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            String value = AppPreferences.normalize(input.getText().toString());
            if (!AppPreferences.isValidServerUrl(value)) {
                input.setError(getString(R.string.invalid_server_url));
                return;
            }
            AppPreferences.setServerUrl(this, value);
            serverUrl = value;
            dialog.dismiss();
            webView.loadUrl(serverUrl);
        }));
        dialog.show();
    }

    private String readAsset(String name) {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(getAssets().open(name)))) {
            StringBuilder value = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                if (value.length() > 0) value.append('\n');
                value.append(line);
            }
            return value.toString();
        } catch (IOException error) {
            throw new IllegalStateException("Missing asset " + name, error);
        }
    }

    private void hideSystemUi() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }

    @Override protected void onResume() {
        super.onResume();
        hideSystemUi();
        if (webView != null) webView.evaluateJavascript(
                "window.dispatchEvent(new Event('cinema:progress'))", null);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private final class AppBridge {
        @JavascriptInterface
        public void play(String url, String title) {
            Log.d(TAG, "JS requested playback: " + Uri.parse(url).getPath());
            runOnUiThread(() -> {
                if (StreamUrls.isPlayable(url) && StreamUrls.belongsToServer(url, serverUrl)) {
                    launchPlayer(url, title == null ? getString(R.string.app_name) : title);
                } else {
                    Log.w(TAG, "Rejected playback URL outside configured stream origin");
                }
            });
        }

        @JavascriptInterface
        public void log(String value) { Log.d(TAG, "JS: " + value); }

        @JavascriptInterface
        public String serverUrl() { return serverUrl; }

        @JavascriptInterface
        public void uiLanguage(String language) {
            if ("ru".equals(language) || "en".equals(language)) {
                AppPreferences.playback(TvBrowserActivity.this).edit().putString("ui_language", language).apply();
            }
        }

        @JavascriptInterface
        public String progress(String mediaId) {
            if (mediaId == null || !mediaId.matches("[a-fA-F0-9]{40}:[0-9]+")) return "null";
            android.content.SharedPreferences prefs = AppPreferences.playback(TvBrowserActivity.this);
            if (!prefs.contains("position_" + mediaId)) return "null";
            try {
                return new JSONObject()
                        .put("position", prefs.getLong("position_" + mediaId, 0L) / 1000.0)
                        .put("duration", prefs.getLong("duration_" + mediaId, 0L) / 1000.0)
                        .put("updatedAt", prefs.getLong("updated_" + mediaId, 0L)).toString();
            } catch (JSONException ignored) { return "null"; }
        }
    }
}
