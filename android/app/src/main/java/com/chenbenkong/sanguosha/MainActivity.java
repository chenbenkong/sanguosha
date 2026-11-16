package com.chenbenkong.sanguosha;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.content.pm.ActivityInfo;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageView;

import androidx.webkit.WebViewAssetLoader;

/**
 * 单 Activity + WebView 外壳：离线加载 assets/www 里的网页构建产物。
 *
 * 主路径按需求走 file:///android_asset/www/index.html；但网页产物是
 * &lt;script type="module" crossorigin&gt;，file:// 源下的模块加载依赖
 * allowFileAccessFromFileURLs / allowUniversalAccessFromFileURLs。为了不让
 * “模块被 CORS 拦掉 → 白屏”成为单点故障，这里注册了一个 6 秒看门狗：
 * 若 #root 仍为空（说明入口模块没执行），自动改用 WebViewAssetLoader 的
 * https 源重载同一份 assets（路径映射一致，相对路径解析结果相同）。
 */
public class MainActivity extends Activity {

    private static final String PRIMARY_URL = "file:///android_asset/www/index.html";
    private static final String FALLBACK_URL =
            "https://appassets.androidplatform.net/assets/www/index.html";
    private static final long MODULE_WATCHDOG_MS = 6000L;
    private static final int BRAND_BG = 0xFF1A1410;

    private WebView webView;
    private ImageView splashOverlay;
    private WebViewAssetLoader assetLoader;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean fallbackUsed = false;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // 强制横屏，且**不受用户锁定屏幕方向的影响**。
        // manifest 的 screenOrientation="landscape" 已经是固定横屏，但部分机型/系统
        // 会在用户锁定竖屏时把 Activity 旋回竖屏；这里再显式指定一次，
        // 优先级高于系统锁定（SCREEN_ORIENTATION_LOCKED）。
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LOCKED);
        applyImmersive();

        assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(BRAND_BG);

        webView = new WebView(this);
        webView.setBackgroundColor(BRAND_BG);
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        configureWebView(webView);
        root.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        // 原生启动图覆盖层：网页首帧渲染完成前一直盖着，onPageFinished 后淡出。
        splashOverlay = new ImageView(this);
        splashOverlay.setImageResource(R.drawable.splash_logo);
        splashOverlay.setBackgroundColor(BRAND_BG);
        splashOverlay.setScaleType(ImageView.ScaleType.CENTER);
        root.addView(splashOverlay, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        setContentView(root);

        webView.loadUrl(PRIMARY_URL);
    }

    private void configureWebView(WebView view) {
        WebSettings s = view.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        // file:// 页面要读同源 assets 下的 js/css/图片与模块脚本：必须放开 file 源跨域
        s.setAllowFileAccessFromFileURLs(true);
        s.setAllowUniversalAccessFromFileURLs(true);
        // 游戏有音频：不设会被 Chromium 自动播放策略拦住
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        view.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public void onPageFinished(WebView v, String url) {
                hideSplash();
                if (url != null && url.startsWith("file://")) {
                    armModuleWatchdog();
                }
            }
        });
        view.setWebChromeClient(new WebChromeClient());
    }

    /** 看门狗：入口模块被 file:// 的模块/CORS 规则拦掉时，换 https 源重载同一份 assets。 */
    private void armModuleWatchdog() {
        handler.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (webView == null || fallbackUsed) {
                    return;
                }
                webView.evaluateJavascript(
                        "(function(){var r=document.getElementById('root');"
                                + "return r ? r.childElementCount : 0;})()",
                        new ValueCallback<String>() {
                            @Override
                            public void onReceiveValue(String value) {
                                if (webView == null || fallbackUsed) {
                                    return;
                                }
                                if ("0".equals(value) || "null".equals(value)) {
                                    fallbackUsed = true;
                                    webView.loadUrl(FALLBACK_URL);
                                }
                            }
                        });
            }
        }, MODULE_WATCHDOG_MS);
    }

    private void hideSplash() {
        if (splashOverlay == null) {
            return;
        }
        final ImageView overlay = splashOverlay;
        splashOverlay = null;
        overlay.animate().alpha(0f).setDuration(220).withEndAction(new Runnable() {
            @Override
            public void run() {
                ViewGroup parent = (ViewGroup) overlay.getParent();
                if (parent != null) {
                    parent.removeView(overlay);
                }
            }
        }).start();
    }

    /** 沉浸式全屏：隐藏状态栏与导航栏；刘海屏延伸到短边，避免横屏被裁切。 */
    private void applyImmersive() {
        View decor = getWindow().getDecorView();
        decor.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(lp);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            applyImmersive();
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            // 不在 WebView 历史里就退到后台，而不是一点就退出
            moveTaskToBack(true);
        }
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
