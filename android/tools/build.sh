#!/usr/bin/env bash
# 一键重建 release APK：网页产物 -> 图标 -> 打包。
# 依赖：Node.js、Python(Pillow)、JDK 17+、Android SDK(platforms;android-34 / build-tools;34.0.0)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
JAVA_HOME="${JAVA_HOME:-/c/Program Files/Eclipse Adoptium/jdk-21.0.12.101-hotspot}"
PYTHON="${PYTHON:-python}"
export JAVA_HOME

cd "$REPO_ROOT"
node node_modules/vite/bin/vite.js build --base=./ \
  --outDir android/app/src/main/assets/www --emptyOutDir

"$PYTHON" android/tools/make_icons.py

cd android
# 用 gradlew.bat 而不是 ./gradlew：这个 MSYS 环境没有 cygpath，而 gradlew 这个
# shell 脚本靠 cygpath 把路径转成 Windows 形式，缺了它会在 175/176/178 行报错、
# 最后 exec 一个空命令（实测 EXIT=127，构建根本没开始）。.bat 版不需要它。
if command -v cygpath >/dev/null 2>&1; then
  ./gradlew assembleRelease
else
  ./gradlew.bat assembleRelease
fi
echo "APK: $REPO_ROOT/android/app/build/outputs/apk/release/app-release.apk"
