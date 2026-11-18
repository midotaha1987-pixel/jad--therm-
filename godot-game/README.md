# مغامرات عمر وياسين 3D — Godot 4.4 runner game

3D runner game (Godot 4.4, portrait mobile, Arabic UI). Omar and Yassin
run, jump and slide through levels, collecting rings and stars.

## Build the Android APK

CI builds it automatically: every push touching `godot-game/` runs
`.github/workflows/build-godot-apk.yml` and uploads the APK as the
`omar-yassin-3d-apk` artifact. No local Android SDK is needed.

### Local export (optional)

1. Install Godot 4.4.1, its export templates, an Android SDK
   (build-tools 34.0.0+, platform android-34) and a JDK.
2. In the Godot editor, set the Android SDK path in
   Editor → Editor Settings → Export → Android
   (`export/android/android_sdk_path`), and the Java SDK path.
3. Generate the debug keystore (it is gitignored, never commit it):
   ```sh
   cd godot-game
   keytool -genkeypair -keystore debug.keystore -storepass android \
     -alias android -keypass android -keyalg RSA -keysize 2048 \
     -validity 10000 -dname "CN=Android Debug,O=Android,C=US"
   ```
4. Export:
   ```sh
   godot --headless --path . --export-debug Android export/omar-yassin-3d.apk
   ```

## Export details

- Package: `com.omaryassin.game3d`
- App name: مغامرات عمر وياسين 3D, portrait, APK (not AAB)
- Architectures: arm64-v8a + armeabi-v7a (x86/x86_64 off, keeps the APK small)
- Prebuilt-template export (no Gradle build); debug-signed with the
  `res://debug.keystore` above (alias `android`, password `android`).
- **Release / Google Play:** a release keystore does not exist yet.
  Before Play publishing, generate one, keep it out of git, and add a
  release preset (or CI secrets) that signs with it.
