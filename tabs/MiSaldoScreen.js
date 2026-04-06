// screens/MiSaldoScreen.js
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  Modal,
  TextInput,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { auth as firebaseAuth, db } from "../firebaseConfig";
import {
  doc,
  onSnapshot,
  updateDoc,
  setDoc,
  serverTimestamp,
  collection,
  query,
  orderBy,
} from "firebase/firestore";

export default function MiSaldoScreen() {
  const user = firebaseAuth.currentUser;

  const [profile, setProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  const groupId = profile?.groupId || "";
  const hasGroup = !!groupId;

  // saldo individual independiente
  const miSaldoNumber = useMemo(() => {
    const v = profile?.miSaldo; // 🔥 ESTE CAMPO ES INDEPENDIENTE DEL "saldo" (salarios)
    if (typeof v === "number") return v;
    return 0;
  }, [profile?.miSaldo]);

  const fmtCRC = (n) => {
    const v = Number(n || 0);
    try {
      return new Intl.NumberFormat("es-CR", {
        style: "currency",
        currency: "CRC",
        maximumFractionDigits: 0,
      }).format(v);
    } catch {
      return `₡ ${Math.round(v).toLocaleString("es-CR")}`;
    }
  };

  const generoForLog = (it) => {
    const uid = it._actorUid || it.actorUid;
    if (it.actorGenero) return it.actorGenero;
    if (uid === user?.uid) return profile?.genero;
    if (uid === partnerUid) return partnerProfile?.genero;
    return "";
  };

  const logCardVariantStyle = (genero) => {
    const g = String(genero || "").toLowerCase();
    if (g === "femenino") return styles.logCardFem;
    if (g === "masculino") return styles.logCardMasc;
    return styles.logCardNeutral;
  };

  // ====== Config del grupo para "monto por ingreso" ======
  const [config, setConfig] = useState(null);
  const [loadingConfig, setLoadingConfig] = useState(true);

  const configRef = useMemo(() => {
    if (!hasGroup) return null;
    return doc(db, "groups", groupId, "miSaldoConfig", "main");
  }, [hasGroup, groupId]);

  const activeStep = useMemo(() => {
    const v = config?.value;
    return typeof v === "number" && v > 0 ? v : 10000; // default
  }, [config?.value]);

  const hasPending = !!(config?.pendingValue && config?.pendingValue > 0);
  const pendingValue = config?.pendingValue || 0;
  const pendingBy = config?.pendingBy || "";

  const canApprove = useMemo(() => {
    if (!user?.uid) return false;
    if (!hasPending) return false;
    return pendingBy && pendingBy !== user.uid; // el otro
  }, [hasPending, pendingBy, user?.uid]);

  const isMinePending = useMemo(() => {
    if (!user?.uid) return false;
    return hasPending && pendingBy === user.uid;
  }, [hasPending, pendingBy, user?.uid]);

  // ====== Historial (yo + compañero) ======
  const [myLogs, setMyLogs] = useState([]);
  const [partnerLogs, setPartnerLogs] = useState([]);
  const [loadingMyLogs, setLoadingMyLogs] = useState(true);
  const [loadingPartnerLogs, setLoadingPartnerLogs] = useState(true);
  const [partnerProfile, setPartnerProfile] = useState(null);

  const partnerUid = profile?.partnerUid || "";

  const mergedLogs = useMemo(() => {
    const merged = [...myLogs, ...partnerLogs];
    merged.sort((a, b) => {
      const ta =
        a.createdAt?.toMillis?.() ??
        (a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0);
      const tb =
        b.createdAt?.toMillis?.() ??
        (b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0);
      return tb - ta;
    });
    return merged;
  }, [myLogs, partnerLogs]);

  const loadingLogs = loadingMyLogs || (!!partnerUid && loadingPartnerLogs);

  // ====== Modales ======
  const [isSetOpen, setIsSetOpen] = useState(false);
  const [amountInput, setAmountInput] = useState("");
  const [saving, setSaving] = useState(false);

  const sanitizeAmount = (t) => String(t || "").replace(/[^\d]/g, "");

  const openSet = () => {
    setAmountInput("");
    setIsSetOpen(true);
  };
  const closeSet = () => {
    setIsSetOpen(false);
    Keyboard.dismiss();
  };

  // ====== Perfil live ======
  useEffect(() => {
    if (!user?.uid) {
      setProfile(null);
      setLoadingProfile(false);
      return;
    }

    setLoadingProfile(true);
    const refDoc = doc(db, "users", user.uid);

    const unsub = onSnapshot(
      refDoc,
      (snap) => {
        setProfile(snap.exists() ? snap.data() : null);
        setLoadingProfile(false);
      },
      (e) => {
        setLoadingProfile(false);
        Alert.alert("Error", e.message);
      }
    );

    return () => unsub();
  }, [user?.uid]);

  // ====== Config live (grupo) ======
  useEffect(() => {
    if (!configRef) {
      setConfig(null);
      setLoadingConfig(false);
      return;
    }

    setLoadingConfig(true);
    const unsub = onSnapshot(
      configRef,
      async (snap) => {
        if (!snap.exists()) {
          // crear default una sola vez
          try {
            await setDoc(configRef, {
              value: 10000,
              createdAt: serverTimestamp(),
              createdBy: user?.uid || "",
            });
          } catch {}
        } else {
          setConfig(snap.data());
          setLoadingConfig(false);
        }
      },
      (e) => {
        setLoadingConfig(false);
        Alert.alert("Error", e.message);
      }
    );

    return () => unsub();
  }, [configRef, user?.uid]);

  // ====== Logs live (mis movimientos) ======
  useEffect(() => {
    if (!user?.uid) {
      setMyLogs([]);
      setLoadingMyLogs(false);
      return;
    }

    setLoadingMyLogs(true);
    const colRef = collection(db, "users", user.uid, "miSaldoLogs");
    const qRef = query(colRef, orderBy("createdAt", "desc"));

    const unsub = onSnapshot(
      qRef,
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
          _actorUid: user.uid,
        }));
        setMyLogs(list);
        setLoadingMyLogs(false);
      },
      (e) => {
        setLoadingMyLogs(false);
        Alert.alert("Error", e.message);
      }
    );

    return () => unsub();
  }, [user?.uid]);

  // ====== Logs del compañero ======
  useEffect(() => {
    if (!partnerUid) {
      setPartnerLogs([]);
      setLoadingPartnerLogs(false);
      return;
    }

    setLoadingPartnerLogs(true);
    const colRef = collection(db, "users", partnerUid, "miSaldoLogs");
    const qRef = query(colRef, orderBy("createdAt", "desc"));

    const unsub = onSnapshot(
      qRef,
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
          _actorUid: partnerUid,
        }));
        setPartnerLogs(list);
        setLoadingPartnerLogs(false);
      },
      (e) => {
        setLoadingPartnerLogs(false);
        Alert.alert("Error", e.message);
      }
    );

    return () => unsub();
  }, [partnerUid]);

  // ====== Perfil del compañero (género para colores) ======
  useEffect(() => {
    if (!partnerUid) {
      setPartnerProfile(null);
      return;
    }

    const refDoc = doc(db, "users", partnerUid);
    const unsub = onSnapshot(
      refDoc,
      (snap) => setPartnerProfile(snap.exists() ? snap.data() : null),
      () => setPartnerProfile(null)
    );
    return () => unsub();
  }, [partnerUid]);

  // ====== Acciones ======
  const proposeStep = useCallback(async () => {
    if (!user?.uid || !configRef) return;

    const amount = Number(sanitizeAmount(amountInput));
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert("Monto inválido", "Escribe un monto mayor a 0.");
      return;
    }

    try {
      setSaving(true);

      await updateDoc(configRef, {
        pendingValue: amount,
        pendingBy: user.uid,
        pendingAt: serverTimestamp(),
      });

      Alert.alert("✅ Enviado", "Monto propuesto. Tu compañero debe aprobarlo.");
      closeSet();
    } catch (e) {
      Alert.alert("Error", e?.message || "No se pudo proponer.");
    } finally {
      setSaving(false);
    }
  }, [user?.uid, configRef, amountInput]);

  const approvePending = useCallback(async () => {
    if (!user?.uid || !configRef) return;
    if (!canApprove) return;

    try {
      setSaving(true);

      await updateDoc(configRef, {
        value: pendingValue,
        acceptedBy: user.uid,
        acceptedAt: serverTimestamp(),
        // limpiar pendiente
        pendingValue: 0,
        pendingBy: "",
        pendingAt: null,
      });

      Alert.alert("✅ Aprobado", `Monto por ingreso actualizado a ${fmtCRC(pendingValue)}.`);
    } catch (e) {
      Alert.alert("Error", e?.message || "No se pudo aprobar.");
    } finally {
      setSaving(false);
    }
  }, [user?.uid, configRef, canApprove, pendingValue]);

  const rejectPending = useCallback(async () => {
    if (!user?.uid || !configRef) return;
    if (!canApprove) return;

    try {
      setSaving(true);

      await updateDoc(configRef, {
        rejectedBy: user.uid,
        rejectedAt: serverTimestamp(),
        // limpiar pendiente
        pendingValue: 0,
        pendingBy: "",
        pendingAt: null,
      });

      Alert.alert("Listo", "Monto rechazado.");
    } catch (e) {
      Alert.alert("Error", e?.message || "No se pudo rechazar.");
    } finally {
      setSaving(false);
    }
  }, [user?.uid, configRef, canApprove]);

  // ====== UI ======
  if (loadingProfile) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Cargando…</Text>
      </View>
    );
  }

  if (!hasGroup) {
    return (
      <View style={styles.container}>
        <View style={styles.lockCard}>
          <View style={styles.lockBadge}>
            <Ionicons name="lock-closed-outline" size={18} color="#111827" />
          </View>
          <Text style={styles.lockTitle}>Mi Saldo bloqueado</Text>
          <Text style={styles.lockSub}>
            Para usar aprobación de monto por ingreso, primero crea un grupo en Partner.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0B1220" }} edges={["left", "right", "bottom"]}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* ====== SALDO GRANDE ====== */}
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>Mi Saldo</Text>
          <Text style={styles.heroValue}>{fmtCRC(miSaldoNumber)}</Text>

          <Text style={styles.heroHint}>
            Al ingresar salario en Perfil, se actualiza el saldo compartido del grupo (como en Perfil) y Mi Saldo acumula solo el apartado configurado.
          </Text>

          <Pressable
            onPress={openSet}
            style={({ pressed }) => [styles.montoBtnWide, pressed && styles.pressed]}
          >
            <Ionicons name="settings-outline" size={18} color="#111827" />
            <Text style={styles.secondaryText}>Configurar monto por ingreso</Text>
          </Pressable>

          <View style={styles.stepPill}>
            <Ionicons name="cash-outline" size={16} color="#111827" />
            <Text style={styles.stepText}>
              Monto que se suma por cada ingreso de salario:{" "}
              <Text style={{ fontWeight: "900" }}>{fmtCRC(activeStep)}</Text>
            </Text>
          </View>

          {/* Pendiente */}
          {loadingConfig ? (
            <Text style={styles.pendingMini}>Cargando configuración…</Text>
          ) : hasPending ? (
            <View style={styles.pendingBox}>
              <Ionicons name="time-outline" size={18} color="#111827" />
              <View style={{ flex: 1 }}>
                <Text style={styles.pendingTitle}>Pendiente de aprobación</Text>
                <Text style={styles.pendingSub}>
                  Propuesto: <Text style={{ fontWeight: "900" }}>{fmtCRC(pendingValue)}</Text>
                  {isMinePending ? " • Esperando a tu compañero" : " • Puedes aprobar o rechazar"}
                </Text>
              </View>

              {canApprove ? (
                <View style={{ gap: 8 }}>
                  <Pressable
                    onPress={approvePending}
                    disabled={saving}
                    style={({ pressed }) => [styles.approveBtn, pressed && styles.pressed, saving && { opacity: 0.6 }]}
                  >
                    <Ionicons name="checkmark" size={16} color="#fff" />
                    <Text style={styles.approveText}>Aprobar</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => {
                      Alert.alert("Rechazar", "¿Seguro que deseas rechazar este monto?", [
                        { text: "Cancelar", style: "cancel" },
                        { text: "Rechazar", style: "destructive", onPress: rejectPending },
                      ]);
                    }}
                    disabled={saving}
                    style={({ pressed }) => [styles.rejectBtn, pressed && styles.pressed, saving && { opacity: 0.6 }]}
                  >
                    <Ionicons name="close" size={16} color="#991B1B" />
                    <Text style={styles.rejectText}>Rechazar</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>

        {/* ====== HISTORIAL ====== */}
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Text style={styles.cardTitle}>Historial (tú y tu compañero)</Text>
            <View style={styles.pill}>
              <Ionicons name="time-outline" size={14} color="#111827" />
              <Text style={styles.pillText}>{mergedLogs.length}</Text>
            </View>
          </View>

          {loadingLogs ? (
            <View style={{ paddingVertical: 14, alignItems: "center" }}>
              <ActivityIndicator />
              <Text style={{ marginTop: 10, color: "#6B7280", fontWeight: "800" }}>Cargando…</Text>
            </View>
          ) : mergedLogs.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="information-circle-outline" size={18} color="#111827" />
              <Text style={styles.emptyText}>
                Aquí aparecen los ingresos de salario desde Perfil (saldo compartido del grupo y apartado a Mi Saldo). Rosado: femenino · Azul: masculino.
              </Text>
            </View>
          ) : (
            <View style={{ gap: 10, marginTop: 8 }}>
              {mergedLogs.map((it) => {
                const d = it.createdAt?.toDate ? it.createdAt.toDate() : null;
                const when = d ? `${d.toLocaleDateString()} • ${d.toLocaleTimeString()}` : "—";
                const isFromPerfil = it.type === "salario_perfil" || typeof it.salaryAdded === "number";
                const actorUid = it._actorUid || it.actorUid;
                const isMine = actorUid === user?.uid;
                const g = generoForLog(it);
                const rowKey = `${actorUid || "x"}-${it.id}`;

                const sharedAmount =
                  typeof it.saldoCompartidoAfter === "number"
                    ? it.saldoCompartidoAfter
                    : it.saldoAfter ?? 0;
                const sharedLabel =
                  typeof it.saldoCompartidoAfter === "number"
                    ? "Saldo compartido quedó en"
                    : "Tu saldo individual quedó (hist.)";

                if (it.type === "rebajo_mensual") {
                  return (
                    <View key={rowKey} style={[styles.logCard, logCardVariantStyle(g)]}>
                      <View style={styles.logCardHeader}>
                        <View style={styles.logActorBadge}>
                          <Ionicons
                            name={isMine ? "person" : "people-outline"}
                            size={14}
                            color="#111827"
                          />
                          <Text style={styles.logActorText}>
                            {isMine ? "Tu movimiento" : "Tu compañero"}
                          </Text>
                        </View>
                        <Text style={styles.logWhen}>{when}</Text>
                      </View>
                      <View style={styles.logLine}>
                        <Text style={styles.logMuted}>Rebajo mensual</Text>
                        <Text style={styles.logStrong}>{it.rebateName || "Rebajo"}</Text>
                      </View>
                      <View style={styles.logLine}>
                        <Text style={styles.logMuted}>Descontado</Text>
                        <Text style={[styles.logStrong, { color: "#B91C1C" }]}>
                          −{fmtCRC(it.amount || 0)}
                        </Text>
                      </View>
                      <View style={styles.logLine}>
                        <Text style={styles.logMuted}>{sharedLabel}</Text>
                        <Text style={styles.logStrong}>{fmtCRC(sharedAmount)}</Text>
                      </View>
                    </View>
                  );
                }

                if (isFromPerfil) {
                  return (
                    <View key={rowKey} style={[styles.logCard, logCardVariantStyle(g)]}>
                      <View style={styles.logCardHeader}>
                        <View style={styles.logActorBadge}>
                          <Ionicons
                            name={isMine ? "person" : "people-outline"}
                            size={14}
                            color="#111827"
                          />
                          <Text style={styles.logActorText}>
                            {isMine ? "Tu movimiento" : "Tu compañero"}
                          </Text>
                        </View>
                        <Text style={styles.logWhen}>{when}</Text>
                      </View>
                      <View style={styles.logLine}>
                        <Text style={styles.logMuted}>Salario ingresado</Text>
                        <Text style={styles.logStrong}>{fmtCRC(it.salaryAdded || 0)}</Text>
                      </View>
                      <View style={styles.logLine}>
                        <Text style={styles.logMuted}>{sharedLabel}</Text>
                        <Text style={styles.logStrong}>{fmtCRC(sharedAmount)}</Text>
                      </View>
                      <View style={styles.logLine}>
                        <Text style={styles.logMuted}>A Mi Saldo</Text>
                        <Text style={styles.logAccent}>+{fmtCRC(it.miSaldoAdded || 0)}</Text>
                      </View>
                    </View>
                  );
                }

                return (
                  <View key={rowKey} style={[styles.logRow, logCardVariantStyle(g)]}>
                    <View style={styles.logLeft}>
                      <View style={styles.dot} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.logTitle}>
                          Ingreso manual (anterior) · {isMine ? "Tú" : "Compañero"}
                        </Text>
                        <Text style={styles.logMeta} numberOfLines={1}>{when}</Text>
                      </View>
                    </View>
                    <Text style={styles.logAmount}>{fmtCRC(it.amount || 0)}</Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        <Text style={styles.footer}>PartnerLife • MoniJuro™</Text>

        {/* ====== MODAL SET MONTO ====== */}
        <Modal visible={isSetOpen} animationType="fade" transparent onRequestClose={closeSet}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.modalOverlay}>
              <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ width: "100%" }}>
                <TouchableWithoutFeedback>
                  <View style={styles.modalCard}>
                    <View style={styles.modalHeader}>
                      <Text style={styles.modalTitle}>Monto por ingreso</Text>
                      <Pressable onPress={closeSet} hitSlop={10} style={styles.closeBtn}>
                        <Text style={styles.closeBtnText}>✕</Text>
                      </Pressable>
                    </View>

                    <Text style={styles.modalSub}>
                      Escribe el monto. Se enviará como pendiente y tu compañero debe aprobarlo.
                    </Text>

                    <Text style={styles.label}>Monto</Text>
                    <View style={styles.moneyWrap}>
                      <Text style={styles.moneyPrefix}>₡</Text>
                      <TextInput
                        value={amountInput}
                        onChangeText={(t) => setAmountInput(sanitizeAmount(t))}
                        placeholder="Ej: 15000"
                        placeholderTextColor="#9CA3AF"
                        keyboardType="number-pad"
                        style={styles.moneyInput}
                        returnKeyType="done"
                        onSubmitEditing={proposeStep}
                      />
                    </View>

                    <Text style={styles.preview}>
                      Propuesta:{" "}
                      <Text style={styles.previewStrong}>
                        {fmtCRC(Number(sanitizeAmount(amountInput)) || 0)}
                      </Text>
                    </Text>

                    <View style={{ marginTop: 14, gap: 10 }}>
                      <Pressable
                        style={({ pressed }) => [styles.modalPrimaryBtn, pressed && styles.pressed, saving && { opacity: 0.6 }]}
                        onPress={proposeStep}
                        disabled={saving}
                      >
                        <Text style={styles.modalPrimaryText}>{saving ? "Enviando..." : "Enviar a aprobación"}</Text>
                      </Pressable>

                      <Pressable style={({ pressed }) => [styles.modalSecondaryBtn, pressed && styles.pressed]} onPress={closeSet} disabled={saving}>
                        <Text style={styles.modalSecondaryText}>Cancelar</Text>
                      </Pressable>
                    </View>
                  </View>
                </TouchableWithoutFeedback>
              </KeyboardAvoidingView>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ------------------ STYLES ------------------ */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1220" },
  content: { padding: 16, paddingBottom: 26 },

  loadingWrap: { flex: 1, backgroundColor: "#0B1220", alignItems: "center", justifyContent: "center", padding: 16 },
  loadingText: { marginTop: 10, color: "rgba(255,255,255,0.75)", fontWeight: "800" },

  hero: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
  },
  heroLabel: { color: "rgba(255,255,255,0.75)", fontWeight: "900", fontSize: 12 },
  heroValue: { marginTop: 6, color: "#fff", fontWeight: "900", fontSize: 38, textAlign: "center" },

  heroHint: {
    marginTop: 12,
    color: "rgba(255,255,255,0.72)",
    fontWeight: "700",
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
    paddingHorizontal: 4,
  },

  montoBtnWide: {
    marginTop: 14,
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.92)",
  },
  secondaryText: { color: "#111827", fontWeight: "900" },

  stepPill: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: 1,
    borderColor: "rgba(17,24,39,0.08)",
  },
  stepText: { color: "#111827", fontWeight: "800" },

  pendingMini: { marginTop: 10, color: "rgba(255,255,255,0.65)", fontWeight: "800" },

  pendingBox: {
    marginTop: 12,
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: 1,
    borderColor: "rgba(236,72,153,0.18)",
  },
  pendingTitle: { fontWeight: "900", color: "#111827" },
  pendingSub: { marginTop: 2, fontWeight: "800", color: "#6B7280" },

  approveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "#111827",
  },
  approveText: { color: "#fff", fontWeight: "900" },

  rejectBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "rgba(239,68,68,0.10)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.22)",
  },
  rejectText: { color: "#991B1B", fontWeight: "900" },

  card: {
    backgroundColor: "rgba(255,255,255,0.97)",
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  cardTitle: { fontWeight: "900", fontSize: 14, color: "#111827" },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(17,24,39,0.03)",
    borderWidth: 1,
    borderColor: "rgba(17,24,39,0.10)",
  },
  pillText: { fontWeight: "900", color: "#111827", fontSize: 12, opacity: 0.85 },

  emptyBox: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: "rgba(17,24,39,0.03)",
    borderWidth: 1,
    borderColor: "rgba(17,24,39,0.10)",
  },
  emptyText: { flex: 1, color: "#111827", fontWeight: "800", opacity: 0.85, fontSize: 12, lineHeight: 16 },

  logCard: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: "rgba(17,24,39,0.03)",
    borderWidth: 1,
    borderLeftWidth: 4,
    borderLeftColor: "#D1D5DB",
    borderColor: "rgba(17,24,39,0.10)",
    gap: 8,
  },
  logCardFem: {
    borderLeftColor: "#ec4899",
    backgroundColor: "rgba(236,72,153,0.10)",
    borderColor: "rgba(236,72,153,0.22)",
  },
  logCardMasc: {
    borderLeftColor: "#3b82f6",
    backgroundColor: "rgba(59,130,246,0.10)",
    borderColor: "rgba(59,130,246,0.22)",
  },
  logCardNeutral: {
    borderLeftColor: "#9CA3AF",
    backgroundColor: "rgba(17,24,39,0.05)",
    borderColor: "rgba(17,24,39,0.12)",
  },
  logCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 2,
  },
  logActorBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.65)",
  },
  logActorText: { fontSize: 11, fontWeight: "900", color: "#111827" },
  logWhen: { fontSize: 11, fontWeight: "800", color: "#9CA3AF" },
  logLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  logMuted: { flex: 1, fontSize: 12, fontWeight: "700", color: "#6B7280" },
  logStrong: { fontSize: 13, fontWeight: "900", color: "#111827" },
  logAccent: { fontSize: 13, fontWeight: "900", color: "#16A34A" },

  logRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: "rgba(17,24,39,0.03)",
    borderWidth: 1,
    borderLeftWidth: 4,
    borderLeftColor: "#D1D5DB",
    borderColor: "rgba(17,24,39,0.10)",
  },
  logLeft: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 10, borderWidth: 2, borderColor: "#16A34A" },
  logTitle: { fontWeight: "900", color: "#111827", fontSize: 13 },
  logMeta: { marginTop: 2, fontWeight: "800", color: "#6B7280", fontSize: 12 },
  logAmount: { fontWeight: "900", color: "#111827" },

  footer: { marginTop: 6, color: "rgba(255,255,255,0.55)", textAlign: "center", fontSize: 12 },
  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },

  // bloqueo sin grupo
  lockCard: {
    margin: 16,
    backgroundColor: "rgba(255,255,255,0.97)",
    borderRadius: 18,
    padding: 18,
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
    alignItems: "center",
  },
  lockBadge: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: "rgba(236,72,153,0.12)",
    borderWidth: 1,
    borderColor: "rgba(236,72,153,0.22)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  lockTitle: { fontSize: 16, fontWeight: "900", color: "#111827", textAlign: "center" },
  lockSub: { marginTop: 6, fontSize: 12, fontWeight: "800", color: "#6B7280", textAlign: "center", lineHeight: 16 },

  // modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.60)", justifyContent: "center", padding: 18 },
  modalCard: { width: "100%", maxWidth: 520, alignSelf: "center", backgroundColor: "#fff", borderRadius: 18, padding: 18 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  modalTitle: { fontSize: 18, fontWeight: "900", color: "#111827" },
  modalSub: { fontSize: 13, opacity: 0.7, marginBottom: 14, color: "#111827" },

  closeBtn: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "#F3F4F6" },
  closeBtnText: { fontSize: 16, fontWeight: "900", color: "#111827" },

  label: { fontSize: 12, fontWeight: "900", color: "#111827" },
  moneyWrap: { marginTop: 6, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#E5E7EB", backgroundColor: "#FAFAFA", borderRadius: 14, overflow: "hidden" },
  moneyPrefix: { paddingHorizontal: 14, fontWeight: "900", color: "#111827", opacity: 0.9, fontSize: 16 },
  moneyInput: { flex: 1, height: 48, paddingHorizontal: 10, color: "#111827", fontWeight: "800", fontSize: 16 },

  preview: { marginTop: 8, fontSize: 12, color: "#6B7280" },
  previewStrong: { color: "#111827", fontWeight: "900" },

  modalPrimaryBtn: { width: "100%", paddingVertical: 14, borderRadius: 14, alignItems: "center", backgroundColor: "#111827" },
  modalPrimaryText: { color: "#fff", fontSize: 16, fontWeight: "900" },
  modalSecondaryBtn: { width: "100%", paddingVertical: 14, borderRadius: 14, alignItems: "center", backgroundColor: "#F3F4F6" },
  modalSecondaryText: { color: "#111827", fontSize: 16, fontWeight: "800" },
});