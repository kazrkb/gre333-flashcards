package com.onrender.gre333_flashcards.twa;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * GRE Words: the whole web app (code, words, fonts and every word recording) is built into the APK
 * under assets/www and served at the real site address, so it works with no internet at all.
 * Only /api requests (saving progress to the cloud) go to the network.
 */
public class MainActivity extends Activity {
    static final String HOST = "gre333-flashcards.onrender.com";
    static final String START = "https://" + HOST + "/";
    static final int LIGHT_BG = Color.parseColor("#EDEDF0");
    static final int DARK_BG = Color.parseColor("#161614");

    private WebView web;
    private FrameLayout root;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Test builds only: allow inspecting the page from a computer. Never on in the release APK.
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) WebView.setWebContentsDebuggingEnabled(true);

        root = new FrameLayout(this);
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);
        setupEdgeToEdge();
        applyTheme(isSystemDark());

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true); // progress is kept in localStorage
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setUserAgentString(s.getUserAgentString() + " GREWordsApp/" + versionCode());
        web.setBackgroundColor(Color.TRANSPARENT);
        web.addJavascriptInterface(new Bridge(), "GREWordsApp");
        web.setWebViewClient(new Client());

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(START);
    }

    // ---------- serving the built-in app ----------

    private class Client extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
            Uri u = req.getUrl();
            if (!"https".equals(u.getScheme()) || !HOST.equals(u.getHost())) return null;
            String path = u.getPath();
            if (path == null || path.isEmpty() || path.equals("/")) path = "/index.html";
            if (path.startsWith("/api/")) return null; // cloud sync: real network
            if (!"GET".equalsIgnoreCase(req.getMethod())) return null;
            if (path.contains("..")) return notFound();
            try {
                byte[] body = readAsset("www" + path);
                return respond(path, body, req.getRequestHeaders());
            } catch (IOException e) {
                if (!path.substring(path.lastIndexOf('/') + 1).contains(".")) { // app route, not a file
                    try {
                        return respond("/index.html", readAsset("www/index.html"), req.getRequestHeaders());
                    } catch (IOException ignored) {
                    }
                }
                return notFound();
            }
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
            Uri u = req.getUrl();
            String path = u.getPath() == null ? "/" : u.getPath();
            boolean appPage = HOST.equals(u.getHost()) && (path.equals("/") || path.isEmpty() || path.equals("/index.html"));
            if (appPage) return false;
            // Everything else (app download, privacy page, other sites) opens in the phone's browser.
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, u));
            } catch (ActivityNotFoundException ignored) {
            }
            return true;
        }
    }

    private byte[] readAsset(String name) throws IOException {
        try (InputStream in = getAssets().open(name)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toByteArray();
        }
    }

    private static final Pattern RANGE = Pattern.compile("bytes=(\\d*)-(\\d*)");

    /** Serve a built-in file; answers Range requests (audio players use them) with 206 Partial Content. */
    private WebResourceResponse respond(String path, byte[] body, Map<String, String> reqHeaders) {
        String mime = mimeType(path);
        String charset = mime.startsWith("text/") || mime.endsWith("javascript") || mime.endsWith("json") ? "utf-8" : null;
        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", "no-cache");
        headers.put("Accept-Ranges", "bytes");
        String range = null;
        for (Map.Entry<String, String> h : reqHeaders.entrySet()) {
            if ("range".equalsIgnoreCase(h.getKey())) range = h.getValue();
        }
        Matcher m = range == null ? null : RANGE.matcher(range);
        if (m != null && m.matches() && body.length > 0) {
            int size = body.length;
            int start, end;
            if (m.group(1).isEmpty()) {
                start = Math.max(0, size - Integer.parseInt(m.group(2)));
                end = size - 1;
            } else {
                start = Integer.parseInt(m.group(1));
                end = m.group(2).isEmpty() ? size - 1 : Math.min(Integer.parseInt(m.group(2)), size - 1);
            }
            if (start <= end && start < size) {
                headers.put("Content-Range", "bytes " + start + "-" + end + "/" + size);
                headers.put("Content-Length", String.valueOf(end - start + 1));
                return new WebResourceResponse(mime, charset, 206, "Partial Content", headers,
                        new ByteArrayInputStream(body, start, end - start + 1));
            }
        }
        headers.put("Content-Length", String.valueOf(body.length));
        return new WebResourceResponse(mime, charset, 200, "OK", headers, new ByteArrayInputStream(body));
    }

    private static WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", new HashMap<>(),
                new ByteArrayInputStream(new byte[0]));
    }

    private static String mimeType(String path) {
        String p = path.toLowerCase();
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js")) return "text/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".json")) return "application/json";
        if (p.endsWith(".webmanifest")) return "application/manifest+json";
        if (p.endsWith(".mp3")) return "audio/mpeg";
        if (p.endsWith(".woff2")) return "font/woff2";
        if (p.endsWith(".woff")) return "font/woff";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".ico")) return "image/x-icon";
        return "application/octet-stream";
    }

    // ---------- bridge for the web app ----------

    private class Bridge {
        /** A one-way hash of this phone's ID for this app. It stays the same after reinstalling the app. */
        @JavascriptInterface
        public String deviceId() {
            String id = Settings.Secure.getString(getContentResolver(), Settings.Secure.ANDROID_ID);
            if (id == null) return "";
            try {
                MessageDigest md = MessageDigest.getInstance("SHA-256");
                byte[] h = md.digest(("gre-words:" + getPackageName() + ":" + id).getBytes(StandardCharsets.UTF_8));
                StringBuilder sb = new StringBuilder();
                for (byte b : h) sb.append(String.format("%02x", b));
                return sb.toString();
            } catch (Exception e) {
                return "";
            }
        }

        @JavascriptInterface
        public int versionCode() {
            return MainActivity.this.versionCode();
        }

        /** The web app tells us its theme so the status and navigation bars match. */
        @JavascriptInterface
        public void setDark(boolean dark) {
            runOnUiThread(() -> applyTheme(dark));
        }
    }

    private int versionCode() {
        try {
            PackageInfo info = getPackageManager().getPackageInfo(getPackageName(), 0);
            return Build.VERSION.SDK_INT >= 28 ? (int) info.getLongVersionCode() : info.versionCode;
        } catch (Exception e) {
            return 0;
        }
    }

    // ---------- system bars ----------

    private boolean isSystemDark() {
        return (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
                == Configuration.UI_MODE_NIGHT_YES;
    }

    private void setupEdgeToEdge() {
        if (Build.VERSION.SDK_INT < 30) return; // older Android: the system places the bars and keyboard
        getWindow().setDecorFitsSystemWindows(false);
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            Insets i = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout()
                    | WindowInsets.Type.ime());
            v.setPadding(i.left, i.top, i.right, i.bottom);
            return WindowInsets.CONSUMED;
        });
    }

    @SuppressWarnings("deprecation")
    private void applyTheme(boolean dark) {
        int bg = dark ? DARK_BG : LIGHT_BG;
        root.setBackgroundColor(bg);
        getWindow().getDecorView().setBackgroundColor(bg);
        if (Build.VERSION.SDK_INT < 35) {
            getWindow().setStatusBarColor(bg);
            getWindow().setNavigationBarColor(bg);
        }
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                int light = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                        | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                c.setSystemBarsAppearance(dark ? 0 : light, light);
            }
        } else {
            View d = getWindow().getDecorView();
            int flags = d.getSystemUiVisibility();
            flags = dark ? flags & ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR : flags | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            if (Build.VERSION.SDK_INT >= 26) {
                flags = dark ? flags & ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR : flags | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            }
            d.setSystemUiVisibility(flags);
        }
    }

    // ---------- lifecycle ----------

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            root.removeView(web);
            web.destroy();
        }
        super.onDestroy();
    }
}
