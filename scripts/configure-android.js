const fs = require('fs');
const path = require('path');

console.log('--- Configuring Android Native Files for EPIC OTT ---');

// 1. Configure AndroidManifest.xml
const manifestPath = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
if (fs.existsSync(manifestPath)) {
    let manifest = fs.readFileSync(manifestPath, 'utf8');

    // Permissions
    if (!manifest.includes('android.permission.INTERNET')) {
        const perms = `
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />
    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
`;
        manifest = manifest.replace('<application', perms + '    <application');
    }

    // Hardware acceleration & cleartext HTTP streams
    if (!manifest.includes('android:usesCleartextTraffic')) {
        manifest = manifest.replace('<application ', '<application android:usesCleartextTraffic="true" android:hardwareAccelerated="true" ');
    }

    // Full sensor auto-rotation
    manifest = manifest.replace(/android:screenOrientation="portrait"/g, 'android:screenOrientation="fullSensor"');
    if (!manifest.includes('android:screenOrientation="fullSensor"')) {
        manifest = manifest.replace(/<activity /g, '<activity android:screenOrientation="fullSensor" ');
    }

    fs.writeFileSync(manifestPath, manifest, 'utf8');
    console.log('✓ AndroidManifest.xml configured (permissions, hardware acceleration, fullSensor).');
} else {
    console.log('⚠ AndroidManifest.xml not found at: ' + manifestPath);
}

// 2. Configure styles.xml (Pure black window background and cutout support)
const stylesPath = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res', 'values', 'styles.xml');
if (fs.existsSync(stylesPath)) {
    const stylesContent = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme" parent="Theme.AppCompat.NoActionBar">
        <item name="android:windowBackground">@android:color/black</item>
        <item name="android:colorBackground">@android:color/black</item>
        <item name="android:statusBarColor">@android:color/black</item>
        <item name="android:navigationBarColor">@android:color/black</item>
        <item name="android:windowTranslucentStatus">true</item>
        <item name="android:windowTranslucentNavigation">true</item>
    </style>
    <style name="AppTheme.NoActionBar" parent="Theme.AppCompat.NoActionBar">
        <item name="windowActionBar">false</item>
        <item name="windowNoTitle">true</item>
        <item name="android:windowBackground">@android:color/black</item>
        <item name="android:colorBackground">@android:color/black</item>
        <item name="android:statusBarColor">@android:color/black</item>
        <item name="android:navigationBarColor">@android:color/black</item>
    </style>
    <style name="AppTheme.NoActionBarLaunch" parent="AppTheme.NoActionBar">
        <item name="android:background">@android:color/black</item>
    </style>
</resources>
`;
    fs.writeFileSync(stylesPath, stylesContent, 'utf8');
    console.log('✓ styles.xml configured with pure black window background.');
}

// 3. Configure MainActivity.java (Immersive Sticky Mode & Display Cutout)
function findMainActivity(dir) {
    if (!fs.existsSync(dir)) return null;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            const found = findMainActivity(fullPath);
            if (found) return found;
        } else if (entry.name === 'MainActivity.java') {
            return fullPath;
        }
    }
    return null;
}

const javaSrcDir = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'java');
const mainActivityPath = findMainActivity(javaSrcDir);

if (mainActivityPath) {
    let orig = fs.readFileSync(mainActivityPath, 'utf8');
    const pkgMatch = orig.match(/package\s+([a-zA-Z0-9_.]+);/);
    const pkgName = pkgMatch ? pkgMatch[1] : 'com.epic.ott';

    const mainActivityContent = `package ${pkgName};

import android.os.Bundle;
import android.os.Build;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        applyEdgeToEdgeAndImmersive();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            applyEdgeToEdgeAndImmersive();
        }
    }

    private void applyEdgeToEdgeAndImmersive() {
        Window window = getWindow();
        
        // 1. Extend into cutout / notch area (removes side white borders completely)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams layoutParams = window.getAttributes();
            layoutParams.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            window.setAttributes(layoutParams);
        }

        // 2. Hide status bar (clock, battery, notifications) & navigation bar
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false);
            WindowInsetsController insetsController = window.getInsetsController();
            if (insetsController != null) {
                insetsController.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                insetsController.setSystemBarsBehavior(
                    WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                );
            }
        } else {
            View decorView = window.getDecorView();
            decorView.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN
            );
        }
    }
}
`;
    fs.writeFileSync(mainActivityPath, mainActivityContent, 'utf8');
    console.log('✓ MainActivity.java configured with Immersive Sticky mode & Cutout support at: ' + mainActivityPath);
} else {
    console.log('⚠ MainActivity.java not found in: ' + javaSrcDir);
}

// 4. Configure Android Adaptive Launcher Icons
const resDir = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');
if (fs.existsSync(resDir)) {
    const drawableDir = path.join(resDir, 'drawable');
    const drawableV24Dir = path.join(resDir, 'drawable-v24');
    if (!fs.existsSync(drawableDir)) fs.mkdirSync(drawableDir, { recursive: true });

    // Background: Deep Black
    const bgXml = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path
        android:fillColor="#08080C"
        android:pathData="M0,0h108v108h-108z"/>
</vector>
`;
    fs.writeFileSync(path.join(drawableDir, 'ic_launcher_background.xml'), bgXml, 'utf8');

    // Foreground: Stylized White 'E' + Crimson Red Play Camera Motif
    const fgXml = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <group
        android:scaleX="0.21"
        android:scaleY="0.21"
        android:translateX="-0.5"
        android:translateY="-0.5">
        <!-- Slanted 'E' -->
        <path
            android:fillColor="#FFFFFF"
            android:pathData="M 198,128 L 318,128 C 321,128 323,131 322,134 L 302,168 C 300,171 297,173 294,173 L 204,173 C 197,173 192,178 191,185 L 182,227 L 272,227 C 275,227 277,230 276,233 L 258,265 C 256,268 253,270 250,270 L 173,270 C 166,270 161,275 160,282 L 149,329 L 298,329 C 301,329 303,332 302,335 L 282,368 C 280,371 277,373 274,373 L 132,373 C 114,373 102,355 106,337 L 142,162 C 146,142 163,128 184,128 Z" />
        <!-- Red Play Triangle -->
        <path
            android:fillColor="#E50914"
            android:pathData="M 298,178 C 298,170 307,165 314,169 L 388,214 C 395,218 395,229 388,233 L 314,278 C 307,282 298,277 298,269 Z" />
        <!-- Red Camera Reel Wing -->
        <path
            android:fillColor="#E50914"
            android:pathData="M 416,169 C 416,162 407,158 402,163 L 358,206 C 353,211 353,219 358,224 L 402,267 C 407,272 416,268 416,261 Z" />
    </group>
</vector>
`;
    fs.writeFileSync(path.join(drawableDir, 'ic_launcher_foreground.xml'), fgXml, 'utf8');
    if (fs.existsSync(drawableV24Dir)) {
        fs.writeFileSync(path.join(drawableV24Dir, 'ic_launcher_foreground.xml'), fgXml, 'utf8');
    }
    console.log('✓ Android adaptive launcher icons configured in drawable.');
}

console.log('--- Android Configuration Completed Successfully ---');
