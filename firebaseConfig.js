// firebaseConfig.js
import { initializeApp, getApps, getApp } from "firebase/app";
import ReactNativeAsyncStorage from "@react-native-async-storage/async-storage";
import { initializeAuth, getReactNativePersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyBp30LrAv3dsnSxVfI1_m2-Uzw3vBlBeQg",
  authDomain: "partnerlife-d28f9.firebaseapp.com",
  projectId: "partnerlife-d28f9",
  storageBucket: "partnerlife-d28f9.firebasestorage.app",
  messagingSenderId: "207640060980",
  appId: "1:207640060980:web:49814551155b461f9e5661",
};

// ✅ App (singleton)
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// ✅ Auth (React Native CORRECTO)
const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(ReactNativeAsyncStorage),
});

// ✅ Servicios
const db = getFirestore(app);
const storage = getStorage(app);
const functions = getFunctions(app, "us-central1");

// ✅ Exports
export { app, auth, db, storage, functions };
