import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { signOut } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { SafeAreaView } from "react-native-safe-area-context";

import { auth as firebaseAuth, db } from "../firebaseConfig";
import { PL } from "../theme/plTheme";
import LoveBubbleBackground from "../components/LoveBubbleBackground";
import { useDialog } from "../context/DialogContext";

const genderOptions = [
  { label: "Femenino", value: "Femenino" },
  { label: "Masculino", value: "Masculino" },
  { label: "No binario", value: "No binario" },
  { label: "Prefiero no decir", value: "Prefiero no decir" },
];

export default function CompleteProfileScreen() {
  const { info } = useDialog();
  const user = firebaseAuth.currentUser;

  const [genderOpen, setGenderOpen] = useState(false);
  const [nombre, setNombre] = useState(() => String(user?.displayName || "").trim());
  const [usuario, setUsuario] = useState("");
  const [genero, setGenero] = useState("");
  const [saving, setSaving] = useState(false);

  const canSubmit = useMemo(() => {
    return (
      nombre.trim().length >= 2 &&
      usuario.trim().length >= 3 &&
      genero.trim().length > 0
    );
  }, [nombre, usuario, genero]);

  const onSubmit = async () => {
    if (!user?.uid) return;
    if (!canSubmit) {
      info(
        "Revisa tus datos",
        "Nombre (2+ caracteres), usuario (mín. 3) y género."
      );
      return;
    }

    const handle = usuario.trim().toLowerCase();
    try {
      setSaving(true);
      const refDoc = doc(db, "users", user.uid);
      const snap = await getDoc(refDoc);
      const payload = {
        nombre: nombre.trim(),
        usuario: handle,
        email: (user.email || "").trim().toLowerCase(),
        genero,
      };
      if (!snap.exists()) {
        payload.createdAt = serverTimestamp();
      }
      await setDoc(refDoc, payload, { merge: true });
    } catch (e) {
      info("Error", e?.message || "No se pudo guardar tu perfil.");
    } finally {
      setSaving(false);
    }
  };

  const onSignOut = async () => {
    try {
      await signOut(firebaseAuth);
    } catch (e) {
      info("Error", e?.message || "No se pudo cerrar sesión.");
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: "transparent" }}>
      <LoveBubbleBackground />
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <ScrollView
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.card}>
                <Text style={styles.title}>Completa tu perfil</Text>
                <Text style={styles.sub}>
                  Elige un nombre de usuario (@) para PartnerLife. Es obligatorio la primera vez que inicias
                  sesión con Google.
                </Text>

                <Text style={styles.label}>Nombre</Text>
                <TextInput
                  value={nombre}
                  onChangeText={setNombre}
                  placeholder="Tu nombre"
                  placeholderTextColor="#9CA3AF"
                  style={styles.input}
                  autoCapitalize="words"
                  returnKeyType="next"
                />

                <Text style={styles.label}>Usuario</Text>
                <TextInput
                  value={usuario}
                  onChangeText={(t) => setUsuario(t)}
                  placeholder="Ej: marialopez"
                  placeholderTextColor="#9CA3AF"
                  style={styles.input}
                  autoCapitalize="none"
                  autoCorrect={false}
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
                  <Text style={[styles.selectText, !genero && styles.selectPlaceholder]}>
                    {genero ? genero : "Selecciona una opción"}
                  </Text>
                  <Text style={styles.chevron}>{genderOpen ? "▲" : "▼"}</Text>
                </Pressable>

                {genderOpen && (
                  <View style={styles.dropdown}>
                    {genderOptions.map((opt) => (
                      <Pressable
                        key={opt.value}
                        onPress={() => {
                          setGenero(opt.value);
                          setGenderOpen(false);
                        }}
                        style={({ pressed }) => [
                          styles.dropdownItem,
                          pressed && { opacity: 0.85 },
                          genero === opt.value && styles.dropdownItemActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.dropdownItemText,
                            genero === opt.value && styles.dropdownItemTextActive,
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}

                <Text style={styles.label}>Correo</Text>
                <Text style={styles.emailReadonly}>{user?.email || "—"}</Text>

                <Pressable
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    (!canSubmit || saving) && { opacity: 0.5 },
                    pressed && styles.pressed,
                  ]}
                  onPress={onSubmit}
                  disabled={!canSubmit || saving}
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryBtnText}>Guardar y continuar</Text>
                  )}
                </Pressable>

                <Pressable
                  style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
                  onPress={onSignOut}
                  disabled={saving}
                >
                  <Text style={styles.secondaryBtnText}>Cerrar sesión</Text>
                </Pressable>
              </View>
            </ScrollView>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "transparent" },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
    justifyContent: "center",
    flexGrow: 1,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.97)",
    borderRadius: 24,
    paddingVertical: 26,
    paddingHorizontal: 22,
    borderWidth: 1,
    borderColor: PL.skyBorder,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  title: {
    fontSize: 22,
    fontWeight: "900",
    color: PL.ink,
    marginBottom: 8,
  },
  sub: {
    fontSize: 14,
    opacity: 0.72,
    color: PL.textSubtle,
    marginBottom: 16,
    lineHeight: 20,
  },
  label: {
    fontSize: 12,
    fontWeight: "800",
    color: PL.ink,
    marginTop: 10,
  },
  input: {
    width: "100%",
    height: 46,
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: PL.skyBorder,
    backgroundColor: PL.surfaceMuted,
    color: PL.ink,
    marginTop: 6,
  },
  emailReadonly: {
    marginTop: 6,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: PL.surfaceMuted,
    color: PL.ink,
    opacity: 0.85,
    fontWeight: "600",
  },
  select: {
    width: "100%",
    height: 46,
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: PL.skyBorder,
    backgroundColor: PL.surfaceMuted,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
  },
  selectOpen: {
    borderColor: PL.roseBorder,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  selectText: {
    color: PL.ink,
    fontSize: 14,
    fontWeight: "600",
  },
  selectPlaceholder: {
    color: "#9CA3AF",
    fontWeight: "500",
  },
  chevron: {
    color: "#6B7280",
    fontSize: 12,
    fontWeight: "900",
  },
  dropdown: {
    marginTop: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#fff",
    overflow: "hidden",
  },
  dropdownItem: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  dropdownItemActive: {
    backgroundColor: PL.roseLight,
  },
  dropdownItemText: {
    color: PL.ink,
    fontSize: 14,
    fontWeight: "700",
  },
  dropdownItemTextActive: {
    color: PL.rose,
  },
  primaryBtn: {
    marginTop: 22,
    width: "100%",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    backgroundColor: PL.cta,
    borderWidth: 1,
    borderColor: PL.skyBorder,
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
  },
  secondaryBtn: {
    marginTop: 12,
    width: "100%",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    backgroundColor: PL.surfaceMuted,
  },
  secondaryBtnText: {
    color: PL.ink,
    fontSize: 16,
    fontWeight: "800",
  },
  pressed: {
    transform: [{ scale: 0.99 }],
    opacity: 0.92,
  },
});
