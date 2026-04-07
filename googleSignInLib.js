/**
 * Carga perezosa de @react-native-google-signin/google-signin.
 * En Expo Go no existe RNGoogleSignin → un import estático rompe el arranque.
 * En desarrollo / release con npx expo run:android el módulo sí está en el binario.
 */
import Constants, { ExecutionEnvironment } from "expo-constants";
import { Platform } from "react-native";

let cached;

export function getGoogleSignInLib() {
  if (cached !== undefined) return cached;
  if (Platform.OS === "web") {
    cached = null;
    return null;
  }
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    cached = null;
    return null;
  }
  try {
    cached = require("@react-native-google-signin/google-signin");
    return cached;
  } catch {
    cached = null;
    return null;
  }
}
