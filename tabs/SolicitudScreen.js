// screens/SolicitudesScreen.js
import React, { useEffect, useMemo, useState, useCallback } from "react";
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
import { Ionicons } from "@expo/vector-icons";
import { auth as firebaseAuth, db } from "../firebaseConfig";
import {
  doc,
  collection,
  addDoc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import { SafeAreaView } from "react-native-safe-area-context";

export default function SolicitudesScreen({ navigation }) {
  const user = firebaseAuth.currentUser;

  const [profile, setProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  const [items, setItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(true);

  // modal crear
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [titleInput, setTitleInput] = useState("");
  const [priceInput, setPriceInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [creating, setCreating] = useState(false);

  // modal revisar
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [selected, setSelected] = useState(null); // request doc
  const [reviewing, setReviewing] = useState(false);

  const sanitizeAmount = (t) => String(t || "").replace(/[^\d]/g, "");
  const groupId = profile?.groupId || "";
  const hasGroup = !!groupId;

  // ---- profile live ----
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

  // ---- requests live ----
  useEffect(() => {
    if (!hasGroup) {
      setItems([]);
      setLoadingItems(false);
      return;
    }

    setLoadingItems(true);
    const colRef = collection(db, "groups", groupId, "requests");
    const qRef = query(colRef, orderBy("createdAt", "desc"));

    const unsub = onSnapshot(
      qRef,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setItems(list);
        setLoadingItems(false);
      },
      (e) => {
        setLoadingItems(false);
        Alert.alert("Error", e.message);
      }
    );

    return () => unsub();
  }, [hasGroup, groupId]);

  // ---- derived lists ----
  const pending = useMemo(() => items.filter((x) => !x.accepted), [items]);
  const approved = useMemo(() => items.filter((x) => !!x.accepted), [items]);

  const totalApproved = useMemo(() => {
    return approved.reduce(
      (acc, x) => acc + (typeof x.price === "number" ? x.price : 0),
      0
    );
  }, [approved]);

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

  // ---- create modal ----
  const openCreate = () => {
    setTitleInput("");
    setPriceInput("");
    setNoteInput("");
    setIsCreateOpen(true);
  };
  const closeCreate = () => {
    setIsCreateOpen(false);
    Keyboard.dismiss();
  };

  // ---- review modal ----
  const openReview = (docRequest) => {
    setSelected(docRequest);
    setIsReviewOpen(true);
  };
  const closeReview = () => {
    setIsReviewOpen(false);
    setSelected(null);
  };

  const createRequest = useCallback(async () => {
    if (!user?.uid) return;

    if (!hasGroup) {
      Alert.alert("Sin grupo", "Primero crea un grupo en la pestaña Partner.");
      return;
    }

    const title = String(titleInput || "").trim();
    const price = Number(sanitizeAmount(priceInput));
    const note = String(noteInput || "").trim();

    if (!title) {
      Alert.alert("Dato requerido", "Escribe qué quieres comprar.");
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      Alert.alert("Precio inválido", "Ingresa un precio mayor a 0.");
      return;
    }

    try {
      setCreating(true);
      const colRef = collection(db, "groups", groupId, "requests");

      await addDoc(colRef, {
        title,
        price,
        note,
        accepted: false, // ✅ queda pendiente
        createdAt: serverTimestamp(),
        createdBy: user.uid,
        createdByName: profile?.nombre || user?.displayName || "",
      });

      Alert.alert("✅ Enviado", "Solicitud enviada para aprobación.");
      closeCreate();
    } catch (e) {
      Alert.alert("Error", e?.message || "No se pudo crear.");
    } finally {
      setCreating(false);
    }
  }, [
    user?.uid,
    hasGroup,
    groupId,
    titleInput,
    priceInput,
    noteInput,
    profile?.nombre,
    user?.displayName,
  ]);

  const canReviewSelected = useMemo(() => {
    if (!selected) return false;
    if (selected.accepted) return false;
    // Solo puede aprobar/rechazar el que NO lo creó
    return selected.createdBy && selected.createdBy !== user?.uid;
  }, [selected, user?.uid]);

  const approveSelected = useCallback(async () => {
    if (!selected?.id || !hasGroup) return;

    try {
      setReviewing(true);
      const ref = doc(db, "groups", groupId, "requests", selected.id);

      await updateDoc(ref, {
        accepted: true,
        acceptedAt: serverTimestamp(),
        acceptedBy: user?.uid || "",
      });

      Alert.alert("✅ Aprobado", "Solicitud aprobada.");
      closeReview();
    } catch (e) {
      Alert.alert("Error", e?.message || "No se pudo aprobar.");
    } finally {
      setReviewing(false);
    }
  }, [selected?.id, hasGroup, groupId, user?.uid]);

  const rejectSelected = useCallback(async () => {
    if (!selected?.id || !hasGroup) return;

    try {
      setReviewing(true);
      const ref = doc(db, "groups", groupId, "requests", selected.id);

      // simple: borramos el pendiente
      await deleteDoc(ref);

      Alert.alert("Listo", "Solicitud rechazada y eliminada.");
      closeReview();
    } catch (e) {
      Alert.alert("Error", e?.message || "No se pudo rechazar.");
    } finally {
      setReviewing(false);
    }
  }, [selected?.id, hasGroup, groupId]);

  // ---- UI states ----
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

          <Text style={styles.lockTitle}>Solicitudes bloqueadas</Text>
          <Text style={styles.lockSub}>
            Esta sección se activa cuando creas un grupo con tu compañero.
          </Text>

          <Pressable
            onPress={() => navigation.navigate("Partner")}
            style={({ pressed }) => [styles.bigPlusBtn, pressed && styles.pressed]}
          >
            <Ionicons name="add" size={34} color="#fff" />
          </Pressable>

          <Text style={styles.lockHint}>Ir a Partner</Text>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0B1220" }} edges={["left", "right", "bottom"]}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* ===== DASHBOARD ===== */}
        <View style={styles.headerCard}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={styles.iconBadge}>
              <Ionicons name="cart-outline" size={18} color="#111827" />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Solicitudes del grupo</Text>
              <Text style={styles.headerSub}>Pendientes requieren aprobación del otro.</Text>
            </View>

            <Pressable onPress={openCreate} style={({ pressed }) => [styles.ctaBtn, pressed && styles.pressed]}>
              <Ionicons name="add-outline" size={18} color="#fff" />
              <Text style={styles.ctaText}>Nuevo</Text>
            </Pressable>
          </View>

          <View style={styles.kpiRow}>
            <View style={styles.kpiBox}>
              <Text style={styles.kpiLabel}>Total aprobado</Text>
              <Text style={styles.kpiValue}>{fmtCRC(totalApproved)}</Text>
            </View>

            <View style={styles.kpiBox}>
              <Text style={styles.kpiLabel}>Pendientes</Text>
              <Text style={styles.kpiValue}>{pending.length}</Text>
            </View>

            <View style={styles.kpiBox}>
              <Text style={styles.kpiLabel}>Aprobadas</Text>
              <Text style={styles.kpiValue}>{approved.length}</Text>
            </View>
          </View>
        </View>

        {/* ===== PENDIENTES ===== */}
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Text style={styles.cardTitle}>Pendientes</Text>
            <View style={styles.pillPending}>
              <Ionicons name="time-outline" size={14} color="#111827" />
              <Text style={styles.pillText}>Requiere aprobación</Text>
            </View>
          </View>

          {loadingItems ? (
            <View style={{ paddingVertical: 14, alignItems: "center" }}>
              <ActivityIndicator />
              <Text style={{ marginTop: 10, color: "#6B7280", fontWeight: "800" }}>Cargando…</Text>
            </View>
          ) : pending.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="checkmark-circle-outline" size={18} color="#111827" />
              <Text style={styles.emptyText}>No hay solicitudes pendientes.</Text>
            </View>
          ) : (
            <View style={{ gap: 10, marginTop: 8 }}>
              {pending.map((it) => {
                const isMine = it.createdBy === user?.uid;
                const subtitle = isMine ? "Esperando aprobación" : "Toca para revisar";

                return (
                  <Pressable
                    key={it.id}
                    onPress={() => openReview(it)}
                    style={({ pressed }) => [styles.itemRow, pressed && styles.pressed, isMine && { opacity: 0.85 }]}
                  >
                    <View style={styles.itemLeft}>
                      <View style={styles.itemDotPending} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.itemName} numberOfLines={1}>
                          {it.title || "Solicitud"}
                        </Text>
                        <Text style={styles.itemMeta} numberOfLines={1}>
                          {subtitle}
                        </Text>
                      </View>
                    </View>

                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={styles.itemAmount}>{fmtCRC(it.price || 0)}</Text>
                      <Text style={styles.itemMini} numberOfLines={1}>
                        {isMine ? "Tú la creaste" : "La creó tu compañero"}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {/* ===== APROBADAS ===== */}
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Text style={styles.cardTitle}>Aprobadas</Text>
            <View style={styles.pillOk}>
              <Ionicons name="checkmark-outline" size={14} color="#16A34A" />
              <Text style={[styles.pillText, { color: "#16A34A" }]}>Aceptadas</Text>
            </View>
          </View>

          {loadingItems ? (
            <View style={{ paddingVertical: 14, alignItems: "center" }}>
              <ActivityIndicator />
              <Text style={{ marginTop: 10, color: "#6B7280", fontWeight: "800" }}>Cargando…</Text>
            </View>
          ) : approved.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="information-circle-outline" size={18} color="#111827" />
              <Text style={styles.emptyText}>Aún no hay solicitudes aprobadas.</Text>
            </View>
          ) : (
            <View style={{ gap: 10, marginTop: 8 }}>
              {approved.map((it) => (
                <View key={it.id} style={styles.itemRow}>
                  <View style={styles.itemLeft}>
                    <View style={styles.itemDotOk} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.itemName} numberOfLines={1}>
                        {it.title || "Solicitud"}
                      </Text>
                      <Text style={styles.itemMeta} numberOfLines={1}>
                        Aprobada ✅
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.itemAmount}>{fmtCRC(it.price || 0)}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <Text style={styles.footer}>PartnerLife • MoniJuro™</Text>

        {/* ===== MODAL CREAR ===== */}
        <Modal visible={isCreateOpen} animationType="fade" transparent onRequestClose={closeCreate}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.modalOverlay}>
              <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ width: "100%" }}>
                <TouchableWithoutFeedback>
                  <View style={styles.modalCard}>
                    <View style={styles.modalHeader}>
                      <Text style={styles.modalTitle}>Nueva solicitud</Text>
                      <Pressable onPress={closeCreate} hitSlop={10} style={styles.closeBtn}>
                        <Text style={styles.closeBtnText}>✕</Text>
                      </Pressable>
                    </View>

                    <Text style={styles.modalSub}>
                      Se enviará como pendiente para que tu compañero la apruebe o rechace.
                    </Text>

                    <Text style={styles.label}>Artículo</Text>
                    <TextInput
                      value={titleInput}
                      onChangeText={setTitleInput}
                      placeholder="Ej: Juego de Switch"
                      placeholderTextColor="#9CA3AF"
                      style={styles.input}
                      returnKeyType="next"
                    />

                    <Text style={[styles.label, { marginTop: 10 }]}>Precio</Text>
                    <View style={styles.moneyWrap}>
                      <Text style={styles.moneyPrefix}>₡</Text>
                      <TextInput
                        value={priceInput}
                        onChangeText={(t) => setPriceInput(sanitizeAmount(t))}
                        placeholder="Ej: 35000"
                        placeholderTextColor="#9CA3AF"
                        keyboardType="number-pad"
                        style={styles.moneyInput}
                        returnKeyType="next"
                      />
                    </View>

                    <Text style={[styles.label, { marginTop: 10 }]}>Nota (opcional)</Text>
                    <TextInput
                      value={noteInput}
                      onChangeText={setNoteInput}
                      placeholder="Ej: Está en descuento / lo ocupo para..."
                      placeholderTextColor="#9CA3AF"
                      style={[styles.input, { height: 80, textAlignVertical: "top", paddingTop: 12 }]}
                      multiline
                      returnKeyType="done"
                      onSubmitEditing={createRequest}
                    />

                    <Text style={styles.preview}>
                      Precio:{" "}
                      <Text style={styles.previewStrong}>
                        {fmtCRC(Number(sanitizeAmount(priceInput)) || 0)}
                      </Text>
                    </Text>

                    <View style={{ marginTop: 14, gap: 10 }}>
                      <Pressable
                        style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed, creating && { opacity: 0.6 }]}
                        onPress={createRequest}
                        disabled={creating}
                      >
                        <Text style={styles.primaryText}>{creating ? "Enviando..." : "Enviar a aprobación"}</Text>
                      </Pressable>

                      <Pressable
                        style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
                        onPress={closeCreate}
                        disabled={creating}
                      >
                        <Text style={styles.secondaryText}>Cancelar</Text>
                      </Pressable>
                    </View>
                  </View>
                </TouchableWithoutFeedback>
              </KeyboardAvoidingView>
            </View>
          </TouchableWithoutFeedback>
        </Modal>

        {/* ===== MODAL REVISAR ===== */}
        <Modal visible={isReviewOpen} animationType="fade" transparent onRequestClose={closeReview}>
          <TouchableWithoutFeedback onPress={closeReview}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback>
                <View style={styles.reviewCard}>
                  <View style={styles.reviewTop}>
                    <View style={styles.reviewBadge}>
                      <Ionicons name="sparkles-outline" size={18} color="#111827" />
                    </View>

                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.reviewTitle} numberOfLines={1}>
                        {selected?.title || "Solicitud"}
                      </Text>
                      <Text style={styles.reviewSub} numberOfLines={1}>
                        {fmtCRC(selected?.price || 0)}
                      </Text>
                    </View>

                    <Pressable onPress={closeReview} hitSlop={10} style={styles.closeBtn}>
                      <Text style={styles.closeBtnText}>✕</Text>
                    </Pressable>
                  </View>

                  {!!selected?.note ? (
                    <View style={styles.noteBox}>
                      <Ionicons name="chatbubble-ellipses-outline" size={18} color="#111827" />
                      <Text style={styles.noteText}>{selected.note}</Text>
                    </View>
                  ) : null}

                  <View style={styles.reviewInfo}>
                    <Ionicons name="information-circle-outline" size={18} color="#111827" />
                    <Text style={styles.reviewInfoText}>
                      {selected?.createdBy === user?.uid
                        ? "Esta solicitud la creaste tú. Quedará aprobada cuando tu compañero la acepte."
                        : "¿Quieres aprobar esta solicitud? Puedes aceptarla o rechazarla."}
                    </Text>
                  </View>

                  {canReviewSelected ? (
                    <View style={styles.reviewActions}>
                      <Pressable
                        onPress={approveSelected}
                        disabled={reviewing}
                        style={({ pressed }) => [styles.approveBtn, pressed && styles.pressed, reviewing && { opacity: 0.6 }]}
                      >
                        <Ionicons name="checkmark" size={18} color="#fff" />
                        <Text style={styles.approveText}>Aprobar</Text>
                      </Pressable>

                      <Pressable
                        onPress={() => {
                          Alert.alert("Rechazar", "¿Seguro que deseas rechazar esta solicitud?", [
                            { text: "Cancelar", style: "cancel" },
                            { text: "Rechazar", style: "destructive", onPress: rejectSelected },
                          ]);
                        }}
                        disabled={reviewing}
                        style={({ pressed }) => [styles.rejectBtn, pressed && styles.pressed, reviewing && { opacity: 0.6 }]}
                      >
                        <Ionicons name="close" size={18} color="#991B1B" />
                        <Text style={styles.rejectText}>Rechazar</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]} onPress={closeReview}>
                      <Text style={styles.secondaryText}>Cerrar</Text>
                    </Pressable>
                  )}
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ------------------ STYLES (misma vibra del app) ------------------ */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1220" },
  content: { padding: 16, paddingBottom: 26 },

  loadingWrap: { flex: 1, backgroundColor: "#0B1220", alignItems: "center", justifyContent: "center", padding: 16 },
  loadingText: { marginTop: 10, color: "rgba(255,255,255,0.75)", fontWeight: "800" },

  headerCard: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },

  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 14,
    backgroundColor: "rgba(236,72,153,0.12)",
    borderWidth: 1,
    borderColor: "rgba(236,72,153,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },

  headerTitle: { color: "#fff", fontWeight: "900", fontSize: 16 },
  headerSub: { marginTop: 2, color: "rgba(255,255,255,0.70)", fontWeight: "700", fontSize: 12 },

  kpiRow: { marginTop: 12, flexDirection: "row", gap: 10 },
  kpiBox: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  kpiLabel: { color: "rgba(255,255,255,0.75)", fontWeight: "800", fontSize: 11 },
  kpiValue: { marginTop: 6, color: "#fff", fontWeight: "900", fontSize: 14 },

  ctaBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "#111827",
  },
  ctaText: { color: "#fff", fontWeight: "900" },

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

  pillPending: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(236,72,153,0.10)",
    borderWidth: 1,
    borderColor: "rgba(236,72,153,0.18)",
  },
  pillOk: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(34,197,94,0.10)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.18)",
  },
  pillText: { fontWeight: "900", color: "#111827", fontSize: 11, opacity: 0.85 },

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

  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: "rgba(17,24,39,0.03)",
    borderWidth: 1,
    borderColor: "rgba(17,24,39,0.10)",
  },
  itemLeft: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 10 },
  itemDotPending: { width: 10, height: 10, borderRadius: 10, borderWidth: 2, borderColor: "#F59E0B" },
  itemDotOk: { width: 10, height: 10, borderRadius: 10, borderWidth: 2, borderColor: "#16A34A" },

  itemName: { fontWeight: "900", color: "#111827", fontSize: 13 },
  itemMeta: { marginTop: 2, fontWeight: "800", color: "#6B7280", fontSize: 12 },
  itemAmount: { fontWeight: "900", color: "#111827" },
  itemMini: { marginTop: 4, fontWeight: "900", color: "#6B7280", fontSize: 11 },

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
  bigPlusBtn: {
    marginTop: 16,
    width: 74,
    height: 74,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111827",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  lockHint: { marginTop: 10, color: "#111827", fontWeight: "900", opacity: 0.75, textAlign: "center" },

  // modal base
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.60)", justifyContent: "center", padding: 18 },
  modalCard: { width: "100%", maxWidth: 520, alignSelf: "center", backgroundColor: "#fff", borderRadius: 18, padding: 18 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  modalTitle: { fontSize: 18, fontWeight: "900", color: "#111827" },
  modalSub: { fontSize: 13, opacity: 0.7, marginBottom: 14, color: "#111827" },

  closeBtn: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "#F3F4F6" },
  closeBtnText: { fontSize: 16, fontWeight: "900", color: "#111827" },

  label: { fontSize: 12, fontWeight: "900", color: "#111827" },
  input: {
    marginTop: 6,
    height: 48,
    borderRadius: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FAFAFA",
    color: "#111827",
    fontWeight: "800",
  },

  moneyWrap: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FAFAFA",
    borderRadius: 14,
    overflow: "hidden",
  },
  moneyPrefix: { paddingHorizontal: 14, fontWeight: "900", color: "#111827", opacity: 0.9, fontSize: 16 },
  moneyInput: { flex: 1, height: 48, paddingHorizontal: 10, color: "#111827", fontWeight: "800", fontSize: 16 },

  preview: { marginTop: 8, fontSize: 12, color: "#6B7280" },
  previewStrong: { color: "#111827", fontWeight: "900" },

  primaryBtn: { width: "100%", paddingVertical: 14, borderRadius: 14, alignItems: "center", backgroundColor: "#111827" },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "900" },
  secondaryBtn: { width: "100%", paddingVertical: 14, borderRadius: 14, alignItems: "center", backgroundColor: "#F3F4F6" },
  secondaryText: { color: "#111827", fontSize: 16, fontWeight: "800" },

  // review modal
  reviewCard: { width: "100%", maxWidth: 520, alignSelf: "center", backgroundColor: "#fff", borderRadius: 18, padding: 18 },
  reviewTop: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  reviewBadge: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: "rgba(236,72,153,0.12)",
    borderWidth: 1,
    borderColor: "rgba(236,72,153,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  reviewTitle: { fontSize: 16, fontWeight: "900", color: "#111827" },
  reviewSub: { marginTop: 2, fontSize: 12, fontWeight: "900", color: "#6B7280" },

  noteBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: "rgba(17,24,39,0.03)",
    borderWidth: 1,
    borderColor: "rgba(17,24,39,0.10)",
    marginBottom: 12,
  },
  noteText: { flex: 1, color: "#111827", fontWeight: "800", opacity: 0.85, fontSize: 12, lineHeight: 16 },

  reviewInfo: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: "rgba(17,24,39,0.03)",
    borderWidth: 1,
    borderColor: "rgba(17,24,39,0.10)",
    marginBottom: 12,
  },
  reviewInfoText: { flex: 1, color: "#111827", fontWeight: "800", opacity: 0.85, fontSize: 12, lineHeight: 16 },

  reviewActions: { flexDirection: "row", gap: 10 },
  approveBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: "#111827",
  },
  approveText: { color: "#fff", fontWeight: "900" },

  rejectBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: "rgba(239,68,68,0.10)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.22)",
  },
  rejectText: { color: "#991B1B", fontWeight: "900" },
});