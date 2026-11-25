# Kaos Adası — Android uygulaması

Bu klasör, `../kaos/` içindeki web oyununu bir Android uygulamasına (APK) saran Capacitor 7 projesidir.
Hazır derlenmiş APK: `../kaos/indir/KaosAdasi.apk` (telefondan indirilebilir).

## APK'yı yeniden derlemek

Gerekenler: Node.js 20+, JDK 21, Android SDK (platform 35 ve build-tools), `ANDROID_HOME` ortam değişkeni.

```bash
./apk-yap.sh
```

Betik oyun dosyalarını `www/` klasörüne kopyalar, Android projesini eşitler, debug APK derler ve
`../kaos/indir/KaosAdasi.apk` dosyasını günceller. İstersen `android/` klasörünü Android Studio ile de açabilirsin.

## Telefona kurmak

1. Telefonda APK dosyasını indir.
2. Android "bilinmeyen kaynaklardan yüklemeye izin ver" diye sorarsa izin ver.
3. Uygulamayı aç; oyun tam ekran ve yatay açılır. Arkadaşlarla oynamak için internet gerekir.

## Notlar

- Bu bir **debug** APK'dır (Android'in hata ayıklama anahtarıyla imzalı). Google Play'de yayınlamak için
  kendi imza anahtarınla `assembleRelease` derlemen ve 25 dolarlık Play geliştirici hesabı açman gerekir.
- APK ile tarayıcıdaki oyuncular aynı odada buluşabilir (aynı oda kodu sistemi).
