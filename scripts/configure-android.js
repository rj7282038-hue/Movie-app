const fs = require('fs');
const path = require('path');

console.log('--- Configuring Android Native Files for Ghazi OTT ---');

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
const mainActivityPath = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'java', 'com', 'ghazi', 'ott', 'MainActivity.java');
if (fs.existsSync(mainActivityPath)) {
    const mainActivityContent = `package com.ghazi.ott;

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
    console.log('✓ MainActivity.java configured with Immersive Sticky mode & Cutout support.');
}

console.log('--- Android Configuration Completed Successfully ---');
