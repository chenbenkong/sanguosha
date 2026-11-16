plugins {
    id("com.android.application")
}

android {
    namespace = "com.chenbenkong.sanguosha"
    compileSdk = 34
    // 环境里已装的是 34.0.0，显式钉住，避免 AGP 去拉它自己的默认版本
    buildToolsVersion = "34.0.0"

    defaultConfig {
        applicationId = "com.chenbenkong.sanguosha"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"
    }

    // 本地个人应用：keystore 与口令明文放仓库，保证 APK 可重建、可覆盖安装。
    signingConfigs {
        create("release") {
            storeFile = file("../sanguosha-release.keystore")
            storePassword = "sanguosha"
            keyAlias = "sanguosha"
            keyPassword = "sanguosha"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            isShrinkResources = false
            signingConfig = signingConfigs.getByName("release")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    lint {
        checkReleaseBuilds = false
        abortOnError = false
    }
}

dependencies {
    // 只为 WebViewAssetLoader（file:// 模块加载失败时的 https 兜底源）
    implementation("androidx.webkit:webkit:1.11.0")
}
