# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# Real crash from a signed release build:
#   Caused by: java.lang.NullPointerException
#     at com.getcapacitor.Plugin.getPermissionStates()
#     at com.getcapacitor.Plugin.checkPermissions()
#     at com.capacitorjs.plugins.geolocation.GeolocationPlugin.checkPermissions()
# (obfuscated to com.getcapacitor.e0 in the actual report; matched by
# cross-referencing Plugin.java, since it is the only class declaring both
# checkPermissions() and getPermissionStates()). Plugin#getPermissionStates()
# -> Bridge#getPermissionStates(Plugin) reads the plugin's @CapacitorPlugin
# annotation (and its nested @Permission array) via reflection at runtime
# to build the permission list every checkPermissions()/requestPermissions()
# call needs. capacitor-android's own consumer proguard-rules.pro keeps the
# Plugin *classes* (`-keep public class * extends com.getcapacitor.Plugin`)
# but never asserts `-keepattributes *Annotation*`, so R8 is free to strip
# the annotation metadata those reflective calls depend on -- a
# long-documented category of Capacitor bug that only reproduces in
# minified release builds (ionic-team/capacitor#738, #739), never in debug.
-keepattributes *Annotation*,RuntimeVisibleAnnotations,RuntimeVisibleParameterAnnotations
-keep class com.getcapacitor.annotation.** { *; }
-keep enum com.getcapacitor.PermissionState { *; }

# Defensive: the geolocation plugin's native implementation
# (io.ionic.libs:iongeolocation-android, fetched from Maven, not vendored
# in this repo) is a separate R8-shrinking-sensitive dependency the app
# never references directly, so nothing here would tell R8 it's in use.
-keep class io.ionic.libs.iongeolocationlib.** { *; }
-dontwarn io.ionic.libs.iongeolocationlib.**
