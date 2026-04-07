// screens/SolicitudesScreen.js
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  TextInput,
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
import { PL } from "../theme/plTheme";

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
        info("Error", e.message);
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
        info("Error", e.message);
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

  const priceNumber = useMemo(
    () => Number(sanitizeAmount(priceInput)) || 0,
    [priceInput]
  );

  const canSubmitCreate = useMemo(() => {
    const titleOk = String(titleInput || "").trim().length >= 2;
    const priceOk = Number.isFinite(priceNumber) && priceNumber > 0;
    return titleOk && priceOk;
  }, [titleInput, priceNumber]);

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
      info("Sin grupo", "Primero crea un grupo en la pestaña Partner.");
      return;
    }

    const title = String(titleInput || "").trim();
    const price = Number(sanitizeAmount(priceInput));
    const note = String(noteInput || "").trim();

    if (title.length < 2) {
      info("Dato requerido", "Escribe al menos 2 caracteres describiendo qué quieres comprar.");
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      info("Precio inválido", "Ingresa un precio mayor a 0.");
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

      closeCreate();
    } catch (e) {
      info("Error", e?.message || "No se pudo crear.");
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

      info("✅ Aprobado", "Solicitud aprobada.");
      closeReview();
    } catch (e) {
      info("Error", e?.message || "No se pudo aprobar.");
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

      info("Listo", "Solicitud rechazada y eliminada.");
      closeReview();
    } catch (e) {
      info("Error", e?.message || "No se pudo rechazar.");
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
            Crea un grupo en Partner para enviar compras y que tu compañero las apruebe.
          </Text>

          <Pressable
            onPress={() => navigation.navigate("Partner")}
            style={({ pressed }) => [styles.lockPrimaryBtn, pressed && styles.pressed]}
          >
            <Ionicons name="heart-outline" size={20} color="#fff" />
            <Text style={styles.lockPrimaryBtnText}>Ir a Partner</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "transparent" }} edges={["left", "right"]}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* ===== DASHBOARD ===== */}
        <View style={styles.headerCard}>
          <View style={styles.headerTopRow}>
            <View style={styles.iconBadge}>
              <Ionicons name="cart-outline" size={18} color="#111827" />
            </View>

            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.headerTitle}>Solicitudes del grupo</Text>
              <Text style={styles.headerSub}>
                Tú propones; tu compañero aprueba o rechaza antes de comprar.
              </Text>
            </View>
          </View>

          <Pressable
            onPress={openCreate}
            accessibilityRole="button"
            accessibilityLabel="Nueva solicitud de compra"
            style={({ pressed }) => [styles.headerCtaWide, pressed && styles.pressed]}
          >
            <View style={styles.headerCtaIconWrap}>
              <Ionicons name="send-outline" size={20} color="#fff" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.headerCtaTitle}>Nueva solicitud</Text>
              <Text style={styles.headerCtaSub}>Describe el artículo y el precio en colones</Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color="rgba(255,255,255,0.85)" />
          </Pressable>

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
              <Ionicons name="sparkles-outline" size={22} color="#6B7280" />
              <View style={{ flex: 1 }}>
                <Text style={styles.emptyTitle}>Nada pendiente</Text>
                <Text style={styles.emptyText}>
                  Cuando envíes una solicitud, aparecerá aquí hasta que tu compañero responda.
                </Text>
              </View>
            </View>
          ) : (
            <View style={{ gap: 10, marginTop: 8 }}>
              {pending.map((it) => {
                const isMine = it.createdBy === user?.uid;
                const subtitle = isMine ? "Esperando a tu compañero" : "Toca para aprobar o rechazar";

                return (
                  <Pressable
                    key={it.id}
                    onPress={() => openReview(it)}
                    accessibilityRole="button"
                    accessibilityHint={isMine ? "Ver detalle de tu solicitud" : "Abrir para revisar"}
                    style={({ pressed }) => [
                      styles.itemRow,
                      isMine ? styles.itemRowMine : styles.itemRowPartner,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={styles.itemLeft}>
                      <View style={[styles.roleChip, isMine ? styles.roleChipMine : styles.roleChipPartner]}>
                        <Text style={styles.roleChipText}>{isMine ? "Mía" : "Compañero"}</Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.itemName} numberOfLines={2}>
                          {it.title || "Solicitud"}
                        </Text>
                        <Text style={styles.itemMeta} numberOfLines={1}>
                          {subtitle}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.itemRightCol}>
                      <Text style={styles.itemAmount}>{fmtCRC(it.price || 0)}</Text>
                      <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
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
        <Modal visible={isCreateOpen} animationType="slide" transparent onRequestClose={closeCreate}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.modalKbRoot}
          >
            <View style={styles.modalOverlay}>
              <Pressable style={styles.modalBackdrop} onPress={Keyboard.dismiss} accessibilityLabel="Cerrar teclado" />
              <View style={styles.modalCardWrap}>
                <View style={styles.modalCard}>
                  <View style={styles.modalGrab} />

                  <View style={styles.modalHeader}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.modalEyebrow}>Paso único</Text>
                      <Text style={styles.modalTitle}>Nueva solicitud</Text>
                    </View>
                    <Pressable onPress={closeCreate} hitSlop={12} style={styles.closeBtn} accessibilityLabel="Cerrar">
                      <Ionicons name="close" size={22} color="#111827" />
                    </Pressable>
                  </View>

                  <Text style={styles.modalSub}>
                    Tu compañero verá el artículo y el monto. Solo podrá aprobar o rechazar.
                  </Text>

                  <ScrollView
                    style={styles.modalScroll}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                  >
                    <Text style={styles.label}>¿Qué quieres comprar?</Text>
                    <TextInput
                      value={titleInput}
                      onChangeText={setTitleInput}
                      placeholder="Ej: Juego de Switch, zapatillas…"
                      placeholderTextColor="#9CA3AF"
                      style={styles.input}
                      returnKeyType="next"
                      maxLength={120}
                    />
                    <Text style={styles.fieldHint}>Mínimo 2 caracteres.</Text>

                    <Text style={[styles.label, { marginTop: 14 }]}>Precio estimado (CRC)</Text>
                    <View style={styles.moneyWrap}>
                      <Text style={styles.moneyPrefix}>₡</Text>
                      <TextInput
                        value={priceInput}
                        onChangeText={(t) => setPriceInput(sanitizeAmount(t))}
                        placeholder="35000"
                        placeholderTextColor="#9CA3AF"
                        keyboardType="number-pad"
                        style={styles.moneyInput}
                        returnKeyType="done"
                      />
                    </View>

                    <Text style={[styles.label, { marginTop: 14 }]}>Nota para tu compañero (opcional)</Text>
                    <TextInput
                      value={noteInput}
                      onChangeText={setNoteInput}
                      placeholder="Ej: Lo vi en oferta / es para el cumple…"
                      placeholderTextColor="#9CA3AF"
                      style={styles.inputNote}
                      multiline
                      textAlignVertical="top"
                      returnKeyType="default"
                    />

                    <View style={styles.previewCard}>
                      <Text style={styles.previewCardLabel}>Resumen</Text>
                      <Text style={styles.previewCardTitle} numberOfLines={2}>
                        {String(titleInput || "").trim() || "—"}
                      </Text>
                      <Text style={styles.previewCardPrice}>{fmtCRC(priceNumber)}</Text>
                      {!!String(noteInput || "").trim() && (
                        <Text style={styles.previewCardNote} numberOfLines={3}>
                          {String(noteInput || "").trim()}
                        </Text>
                      )}
                    </View>
                  </ScrollView>

                  <View style={styles.modalFooter}>
                    {!canSubmitCreate && !creating ? (
                      <Text style={styles.footerHint}>
                        Completa el nombre (2+ caracteres) y un precio mayor a ₡0.
                      </Text>
                    ) : null}
                    <Pressable
                      style={({ pressed }) => [
                        styles.primaryBtn,
                        styles.primaryBtnRow,
                        (!canSubmitCreate || creating) && styles.primaryBtnDisabled,
                        pressed && canSubmitCreate && !creating && styles.pressed,
                      ]}
                      onPress={createRequest}
                      disabled={!canSubmitCreate || creating}
                      accessibilityState={{ disabled: !canSubmitCreate || creating }}
                    >
                      {creating ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="paper-plane" size={18} color="#fff" />
                          <Text style={styles.primaryText}>Enviar a mi compañero</Text>
                        </>
                      )}
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
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* ===== MODAL REVISAR ===== */}
        <Modal visible={isReviewOpen} animationType="slide" transparent onRequestClose={closeReview}>
          <View style={styles.modalOverlay}>
            <Pressable style={styles.modalBackdrop} onPress={closeReview} accessibilityLabel="Cerrar" />
            <View style={styles.reviewCardWrap}>
              <View style={styles.reviewCard}>
                <View style={styles.modalGrab} />

                <View style={styles.reviewHero}>
                  <Text style={styles.reviewHeroAmount}>{fmtCRC(selected?.price || 0)}</Text>
                  <Text style={styles.reviewHeroTitle} numberOfLines={3}>
                    {selected?.title || "Solicitud"}
                  </Text>
                </View>

                <View style={styles.authorRow}>
                  <View style={styles.authorAvatar}>
                    <Text style={styles.authorAvatarText}>
                      {String(
                        selected?.createdBy === user?.uid
                          ? profile?.nombre || "T"
                          : selected?.createdByName || "C"
                      ).slice(0, 1).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.authorLabel}>
                      {selected?.createdBy === user?.uid ? "Tu solicitud" : "Solicitud de tu compañero"}
                    </Text>
                    <Text style={styles.authorName} numberOfLines={1}>
                      {selected?.createdBy === user?.uid
                        ? profile?.nombre || "Tú"
                        : selected?.createdByName || "Compañero"}
                    </Text>
                  </View>
                  <Pressable onPress={closeReview} hitSlop={12} style={styles.closeBtnRound} accessibilityLabel="Cerrar">
                    <Ionicons name="close" size={22} color="#111827" />
                  </Pressable>
                </View>

                {!!selected?.note ? (
                  <View style={styles.noteBox}>
                    <Ionicons name="chatbubble-ellipses-outline" size={20} color="#6B7280" />
                    <Text style={styles.noteText}>{selected.note}</Text>
                  </View>
                ) : (
                  <View style={styles.noteEmpty}>
                    <Ionicons name="remove-outline" size={18} color="#9CA3AF" />
                    <Text style={styles.noteEmptyText}>Sin nota adicional</Text>
                  </View>
                )}

                <View
                  style={[
                    styles.reviewInfo,
                    canReviewSelected ? styles.reviewInfoAction : styles.reviewInfoWait,
                  ]}
                >
                  <Ionicons
                    name={canReviewSelected ? "hand-left-outline" : "hourglass-outline"}
                    size={20}
                    color={canReviewSelected ? "#111827" : "#6B7280"}
                  />
                  <Text style={styles.reviewInfoText}>
                    {selected?.createdBy === user?.uid
                      ? "Tu compañero puede aprobar o rechazar esta solicitud. Te avisará al decidir."
                      : canReviewSelected
                        ? "Si apruebas, quedará registrada como compra aceptada. Si rechazas, se elimina."
                        : "No puedes decidir tu propia solicitud."}
                  </Text>
                </View>

                {canReviewSelected ? (
                  <View style={styles.reviewActionsCol}>
                    <Pressable
                      onPress={approveSelected}
                      disabled={reviewing}
                      style={({ pressed }) => [
                        styles.approveBtnWide,
                        pressed && styles.pressed,
                        reviewing && { opacity: 0.65 },
                      ]}
                    >
                      {reviewing ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="checkmark-circle" size={22} color="#fff" />
                          <Text style={styles.approveTextWide}>Aprobar solicitud</Text>
                        </>
                      )}
                    </Pressable>

                    <Pressable
                      onPress={() => {
                        confirm("Rechazar solicitud", "Se eliminará esta solicitud y no podrá recuperarse.", {
                          confirmText: "Rechazar",
                          cancelText: "Volver",
                          destructive: true,
                          onConfirm: rejectSelected,
                        });
                      }}
                      disabled={reviewing}
                      style={({ pressed }) => [
                        styles.rejectBtnWide,
                        pressed && styles.pressed,
                        reviewing && { opacity: 0.65 },
                      ]}
                    >
                      <Ionicons name="trash-outline" size={20} color="#991B1B" />
                      <Text style={styles.rejectTextWide}>Rechazar y eliminar</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]} onPress={closeReview}>
                    <Text style={styles.secondaryText}>Entendido</Text>
                  </Pressable>
                )}
              </View>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ------------------ STYLES (misma vibra del app) ------------------ */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "transparent" },
  content: { padding: 16, paddingBottom: 26 },

  loadingWrap: { flex: 1, backgroundColor: "transparent", alignItems: "center", justifyContent: "center", padding: 16 },
  loadingText: { marginTop: 10, color: PL.textMuted, fontWeight: "800" },

  headerCard: {
    backgroundColor: PL.headerCardBg,
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: PL.headerCardBorder,
  },

  headerTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
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

  headerTitle: { color: PL.ink, fontWeight: "900", fontSize: 16 },
  headerSub: { marginTop: 4, color: PL.textMuted, fontWeight: "700", fontSize: 12, lineHeight: 16 },

  headerCtaWide: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: PL.cta,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  headerCtaIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(236,72,153,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerCtaTitle: { color: "#fff", fontWeight: "900", fontSize: 15 },
  headerCtaSub: { marginTop: 2, color: "rgba(255,255,255,0.65)", fontWeight: "700", fontSize: 11 },

  kpiRow: { marginTop: 14, flexDirection: "row", gap: 10 },
  kpiBox: {
    flex: 1,
    backgroundColor: PL.skyLight,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: PL.skyBorder,
  },
  kpiLabel: { color: PL.textMuted, fontWeight: "800", fontSize: 11 },
  kpiValue: { marginTop: 6, color: PL.ink, fontWeight: "900", fontSize: 14 },

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
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: "rgba(17,24,39,0.03)",
    borderWidth: 1,
    borderColor: "rgba(17,24,39,0.10)",
  },
  emptyTitle: { color: "#111827", fontWeight: "900", fontSize: 13, marginBottom: 4 },
  emptyText: { color: "#6B7280", fontWeight: "700", fontSize: 12, lineHeight: 17 },

  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: "rgba(17,24,39,0.03)",
    borderColor: "rgba(17,24,39,0.10)",
  },
  itemRowMine: {
    backgroundColor: "rgba(59,130,246,0.06)",
    borderColor: "rgba(59,130,246,0.22)",
  },
  itemRowPartner: {
    backgroundColor: "rgba(236,72,153,0.06)",
    borderColor: "rgba(236,72,153,0.20)",
  },
  itemLeft: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "flex-start", gap: 10 },
  roleChip: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  roleChipMine: { backgroundColor: "rgba(59,130,246,0.15)" },
  roleChipPartner: { backgroundColor: "rgba(236,72,153,0.14)" },
  roleChipText: { fontSize: 10, fontWeight: "900", color: "#111827", letterSpacing: 0.2 },
  itemRightCol: { alignItems: "flex-end", justifyContent: "center", gap: 4, flexShrink: 0 },
  itemDotPending: { width: 10, height: 10, borderRadius: 10, borderWidth: 2, borderColor: "#F59E0B" },
  itemDotOk: { width: 10, height: 10, borderRadius: 10, borderWidth: 2, borderColor: "#16A34A" },

  itemName: { fontWeight: "900", color: "#111827", fontSize: 13 },
  itemMeta: { marginTop: 2, fontWeight: "800", color: "#6B7280", fontSize: 12 },
  itemAmount: { fontWeight: "900", color: "#111827" },
  itemMini: { marginTop: 4, fontWeight: "900", color: "#6B7280", fontSize: 11 },

  footer: { marginTop: 6, color: PL.textSubtle, textAlign: "center", fontSize: 12 },
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
  lockPrimaryBtn: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 999,
    backgroundColor: PL.cta,
    width: "100%",
    maxWidth: 280,
  },
  lockPrimaryBtnText: { color: "#fff", fontWeight: "900", fontSize: 15 },

  modalKbRoot: { flex: 1 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCardWrap: {
    zIndex: 2,
    width: "100%",
    maxHeight: "92%",
    paddingHorizontal: 12,
    paddingBottom: Platform.OS === "ios" ? 20 : 12,
  },

  modalCard: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    backgroundColor: "#fff",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 16,
    maxHeight: "100%",
  },
  modalGrab: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 4,
    backgroundColor: "#E5E7EB",
    marginBottom: 10,
  },
  modalHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 4 },
  modalEyebrow: { fontSize: 11, fontWeight: "900", color: "#6B7280", textTransform: "uppercase", letterSpacing: 0.6 },
  modalTitle: { marginTop: 2, fontSize: 20, fontWeight: "900", color: "#111827" },
  modalSub: { fontSize: 13, lineHeight: 18, color: "#6B7280", fontWeight: "700", marginBottom: 12 },

  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
  },

  modalScroll: { maxHeight: 360 },

  label: { fontSize: 12, fontWeight: "900", color: "#111827" },
  fieldHint: { marginTop: 4, fontSize: 11, color: "#9CA3AF", fontWeight: "700" },
  input: {
    marginTop: 6,
    minHeight: 48,
    borderRadius: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FAFAFA",
    color: "#111827",
    fontWeight: "800",
  },
  inputNote: {
    marginTop: 6,
    minHeight: 88,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FAFAFA",
    color: "#111827",
    fontWeight: "700",
    fontSize: 14,
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
  moneyInput: { flex: 1, height: 48, paddingHorizontal: 10, color: "#111827", fontWeight: "800", fontSize: 18 },

  previewCard: {
    marginTop: 16,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "rgba(17,24,39,0.04)",
    borderWidth: 1,
    borderColor: "rgba(17,24,39,0.08)",
  },
  previewCardLabel: { fontSize: 11, fontWeight: "900", color: "#6B7280", textTransform: "uppercase", letterSpacing: 0.5 },
  previewCardTitle: { marginTop: 6, fontSize: 15, fontWeight: "900", color: "#111827" },
  previewCardPrice: { marginTop: 6, fontSize: 20, fontWeight: "900", color: "#111827" },
  previewCardNote: { marginTop: 8, fontSize: 12, color: "#6B7280", fontWeight: "700", lineHeight: 16 },

  modalFooter: { marginTop: 8, paddingTop: 4, gap: 10, borderTopWidth: 1, borderTopColor: "#F3F4F6" },
  footerHint: { fontSize: 11, color: "#9CA3AF", fontWeight: "700", textAlign: "center", lineHeight: 15 },

  primaryBtn: { width: "100%", paddingVertical: 15, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: PL.cta },
  primaryBtnRow: { flexDirection: "row", gap: 10 },
  primaryBtnDisabled: { backgroundColor: "#9CA3AF" },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "900" },
  secondaryBtn: { width: "100%", paddingVertical: 14, borderRadius: 14, alignItems: "center", backgroundColor: "#F3F4F6" },
  secondaryText: { color: "#111827", fontSize: 16, fontWeight: "800" },

  reviewCardWrap: {
    zIndex: 2,
    width: "100%",
    maxHeight: "92%",
    paddingHorizontal: 12,
    paddingBottom: Platform.OS === "ios" ? 24 : 14,
  },
  reviewCard: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    backgroundColor: "#fff",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 18,
  },

  reviewHero: {
    alignItems: "center",
    paddingVertical: 12,
    marginBottom: 8,
  },
  reviewHeroAmount: { fontSize: 32, fontWeight: "900", color: "#111827" },
  reviewHeroTitle: { marginTop: 8, fontSize: 17, fontWeight: "900", color: "#374151", textAlign: "center", lineHeight: 22 },

  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  authorAvatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(236,72,153,0.12)",
    borderWidth: 1,
    borderColor: "rgba(236,72,153,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  authorAvatarText: { fontSize: 18, fontWeight: "900", color: "#111827" },
  authorLabel: { fontSize: 11, fontWeight: "900", color: "#6B7280", textTransform: "uppercase", letterSpacing: 0.4 },
  authorName: { marginTop: 2, fontSize: 15, fontWeight: "900", color: "#111827" },
  closeBtnRound: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
  },

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
  noteText: { flex: 1, color: "#111827", fontWeight: "700", fontSize: 13, lineHeight: 18 },
  noteEmpty: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "#F9FAFB",
    marginBottom: 12,
  },
  noteEmptyText: { color: "#9CA3AF", fontWeight: "800", fontSize: 12 },

  reviewInfo: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 14,
  },
  reviewInfoWait: {
    backgroundColor: "rgba(245,158,11,0.08)",
    borderColor: "rgba(245,158,11,0.25)",
  },
  reviewInfoAction: {
    backgroundColor: "rgba(17,24,39,0.04)",
    borderColor: "rgba(17,24,39,0.10)",
  },
  reviewInfoText: { flex: 1, color: "#374151", fontWeight: "700", fontSize: 12, lineHeight: 17 },

  reviewActionsCol: { gap: 10 },
  approveBtnWide: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: PL.cta,
  },
  approveTextWide: { color: "#fff", fontWeight: "900", fontSize: 16 },
  rejectBtnWide: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 15,
    borderRadius: 14,
    backgroundColor: "rgba(239,68,68,0.10)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.22)",
  },
  rejectTextWide: { color: "#991B1B", fontWeight: "900", fontSize: 15 },
});