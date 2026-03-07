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
  Alert,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db, auth as firebaseAuth } from "./firebaseConfig";

import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import MainTabs from "./tabs/MainTabs"; // ✅ default import


const Stack = createNativeStackNavigator();

function HomeScreen() {
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
      Alert.alert("Revisa tus datos", "Correo válido y contraseña (mín. 6).");
      return;
    }

    try {
      const cred = await signInWithEmailAndPassword(
        firebaseAuth,
        loginForm.email.trim().toLowerCase(),
        loginForm.password
      );

      Alert.alert("✅ Bienvenido/a", `Sesión iniciada como ${cred.user.email}`);

      closeLoginModal();
      resetLoginForm();

      // ✅ NO navegamos aquí. AuthGate detecta la sesión y muestra MainTabs automáticamente.
    } catch (e) {
      if (e.code === "auth/user-not-found") {
        Alert.alert("No existe esa cuenta", "Regístrate primero.");
      } else if (e.code === "auth/wrong-password") {
        Alert.alert("Contraseña incorrecta", "Intenta de nuevo.");
      } else if (e.code === "auth/invalid-email") {
        Alert.alert("Correo inválido", "Revisa el formato.");
      } else if (e.code === "auth/too-many-requests") {
        Alert.alert("Demasiados intentos", "Intenta más tarde.");
      } else {
        Alert.alert("Error", e.message);
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
      Alert.alert(
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

      Alert.alert("✅ Registro listo", `Bienvenido/a, ${form.nombre}!`);

      closeModal();
      resetForm();
    } catch (e) {
      if (e.code === "auth/email-already-in-use") {
        Alert.alert("Ese correo ya está registrado", "Prueba con otro correo.");
      } else if (e.code === "auth/invalid-email") {
        Alert.alert("Correo inválido", "Revisa el formato del correo.");
      } else if (e.code === "auth/weak-password") {
        Alert.alert("Contraseña débil", "Usa una contraseña más fuerte.");
      } else {
        Alert.alert("Error", e.message);
      }
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.bgTopGlow} />
      <View style={styles.bgBottomGlow} />

      <View style={styles.card}>
        <View style={styles.logoBadge}>
          <Text style={styles.logoBadgeText}>PL</Text>
        </View>

        <Text style={styles.logoText}>
          Partner<Text style={styles.lifeText}>Life</Text>
        </Text>
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

      <StatusBar style="light" translucent={false} />
      
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
    <Stack.Navigator screenOptions={{ headerShown: false }}>
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
      <SafeAreaView style={{ flex: 1, backgroundColor: "#0B1220" }}>
        <NavigationContainer>
          <AuthGate />
        </NavigationContainer>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B1220',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  bgTopGlow: {
    position: 'absolute',
    top: -120,
    left: -80,
    width: 260,
    height: 260,
    borderRadius: 200,
    backgroundColor: 'rgba(236, 72, 153, 0.25)',
  },
  bgBottomGlow: {
    position: 'absolute',
    bottom: -140,
    right: -90,
    width: 320,
    height: 320,
    borderRadius: 240,
    backgroundColor: 'rgba(59, 130, 246, 0.18)',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 22,
    paddingVertical: 26,
    paddingHorizontal: 22,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  logoBadge: {
    width: 54,
    height: 54,
    borderRadius: 16,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  logoBadgeText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 18,
    letterSpacing: 0.5,
  },
  logoText: {
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: 0.2,
    color: '#111827',
  },
  lifeText: {
    color: '#ec4899',
  },
  tagline: {
    marginTop: 8,
    fontSize: 14,
    opacity: 0.7,
    textAlign: 'center',
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
    backgroundColor: '#111827',
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
    backgroundColor: 'rgba(236,72,153,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(236,72,153,0.35)',
  },
  secondaryBtnText: {
    color: '#ec4899',
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
    color: '#111827',
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },
  closeBtnText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#111827',
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
    color: '#111827',
    marginTop: 6,
  },
  input: {
    width: '100%',
    height: 46,
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FAFAFA',
    color: '#111827',
  },
  select: {
    width: '100%',
    height: 46,
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FAFAFA',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectOpen: {
    borderColor: 'rgba(236,72,153,0.55)',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  selectText: {
    color: '#111827',
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
    backgroundColor: 'rgba(236,72,153,0.10)',
  },
  dropdownItemText: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '700',
  },
  dropdownItemTextActive: {
    color: '#ec4899',
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
    backgroundColor: '#111827',
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
    backgroundColor: '#F3F4F6',
  },
  modalSecondaryBtnText: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
  },
});
