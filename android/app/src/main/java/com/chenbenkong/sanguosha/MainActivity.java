package com.chenbenkong.sanguosha;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.content.pm.ActivityInfo;
import android.os.Looper;
import android.content.Context;
import android.content.SharedPreferences;
import android.webkit.JavascriptInterface;
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

    /**
     * 原生存档备份。网页的 localStorage 在 APK 的 file:// 环境下与本应用数据目录绑定，
     * 用户「清除数据 / 清缓存」就没了；这里把每次存档同步一份到 SharedPreferences，
     * 下次启动若 localStorage 为空则回填。与网页的「导出/导入 JSON」互补：
     * 这个防手滑清数据，那个负责换机与长期备份。
     */
    private static final String SAVE_PREFS = "sanguosha_save_backup";
    private static final String SAVE_KEY = "sanguosha-save-v1";
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean fallbackUsed = false;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // 强制横屏，且**不受用户锁定屏幕方向的影响**。
        // manifest 的 screenOrientation="landscape" 已是固定横屏，这里在代码里再显式锁一次。
        // 必须用 SCREEN_ORIENTATION_LANDSCAPE（固定值=0），不能用 LOCKED。
        // LOCKED 锁的是「调用那一刻的方向」——onCreate 时方向可能尚未定，某些机型上会锁成竖屏；
        // 加上 configChanges 含 orientation（不重建 Activity），WebView 就停在竖屏画布里，
        // 而网页按 innerWidth/innerHeight 排成横屏布局 —— 结果是画面只占顶部一条、下面全黑
        // （用户真机截图确认）。SCREEN_ORIENTATION_LANDSCAPE 才是「无视传感器/系统锁定的固定横屏」。
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE);
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

        // JS → 原生：网页写存档时同步一份到 SharedPreferences
        view.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void backupSave(String json) {
                SharedPreferences sp = getSharedPreferences(SAVE_PREFS, Context.MODE_PRIVATE);
                sp.edit().putString(SAVE_KEY, json).apply();
            }

            @JavascriptInterface
            public String readBackup() {
                SharedPreferences sp = getSharedPreferences(SAVE_PREFS, Context.MODE_PRIVATE);
                return sp.getString(SAVE_KEY, null);
            }
        }, "SGSNativeSave");

        view.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public void onPageFinished(WebView v, String url) {
                // localStorage 被清（换机恢复 / 用户清了 WebView 数据）时，
                // 从原生备份回填一次。用 evaluateJavascript 而不是重写 localStorage：
                // 只在「当前没有存档」时写，绝不覆盖用户刚打的新局。
                v.evaluateJavascript(
                    "(function(){try{" +
                    "if (localStorage.getItem('sgs-save-v1')) return 'has';" +
                    "var b = window.SGSNativeSave && window.SGSNativeSave.readBackup();" +
                    "if (b) { localStorage.setItem('sgs-save-v1', b); return 'restored'; }" +
                    "return 'none';}catch(e){return 'error'}})()",
                    null);

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
