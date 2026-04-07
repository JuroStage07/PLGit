// google-services.json no se sube a Git. Local: copia google-services.example.json → google-services.json.
// EAS: secret de archivo GOOGLE_SERVICES_JSON en expo.dev (ruta al JSON en el worker de build).
//
const appJson = require("./app.json");
//
// Google Sign-In nativo (@react-native-google-signin/google-signin): no uses URIs custom (partnerlife://) en el
// cliente OAuth "Web" — Google solo permite https ahí. Este flujo usa SHA-1 + google-services.json (Firebase).
// Descarga SHA-1 debug: cd android && ./gradlew signingReport  y añádelo en Firebase → Configuración del proyecto → Android.
// Build de desarrollo obligatoria: npx expo run:android (no funciona en Expo Go).
// Pantalla de consentimiento OAuth: usuarios de prueba si el app está en modo Prueba.
module.exports = ({ config }) => ({
  ...config,
  expo: {
    ...appJson.expo,
    ...config.expo,
    // Debe coincidir con el slug del proyecto en expo.dev / EAS (extra.eas.projectId).
    slug: appJson.expo?.slug || config.expo?.slug || "PartnerLife",
    scheme: "partnerlife",
    plugins: [
      "@react-native-firebase/app",
      "@react-native-firebase/auth",
      "@react-native-google-signin/google-signin",
      ...(config.expo?.plugins || []).filter(
        (p) =>
          p !== "@react-native-firebase/app" &&
          p !== "@react-native-firebase/auth" &&
          p !== "@react-native-google-signin/google-signin"
      ),
    ],
    extra: {
      ...(appJson.expo?.extra || {}),
      ...(config.expo?.extra || {}),
      googleWebClientId:
        process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
        "207640060980-qm9oct69f0ntdtqaar338sbbcf2pjat5.apps.googleusercontent.com",
    },
    android: {
      ...appJson.expo?.android,
      ...config.expo?.android,
      googleServicesFile:
        process.env.GOOGLE_SERVICES_JSON ||
        appJson.expo?.android?.googleServicesFile ||
        "./google-services.json",
    },
  },
});
