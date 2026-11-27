package net.softm.cheongyakhannun;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Message;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.Toast;

import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.Nullable;
import androidx.core.content.ContextCompat;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONObject;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashSet;
import java.util.Locale;

import softm.hannun.ads.HannunAdConfig;
import softm.hannun.ads.HannunAds;
import softm.hannun.ads.HannunWebViewAds;
import softm.hannun.review.HannunInAppReviewManager;
import softm.hannun.update.HannunInAppUpdateManager;

public final class MainActivity extends ComponentActivity {
    private static final String BRIDGE_NAME = "CheongyakNative";

    private WebView webView;
    private ProgressBar progress;
    private View landingPanel;
    private View offlinePanel;
    private boolean mainFrameFailed;
    private boolean firstContentShown;
    private HannunAds ads;
    private HannunInAppUpdateManager appUpdater;
    private HannunInAppReviewManager appReviewer;
    private String pendingDocumentText;

    private final ActivityResultLauncher<String> notificationPermissionLauncher =
        registerForActivityResult(new ActivityResultContracts.RequestPermission(), granted -> {
            if (!granted) {
                Toast.makeText(this, "알림 권한은 설정에서 언제든 허용할 수 있어요.", Toast.LENGTH_SHORT).show();
            }
        });

    private final ActivityResultLauncher<String> calendarDocumentLauncher =
        registerForActivityResult(new ActivityResultContracts.CreateDocument("text/calendar"), uri -> {
            String text = pendingDocumentText;
            pendingDocumentText = null;
            if (uri == null || text == null) return;
            try (OutputStream output = getContentResolver().openOutputStream(uri)) {
                if (output == null) throw new IllegalStateException("No output stream");
                output.write(text.getBytes(StandardCharsets.UTF_8));
                Toast.makeText(this, "청약 일정을 저장했어요.", Toast.LENGTH_SHORT).show();
            } catch (Exception error) {
                Toast.makeText(this, "일정 파일을 저장하지 못했어요.", Toast.LENGTH_LONG).show();
            }
        });

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webView);
        progress = findViewById(R.id.progress);
        landingPanel = findViewById(R.id.landingPanel);
        offlinePanel = findViewById(R.id.offlinePanel);
        Button retryButton = findViewById(R.id.retryButton);
        retryButton.setOnClickListener(view -> loadHomeFresh());

        configureWebView();
        installBridge();
        appUpdater = new HannunInAppUpdateManager(this, null);
        appReviewer = new HannunInAppReviewManager(this);
        configureAds(findViewById(R.id.adHost));
        NoticeSyncScheduler.ensureScheduled(this);

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack();
                else showExitConfirmation();
            }
        });

        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            loadHomeFresh();
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(true);
        settings.setUserAgentString(settings.getUserAgentString() + " CheongyakHannunAndroid/1.0");
        if (hasConfiguredAds()) HannunWebViewAds.markNativeAds(settings);

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);

        webView.setWebViewClient(new WebViewClient() {
            @Override public void onPageStarted(WebView view, String url, Bitmap favicon) {
                mainFrameFailed = false;
                offlinePanel.setVisibility(View.GONE);
                if (!firstContentShown) {
                    landingPanel.setVisibility(View.VISIBLE);
                    webView.setVisibility(View.INVISIBLE);
                }
                progress.setVisibility(View.VISIBLE);
            }

            @Override public void onPageFinished(WebView view, String url) {
                view.getSettings().setCacheMode(WebSettings.LOAD_DEFAULT);
                progress.setVisibility(View.GONE);
                if (mainFrameFailed) return;
                firstContentShown = true;
                landingPanel.setVisibility(View.GONE);
                offlinePanel.setVisibility(View.GONE);
                webView.setVisibility(View.VISIBLE);
            }

            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showNetworkError();
            }

            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame() && response.getStatusCode() >= 400) showNetworkError();
            }

            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (isAppUrl(uri)) return false;
                return openExternal(uri);
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView view, int newProgress) {
                progress.setProgress(newProgress);
                progress.setVisibility(newProgress >= 100 ? View.GONE : View.VISIBLE);
            }

            @Override public boolean onCreateWindow(
                WebView view,
                boolean isDialog,
                boolean isUserGesture,
                Message resultMsg
            ) {
                if (!isUserGesture || resultMsg == null) return false;
                WebView popup = new WebView(MainActivity.this);
                popup.setWebViewClient(new WebViewClient() {
                    @Override public boolean shouldOverrideUrlLoading(WebView ignored, WebResourceRequest request) {
                        openExternal(request.getUrl());
                        popup.destroy();
                        return true;
                    }

                    @Override public void onPageStarted(WebView ignored, String url, Bitmap favicon) {
                        if (url != null && !"about:blank".equals(url)) openExternal(Uri.parse(url));
                        popup.stopLoading();
                        popup.destroy();
                    }
                });
                WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(popup);
                resultMsg.sendToTarget();
                return true;
            }
        });
    }

    @SuppressLint("RequiresFeature")
    private void installBridge() {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return;
        Uri configured = Uri.parse(BuildConfig.WEB_URL);
        String origin = configured.getScheme() + "://" + configured.getAuthority();
        WebViewCompat.addWebMessageListener(
            webView,
            BRIDGE_NAME,
            new HashSet<>(Collections.singletonList(origin)),
            (view, message, sourceOrigin, isMainFrame, replyProxy) -> {
                if (!isMainFrame || !isTrustedOrigin(sourceOrigin) || !isTrustedPage(view.getUrl())) return;
                handleBridgeMessage(message);
            }
        );
    }

    private void handleBridgeMessage(WebMessageCompat message) {
        try {
            JSONObject request = new JSONObject(message.getData());
            String type = request.optString("type", "");
            switch (type) {
                case "saveWatchProfile" -> {
                    JSONObject profile = request.optJSONObject("profile");
                    if (profile != null) {
                        WatchProfileStore.save(this, profile);
                        NoticeSyncScheduler.enqueueImmediate(this);
                    }
                }
                case "requestNotificationPermission" -> runOnUiThread(this::requestNotificationPermission);
                case "downloadText" -> {
                    String text = request.optString("text", "");
                    String name = safeFilename(request.optString("name", "cheongyak.ics"));
                    if (!text.trim().isEmpty() && text.length() <= 1_000_000) {
                        runOnUiThread(() -> {
                            pendingDocumentText = text;
                            calendarDocumentLauncher.launch(name);
                        });
                    }
                }
                default -> { }
            }
        } catch (Exception ignored) {
            // Malformed page messages do not receive native access.
        }
    }

    private void configureAds(LinearLayout adHost) {
        if (!hasConfiguredAds()) {
            adHost.setVisibility(View.GONE);
            return;
        }
        ads = new HannunAds(this, adHost, new HannunAdConfig(
            getString(R.string.admob_native_ad_unit_id),
            getString(R.string.admob_adaptive_banner_ad_unit_id),
            getString(R.string.admob_interstitial_ad_unit_id),
            getString(R.string.admob_exit_banner_ad_unit_id)
        ));
        ads.start();
    }

    private boolean hasConfiguredAds() {
        return !getString(R.string.admob_app_id).trim().isEmpty()
            && !getString(R.string.admob_native_ad_unit_id).trim().isEmpty()
            && !getString(R.string.admob_adaptive_banner_ad_unit_id).trim().isEmpty()
            && !getString(R.string.admob_interstitial_ad_unit_id).trim().isEmpty()
            && !getString(R.string.admob_exit_banner_ad_unit_id).trim().isEmpty();
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT < 33) return;
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
            == PackageManager.PERMISSION_GRANTED) return;
        notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS);
    }

    private void loadHomeFresh() {
        mainFrameFailed = false;
        offlinePanel.setVisibility(View.GONE);
        if (!firstContentShown) landingPanel.setVisibility(View.VISIBLE);
        progress.setVisibility(View.VISIBLE);
        webView.getSettings().setCacheMode(WebSettings.LOAD_NO_CACHE);
        webView.loadUrl(BuildConfig.WEB_URL, Collections.singletonMap("Cache-Control", "no-cache"));
    }

    private void showNetworkError() {
        mainFrameFailed = true;
        progress.setVisibility(View.GONE);
        landingPanel.setVisibility(View.GONE);
        webView.setVisibility(View.INVISIBLE);
        offlinePanel.setVisibility(View.VISIBLE);
    }

    private boolean isAppUrl(Uri uri) {
        return uri != null && uri.toString().startsWith(BuildConfig.WEB_URL);
    }

    private boolean isTrustedPage(String url) {
        return url != null && url.startsWith(BuildConfig.WEB_URL);
    }

    private boolean isTrustedOrigin(Uri sourceOrigin) {
        if (sourceOrigin == null) return false;
        Uri expected = Uri.parse(BuildConfig.WEB_URL);
        return expected.getScheme().equalsIgnoreCase(sourceOrigin.getScheme())
            && expected.getHost().equalsIgnoreCase(sourceOrigin.getHost())
            && expected.getPort() == sourceOrigin.getPort();
    }

    private boolean openExternal(Uri uri) {
        if (uri == null) return true;
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        if (!scheme.equals("https") && !scheme.equals("http") && !scheme.equals("tel") && !scheme.equals("mailto")) {
            return true;
        }
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (Exception error) {
            Toast.makeText(this, "연결된 앱에서 열 수 없어요.", Toast.LENGTH_SHORT).show();
        }
        return true;
    }

    private static String safeFilename(String value) {
        String cleaned = value.replaceAll("[\\\\/:*?\"<>|\\r\\n]", "_").trim();
        if (cleaned.isEmpty()) return "cheongyak.ics";
        return cleaned.length() > 100 ? cleaned.substring(0, 100) : cleaned;
    }

    private void showExitConfirmation() {
        if (ads != null) {
            ads.showExitConfirmation(this::finishAndRemoveTask);
            return;
        }
        new AlertDialog.Builder(this)
            .setTitle("앱을 종료하시겠습니까?")
            .setMessage("저장한 관심조건과 공고는 그대로 유지됩니다.")
            .setNegativeButton("계속 이용", null)
            .setPositiveButton("종료", (dialog, which) -> finishAndRemoveTask())
            .show();
    }

    @Override protected void onResume() {
        super.onResume();
        appUpdater.onResume();
        appReviewer.onResume();
        if (ads != null) ads.onResume();
    }

    @Override protected void onPause() {
        appReviewer.onPause();
        appUpdater.onPause();
        if (ads != null) ads.onPause();
        super.onPause();
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (appUpdater.onActivityResult(requestCode, resultCode)) return;
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override protected void onDestroy() {
        appReviewer.destroy();
        appUpdater.destroy();
        if (ads != null) ads.destroy();
        webView.destroy();
        super.onDestroy();
    }
}
