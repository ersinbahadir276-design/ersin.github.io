#!/bin/bash
# Kaos Adası Android APK derleme betiği.
# Gerekenler: Node.js 20+, JDK 21, Android SDK (ANDROID_HOME ayarlı, platform 35 + build-tools).
set -e
cd "$(dirname "$0")"
npm install
rm -rf www && mkdir www && cp -r ../kaos/. www/ && rm -rf www/indir
npx cap sync android
cd android && ./gradlew assembleDebug
cp app/build/outputs/apk/debug/app-debug.apk ../../kaos/indir/KaosAdasi.apk
echo "Hazır: kaos/indir/KaosAdasi.apk"
