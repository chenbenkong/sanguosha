# 三国杀 · Android 原生外壳（单 Activity + WebView + 离线内置网页）

网页构建产物（`repo/dist` 同源的一份）离线打进 APK 的 `assets/www/`，App 用
`file:///android_asset/www/index.html` 加载，**完全不需要联网**，也不是在线打包服务。

## 一、目录结构

```
repo/android/
├── settings.gradle.kts            # 工程名 + 仓库声明（google / mavenCentral）
├── build.gradle.kts               # 只声明 AGP 版本
├── gradle.properties              # JVM 参数 / useAndroidX
├── local.properties               # sdk.dir（CI 可用 ANDROID_HOME 覆盖）
├── gradlew, gradlew.bat, gradle/  # Gradle 8.9 wrapper
├── sanguosha-release.keystore     # release 签名密钥（口令见下，本地个人应用）
├── tools/make_icons.py            # 用仓库素材生成 mipmap + 启动图
├── tools/build.sh                 # 一键重建
└── app/
    ├── build.gradle.kts
    ├── proguard-rules.pro
    └── src/main/
        ├── AndroidManifest.xml
        ├── java/com/chenbenkong/sanguosha/MainActivity.java
        ├── res/…                  # theme / splash / mipmap 图标
        └── assets/www/            # ← 网页产物（由 vite 生成，不入库）
```

## 二、签名口令（本地个人应用，明文存放以便重建 / 覆盖安装）

| 项 | 值 |
| --- | --- |
| keystore | `repo/android/sanguosha-release.keystore`（PKCS12） |
| storePassword | `sanguosha` |
| keyAlias | `sanguosha` |
| keyPassword | `sanguosha` |
| 算法 / 有效期 | RSA 2048 / 10000 天 |
| 证书 DN | CN=Sanguosha Web, OU=Personal, O=Personal, L=Beijing, ST=Beijing, C=CN |

重新生成（会换签名，覆盖安装需先卸载）：

```bash
keytool -genkeypair -v -keystore sanguosha-release.keystore -storetype PKCS12 \
  -storepass sanguosha -keypass sanguosha -alias sanguosha \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=Sanguosha Web, OU=Personal, O=Personal, L=Beijing, ST=Beijing, C=CN"
```

## 三、从零重建

前置：JDK 17+（本机 JDK 21）、Android SDK 含 `platforms;android-34` 与 `build-tools;34.0.0`、Node.js。

```bash
# 1) 生成离线网页产物（仓库根执行；--base=./ 是必须的，见下文“易踩坑”）
node node_modules/vite/bin/vite.js build --base=./ \
  --outDir android/app/src/main/assets/www --emptyOutDir

# 2) 用仓库素材生成图标与启动图（需要 Pillow）
python android/tools/make_icons.py

# 3) 出包
cd android && ./gradlew assembleRelease      # Windows cmd/PowerShell 用 gradlew.bat assembleRelease
# 产物：app/build/outputs/apk/release/app-release.apk
```

也可直接 `bash android/tools/build.sh`（上面三步的封装）。

## 四、版本与配置

| 项 | 值 |
| --- | --- |
| compileSdk / targetSdk | 34 |
| minSdk | 24（Android 7.0） |
| Build-Tools | 34.0.0（显式钉住） |
| Android Gradle Plugin | 8.7.2 |
| Gradle | 8.9 |
| JDK | Temurin 21.0.12 |
| applicationId / namespace | `com.chenbenkong.sanguosha` |
| 版本 | versionCode 1 / versionName 1.0.0 |
| 依赖 | 仅 `androidx.webkit:webkit:1.11.0` |

## 五、关键实现

- **横屏锁死**：`android:screenOrientation="sensorLandscape"` +
  `android:configChanges="orientation|screenSize|keyboardHidden|screenLayout|smallestScreenSize|uiMode"`
  → 旋转不重建 Activity，WebView 不重载、游戏状态不丢。(`aapt2 dump xmltree` 实测
  screenOrientation=6，configChanges=0x00000fa0，即上述六位全开。)
- **离线内置**：`file:///android_asset/www/index.html`，资产在 APK 内 `assets/www/`（1429 个文件）。
- **WebView**：JS、DOM storage、allowFileAccess、`setMediaPlaybackRequiresUserGesture(false)`（音频不被
  自动播放策略拦）、`setAllowFileAccessFromFileURLs(true)`、`setAllowUniversalAccessFromFileURLs(true)`、
  `LAYER_TYPE_HARDWARE` + manifest `hardwareAccelerated="true"`。
- **返回键**：`canGoBack()` → `goBack()`，否则 `moveTaskToBack(true)`（退到后台，不是退出）。
- **原生启动图**：theme 的 `windowBackground` 指向 `@drawable/splash_background`（品牌底色
  `#FF1A1410` + 居中图标），另有一个 ImageView 覆盖层在 `onPageFinished` 后 220ms 淡出 →
  从冷启动到网页首帧全程无白屏。
- **沉浸式全屏**：`SYSTEM_UI_FLAG_IMMERSIVE_STICKY` 等一整套隐藏状态栏/导航栏，
  `onWindowFocusChanged` 重新施加；theme 与代码双保险设置
  `layoutInDisplayCutoutMode = shortEdges`，横屏刘海/挖孔不裁画面。
- **图标**：全部由 `repo/public/apple-touch-icon.png` 生成（未从网上下素材）——
  legacy `mipmap-*/ic_launcher.png`（含圆形）、`mipmap-anydpi-v26` 自适应图标（背景色 + 前景）。

## 六、易踩坑（重建时注意）

1. **`--base=./` 不能省**。默认 `base: '/'` 会让 `index.html` 里出现 `/assets/js/…` 绝对路径，
   也会把 `import.meta.env.BASE_URL` 烤成 `/`，`file://` 下解析成 `file:///assets/…` 直接 404，
   表现就是白屏。本工程实测产物里是 `./assets/js/index-DFO1nMpz.js`、`./vendor/card3d.js`。
2. **ES module 在 file:// 下的兜底**。产物入口是 `<script type="module" crossorigin>`，
   file:// 源下能否加载取决于 WebView 的两个 file-access 开关（上面已开）。为了不让它成为单点故障，
   `MainActivity` 注册了一个 6 秒看门狗：若 `#root` 仍为空，自动改用 `WebViewAssetLoader`
   的 `https://appassets.androidplatform.net/assets/www/index.html` 重载同一份 assets
   （路径映射一致，相对路径解析结果相同，仅换源）。
3. `assets/www/` 是生成物（84MB），已加入 `.gitignore`，重建前必须先跑第 1 步。
