import React, { useMemo, useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  Image,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db, auth as firebaseAuth } from "./firebaseConfig";

import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import MainTabs from "./tabs/MainTabs"; // ✅ default import
import { PL } from "./theme/plTheme";
import LoveBubbleBackground from "./components/LoveBubbleBackground";
import { DialogProvider, useDialog } from "./context/DialogContext";
/** Fondo transparente para ver burbujas y PL.bg detrás (stack + tabs) */
const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: "transparent",
    card: "transparent",
  },
};

const Stack = createNativeStackNavigator();

function HomeScreen() {
  const { info } = useDialog();
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);

  const isValidEmail = (value) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());

  // ---------- LOGIN ----------
  const [loginForm, setLoginForm] = useState({
    email: '',
    password: '',
  });

  const onLoginChange = (key, value) =>
    setLoginForm((prev) => ({ ...prev, [key]: value }));

  const canLogin = useMemo(() => {
    return isValidEmail(loginForm.email) && loginForm.password.length >= 6;
  }, [loginForm]);

  const closeLoginModal = () => {
    setIsLoginOpen(false);
    Keyboard.dismiss();
  };

  const resetLoginForm = () => setLoginForm({ email: '', password: '' });

  const login = async () => {
    if (!canLogin) {
      info("Revisa tus datos", "Correo válido y contraseña (mín. 6).");
      return;
    }

    try {
      const cred = await signInWithEmailAndPassword(
        firebaseAuth,
        loginForm.email.trim().toLowerCase(),
        loginForm.password
      );

      info("Bienvenido/a", `Sesión iniciada como ${cred.user.email}`);

      closeLoginModal();
      resetLoginForm();

      // ✅ NO navegamos aquí. AuthGate detecta la sesión y muestra MainTabs automáticamente.
    } catch (e) {
      if (e.code === "auth/user-not-found") {
        info("No existe esa cuenta", "Regístrate primero.");
      } else if (e.code === "auth/wrong-password") {
        info("Contraseña incorrecta", "Intenta de nuevo.");
      } else if (e.code === "auth/invalid-email") {
        info("Correo inválido", "Revisa el formato.");
      } else if (e.code === "auth/too-many-requests") {
        info("Demasiados intentos", "Intenta más tarde.");
      } else {
        info("Error", e.message);
      }
    }
  };

  // ---------- REGISTRO ----------
  const [genderOpen, setGenderOpen] = useState(false);

  const genderOptions = [
    { label: 'Femenino', value: 'Femenino' },
    { label: 'Masculino', value: 'Masculino' },
    { label: 'No binario', value: 'No binario' },
    { label: 'Prefiero no decir', value: 'Prefiero no decir' },
  ];

  const [form, setForm] = useState({
    nombre: '',
    usuario: '',
    email: '',
    genero: '',
    password: '',
  });

  const canSubmit = useMemo(() => {
    return (
      form.nombre.trim().length >= 2 &&
      form.usuario.trim().length >= 3 &&
      isValidEmail(form.email) &&
      form.genero.trim().length > 0 &&
      form.password.length >= 6
    );
  }, [form]);

  const onChange = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const resetForm = () => {
    setForm({ nombre: '', usuario: '', email: '', genero: '', password: '' });
  };

  const closeModal = () => {
    setIsRegisterOpen(false);
    setGenderOpen(false);
    Keyboard.dismiss();
  };

  const submit = async () => {
    if (!canSubmit) {
      info(
        "Revisa tus datos",
        "Asegúrate de completar todo correctamente (contraseña mínimo 6 caracteres)."
      );
      return;
    }

    try {
      const cred = await createUserWithEmailAndPassword(
        firebaseAuth,
        form.email.trim().toLowerCase(),
        form.password
      );

      const uid = cred.user.uid;

      await setDoc(doc(db, "users", uid), {
        nombre: form.nombre.trim(),
        usuario: form.usuario.trim().toLowerCase(),
        email: form.email.trim().toLowerCase(),
        genero: form.genero,
        createdAt: serverTimestamp(),
      });

      info("Registro listo", `Bienvenido/a, ${form.nombre}!`);

      closeModal();
      resetForm();
    } catch (e) {
      if (e.code === "auth/email-already-in-use") {
        info("Ese correo ya está registrado", "Prueba con otro correo.");
      } else if (e.code === "auth/invalid-email") {
        info("Correo inválido", "Revisa el formato del correo.");
      } else if (e.code === "auth/weak-password") {
        info("Contraseña débil", "Usa una contraseña más fuerte.");
      } else {
        info("Error", e.message);
      }
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: "transparent" }}>
      <LoveBubbleBackground />
      <View style={styles.container}>
      <View style={styles.card}>
        <Image
          source={require("./assets/logo.png")}
          style={styles.logoImage}
          resizeMode="contain"
          accessibilityLabel="PartnerLife"
        />
        <Text style={styles.tagline}>Tu app para conectar y crecer</Text>

        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
            onPress={() => setIsLoginOpen(true)}
          >
            <Text style={styles.primaryBtnText}>Iniciar</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
            onPress={() => setIsRegisterOpen(true)}
          >
            <Text style={styles.secondaryBtnText}>Registro</Text>
          </Pressable>
        </View>

        <Text style={styles.footer}>MoniJuro™</Text>
      </View>

      <StatusBar style="dark" translucent={false} />
      </View>

      {/* MODAL REGISTRO */}
      <Modal
        visible={isRegisterOpen}
        animationType="fade"
        transparent
        onRequestClose={closeModal}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={{ width: '100%' }}
            >
              <TouchableWithoutFeedback>
                <View style={styles.modalCard}>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Crear cuenta</Text>

                    <Pressable onPress={closeModal} hitSlop={10} style={styles.closeBtn}>
                      <Text style={styles.closeBtnText}>✕</Text>
                    </Pressable>
                  </View>

                  <Text style={styles.modalSubtitle}>
                    Completa tus datos para registrarte en PartnerLife.
                  </Text>

                  <View style={styles.form}>
                    <Text style={styles.label}>Nombre</Text>
                    <TextInput
                      value={form.nombre}
                      onChangeText={(t) => onChange('nombre', t)}
                      placeholder="Ej: María López"
                      placeholderTextColor="#9CA3AF"
                      style={styles.input}
                      autoCapitalize="words"
                      returnKeyType="next"
                    />

                    <Text style={styles.label}>Usuario</Text>
                    <TextInput
                      value={form.usuario}
                      onChangeText={(t) => onChange('usuario', t)}
                      placeholder="Ej: marialopez"
                      placeholderTextColor="#9CA3AF"
                      style={styles.input}
                      autoCapitalize="none"
                      returnKeyType="next"
                    />

                    <Text style={styles.label}>Correo electrónico</Text>
                    <TextInput
                      value={form.email}
                      onChangeText={(t) => onChange('email', t)}
                      placeholder="Ej: maria@gmail.com"
                      placeholderTextColor="#9CA3AF"
                      style={styles.input}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      returnKeyType="next"
                    />

                    <Text style={styles.label}>Género</Text>

                    <Pressable
                      onPress={() => setGenderOpen((v) => !v)}
                      style={({ pressed }) => [
                        styles.select,
                        pressed && styles.pressed,
                        genderOpen && styles.selectOpen,
                      ]}
                    >
                      <Text style={[styles.selectText, !form.genero && styles.selectPlaceholder]}>
                        {form.genero ? form.genero : 'Selecciona una opción'}
                      </Text>
                      <Text style={styles.chevron}>{genderOpen ? '▲' : '▼'}</Text>
                    </Pressable>

                    {genderOpen && (
                      <View style={styles.dropdown}>
                        {genderOptions.map((opt) => (
                          <Pressable
                            key={opt.value}
                            onPress={() => {
                              onChange('genero', opt.value);
                              setGenderOpen(false);
                            }}
                            style={({ pressed }) => [
                              styles.dropdownItem,
                              pressed && { opacity: 0.85 },
                              form.genero === opt.value && styles.dropdownItemActive,
                            ]}
                          >
                            <Text
                              style={[
                                styles.dropdownItemText,
                                form.genero === opt.value && styles.dropdownItemTextActive,
                              ]}
                            >
                              {opt.label}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    )}

                    <Text style={styles.label}>Contraseña</Text>
                    <TextInput
                      value={form.password}
                      onChangeText={(t) => onChange('password', t)}
                      placeholder="Mínimo 6 caracteres"
                      placeholderTextColor="#9CA3AF"
                      style={styles.input}
                      secureTextEntry
                      autoCapitalize="none"
                      returnKeyType="done"
                      onSubmitEditing={submit}
                    />
                  </View>

                  <View style={styles.modalActions}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.modalPrimaryBtn,
                        !canSubmit && { opacity: 0.5 },
                        pressed && styles.pressed,
                      ]}
                      onPress={submit}
                      disabled={!canSubmit}
                    >
                      <Text style={styles.modalPrimaryBtnText}>Crear cuenta</Text>
                    </Pressable>

                    <Pressable
                      style={({ pressed }) => [styles.modalSecondaryBtn, pressed && styles.pressed]}
                      onPress={() => {
                        closeModal();
                        resetForm();
                      }}
                    >
                      <Text style={styles.modalSecondaryBtnText}>Cancelar</Text>
                    </Pressable>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* MODAL LOGIN */}
      <Modal
        visible={isLoginOpen}
        animationType="fade"
        transparent
        onRequestClose={closeLoginModal}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={{ width: '100%' }}
            >
              <TouchableWithoutFeedback>
                <View style={styles.modalCard}>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Iniciar sesión</Text>

                    <Pressable onPress={closeLoginModal} hitSlop={10} style={styles.closeBtn}>
                      <Text style={styles.closeBtnText}>✕</Text>
                    </Pressable>
                  </View>

                  <Text style={styles.modalSubtitle}>
                    Ingresa con tu correo y contraseña.
                  </Text>

                  <View style={styles.form}>
                    <Text style={styles.label}>Correo electrónico</Text>
                    <TextInput
                      value={loginForm.email}
                      onChangeText={(t) => onLoginChange('email', t)}
                      placeholder="Ej: maria@gmail.com"
                      placeholderTextColor="#9CA3AF"
                      style={styles.input}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      returnKeyType="next"
                    />

                    <Text style={styles.label}>Contraseña</Text>
                    <TextInput
                      value={loginForm.password}
                      onChangeText={(t) => onLoginChange('password', t)}
                      placeholder="Tu contraseña"
                      placeholderTextColor="#9CA3AF"
                      style={styles.input}
                      secureTextEntry
                      autoCapitalize="none"
                      returnKeyType="done"
                      onSubmitEditing={login}
                    />
                  </View>

                  <View style={styles.modalActions}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.modalPrimaryBtn,
                        !canLogin && { opacity: 0.5 },
                        pressed && styles.pressed,
                      ]}
                      onPress={login}
                      disabled={!canLogin}
                    >
                      <Text style={styles.modalPrimaryBtnText}>Entrar</Text>
                    </Pressable>

                    <Pressable
                      style={({ pressed }) => [styles.modalSecondaryBtn, pressed && styles.pressed]}
                      onPress={() => {
                        closeLoginModal();
                        resetLoginForm();
                      }}
                    >
                      <Text style={styles.modalSecondaryBtnText}>Cancelar</Text>
                    </Pressable>
                  </View>

                </View>
              </TouchableWithoutFeedback>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

function AuthGate() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(firebaseAuth, (u) => {
      setUser(u || null);
      setLoading(false);
    });
    return unsub;
  }, []);

  if (loading) return null;

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "transparent" },
      }}
    >
      {user ? (
        <Stack.Screen name="MainScreen" component={MainTabs} />
      ) : (
        <Stack.Screen name="Home" component={HomeScreen} />
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <DialogProvider>
        <View style={{ flex: 1, backgroundColor: PL.bg }}>
          <SafeAreaView style={{ flex: 1, backgroundColor: "transparent" }}>
            <NavigationContainer theme={navigationTheme}>
              <AuthGate />
            </NavigationContainer>
          </SafeAreaView>
        </View>
      </DialogProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "transparent",
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderRadius: 24,
    paddingVertical: 28,
    paddingHorizontal: 22,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: PL.skyBorder,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  logoImage: {
    width: 220,
    height: 140,
    marginBottom: 8,
  },
  tagline: {
    marginTop: 4,
    fontSize: 14,
    opacity: 0.72,
    textAlign: 'center',
    color: PL.textSubtle,
    fontWeight: '600',
  },
  actions: {
    width: '100%',
    marginTop: 18,
    gap: 12,
  },
  primaryBtn: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: PL.cta,
    borderWidth: 1,
    borderColor: PL.skyBorder,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryBtn: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: PL.roseLight,
    borderWidth: 1,
    borderColor: PL.roseBorder,
  },
  secondaryBtnText: {
    color: PL.rose,
    fontSize: 16,
    fontWeight: '800',
  },
  pressed: {
    transform: [{ scale: 0.99 }],
    opacity: 0.92,
  },
  footer: {
    marginTop: 18,
    fontSize: 12,
    opacity: 0.55,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 18,
  },
  modalCard: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 18,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: PL.ink,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PL.surfaceMuted,
  },
  closeBtnText: {
    fontSize: 16,
    fontWeight: '900',
    color: PL.ink,
  },
  modalSubtitle: {
    fontSize: 13,
    opacity: 0.7,
    marginBottom: 14,
  },
  form: {
    gap: 10,
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    color: PL.ink,
    marginTop: 6,
  },
  input: {
    width: '100%',
    height: 46,
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: PL.skyBorder,
    backgroundColor: PL.surfaceMuted,
    color: PL.ink,
  },
  select: {
    width: '100%',
    height: 46,
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: PL.skyBorder,
    backgroundColor: PL.surfaceMuted,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectOpen: {
    borderColor: PL.roseBorder,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  selectText: {
    color: PL.ink,
    fontSize: 14,
    fontWeight: '600',
  },
  selectPlaceholder: {
    color: '#9CA3AF',
    fontWeight: '500',
  },
  chevron: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '900',
  },
  dropdown: {
    marginTop: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  dropdownItem: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  dropdownItemActive: {
    backgroundColor: PL.roseLight,
  },
  dropdownItemText: {
    color: PL.ink,
    fontSize: 14,
    fontWeight: '700',
  },
  dropdownItemTextActive: {
    color: PL.rose,
  },
  modalActions: {
    marginTop: 16,
    gap: 10,
  },
  modalPrimaryBtn: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: PL.cta,
  },
  modalPrimaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
  },
  modalSecondaryBtn: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: PL.surfaceMuted,
  },
  modalSecondaryBtnText: {
    color: PL.ink,
    fontSize: 16,
    fontWeight: '800',
  },
});
