import type { CapacitorConfig } from "@capacitor/cli";

/**
 * MK Connect ships as a thin native shell around the production Next.js
 * app — server.url points at the live deployment so the WebView always
 * runs the exact same server-rendered pages, Server Actions, middleware,
 * and Supabase client code as the web app. Nothing here duplicates
 * business logic; it only adds native chrome (splash, icon, permissions)
 * and bridges (camera/GPS/biometrics/push) that the web pages opt into
 * via lib/native/*.
 */
const config: CapacitorConfig = {
  appId: "id.haluoleo.mkconnect",
  appName: "MK Connect",
  webDir: "public",
  server: {
    url: "https://mkh.haluoleo.id",
    cleartext: false,
    androidScheme: "https",
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      launchAutoHide: true,
      backgroundColor: "#1e40af",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#ffffff",
    },
  },
};

export default config;
