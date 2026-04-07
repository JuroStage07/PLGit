// screens/AhorrosScreen.js
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
    View,
    Text,
    StyleSheet,
    Pressable,
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
import { PL } from "../theme/plTheme";
import { useDialog } from "../context/DialogContext";

export default function AhorrosScreen({ navigation }) {
    const { info, confirm } = useDialog();
    const user = firebaseAuth.currentUser;

    const [profile, setProfile] = useState(null);
    const [loadingProfile, setLoadingProfile] = useState(true);

    const [items, setItems] = useState([]);
    const [loadingItems, setLoadingItems] = useState(true);

    // modal crear
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [savingName, setSavingName] = useState("");
    const [amountInput, setAmountInput] = useState("");
    const [creating, setCreating] = useState(false);

    // modal aprobar
    const [isReviewOpen, setIsReviewOpen] = useState(false);
    const [selected, setSelected] = useState(null); // saving doc
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

    // ---- savings live ----
    useEffect(() => {
        if (!hasGroup) {
            setItems([]);
            setLoadingItems(false);
            return;
        }

        setLoadingItems(true);
        const colRef = collection(db, "groups", groupId, "savings");
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
        return approved.reduce((acc, x) => acc + (typeof x.amount === "number" ? x.amount : 0), 0);
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
        setSavingName("");
        setAmountInput("");
        setIsCreateOpen(true);
    };
    const closeCreate = () => {
        setIsCreateOpen(false);
        Keyboard.dismiss();
    };

    // ---- review modal ----
    const openReview = (docSaving) => {
        setSelected(docSaving);
        setIsReviewOpen(true);
    };
    const closeReview = () => {
        setIsReviewOpen(false);
        setSelected(null);
    };

    const createSaving = useCallback(async () => {
        if (!user?.uid) return;

        if (!hasGroup) {
            info("Sin grupo", "Primero crea un grupo en la pestaña Partner.");
            return;
        }

        const name = String(savingName || "").trim();
        const amount = Number(sanitizeAmount(amountInput));

        if (!name) {
            info("Dato requerido", "Escribe el nombre del ahorro.");
            return;
        }
        if (!Number.isFinite(amount) || amount <= 0) {
            info("Monto inválido", "Ingresa un monto mayor a 0.");
            return;
        }

        try {
            setCreating(true);
            const colRef = collection(db, "groups", groupId, "savings");

            await addDoc(colRef, {
                name,
                amount,
                accepted: false,           // ✅ queda pendiente
                createdAt: serverTimestamp(),
                createdBy: user.uid,
                createdByName: profile?.nombre || user?.displayName || "",
            });

            info("✅ Enviado", "Ahorro creado y enviado para aprobación.");
            closeCreate();
        } catch (e) {
            info("Error", e?.message || "No se pudo crear.");
        } finally {
            setCreating(false);
        }
    }, [user?.uid, hasGroup, groupId, savingName, amountInput, profile?.nombre, user?.displayName]);

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
            const ref = doc(db, "groups", groupId, "savings", selected.id);

            await updateDoc(ref, {
                accepted: true,
                acceptedAt: serverTimestamp(),
                acceptedBy: user?.uid || "",
            });

            info("✅ Aprobado", "Ahorro aprobado.");
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
            const ref = doc(db, "groups", groupId, "savings", selected.id);

            // simple: borramos el pendiente
            await deleteDoc(ref);

            info("Listo", "Ahorro rechazado y eliminado.");
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

                    <Text style={styles.lockTitle}>Ahorros bloqueados</Text>
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
        <SafeAreaView style={{ flex: 1, backgroundColor: "transparent" }} edges={["left", "right"]}>

            <ScrollView style={styles.container} contentContainerStyle={styles.content}>
                {/* ===== DASHBOARD ===== */}
                <View style={styles.headerCard}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                        <View style={styles.iconBadge}>
                            <Ionicons name="wallet-outline" size={18} color="#111827" />
                        </View>

                        <View style={{ flex: 1 }}>
                            <Text style={styles.headerTitle}>Ahorros del grupo</Text>
                            <Text style={styles.headerSub}>
                                Pendientes requieren aprobación del otro.
                            </Text>
                        </View>

                        <Pressable
                            onPress={openCreate}
                            style={({ pressed }) => [styles.ctaBtn, pressed && styles.pressed]}
                        >
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
                            <Text style={styles.kpiLabel}>Aprobados</Text>
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
                            <Text style={styles.emptyText}>No hay pendientes por ahora.</Text>
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
                                        style={({ pressed }) => [
                                            styles.itemRow,
                                            pressed && styles.pressed,
                                            isMine && { opacity: 0.85 },
                                        ]}
                                    >
                                        <View style={styles.itemLeft}>
                                            <View style={styles.itemDotPending} />
                                            <View style={{ flex: 1, minWidth: 0 }}>
                                                <Text style={styles.itemName} numberOfLines={1}>
                                                    {it.name || "Ahorro"}
                                                </Text>
                                                <Text style={styles.itemMeta} numberOfLines={1}>
                                                    {subtitle}
                                                </Text>
                                            </View>
                                        </View>

                                        <View style={{ alignItems: "flex-end" }}>
                                            <Text style={styles.itemAmount}>{fmtCRC(it.amount || 0)}</Text>
                                            <Text style={styles.itemMini} numberOfLines={1}>
                                                {isMine ? "Tú lo creaste" : "Lo creó tu compañero"}
                                            </Text>
                                        </View>
                                    </Pressable>
                                );
                            })}
                        </View>
                    )}
                </View>

                {/* ===== APROBADOS ===== */}
                <View style={styles.card}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.cardTitle}>Aprobados</Text>
                        <View style={styles.pillOk}>
                            <Ionicons name="checkmark-outline" size={14} color="#16A34A" />
                            <Text style={[styles.pillText, { color: "#16A34A" }]}>Aceptados</Text>
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
                            <Text style={styles.emptyText}>Aún no hay ahorros aprobados.</Text>
                        </View>
                    ) : (
                        <View style={{ gap: 10, marginTop: 8 }}>
                            {approved.map((it) => (
                                <View key={it.id} style={styles.itemRow}>
                                    <View style={styles.itemLeft}>
                                        <View style={styles.itemDotOk} />
                                        <View style={{ flex: 1, minWidth: 0 }}>
                                            <Text style={styles.itemName} numberOfLines={1}>
                                                {it.name || "Ahorro"}
                                            </Text>
                                            <Text style={styles.itemMeta} numberOfLines={1}>
                                                Aprobado ✅
                                            </Text>
                                        </View>
                                    </View>

                                    <Text style={styles.itemAmount}>{fmtCRC(it.amount || 0)}</Text>
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
                                            <Text style={styles.modalTitle}>Nuevo ahorro</Text>
                                            <Pressable onPress={closeCreate} hitSlop={10} style={styles.closeBtn}>
                                                <Text style={styles.closeBtnText}>✕</Text>
                                            </Pressable>
                                        </View>

                                        <Text style={styles.modalSub}>
                                            Se enviará como pendiente para que tu compañero lo apruebe.
                                        </Text>

                                        <Text style={styles.label}>Nombre</Text>
                                        <TextInput
                                            value={savingName}
                                            onChangeText={setSavingName}
                                            placeholder="Ej: Viaje, Emergencias, Regalo…"
                                            placeholderTextColor="#9CA3AF"
                                            style={styles.input}
                                            returnKeyType="next"
                                        />

                                        <Text style={[styles.label, { marginTop: 10 }]}>Monto</Text>
                                        <View style={styles.moneyWrap}>
                                            <Text style={styles.moneyPrefix}>₡</Text>
                                            <TextInput
                                                value={amountInput}
                                                onChangeText={(t) => setAmountInput(sanitizeAmount(t))}
                                                placeholder="Ej: 25000"
                                                placeholderTextColor="#9CA3AF"
                                                keyboardType="number-pad"
                                                style={styles.moneyInput}
                                                returnKeyType="done"
                                                onSubmitEditing={createSaving}
                                            />
                                        </View>

                                        <Text style={styles.preview}>
                                            Monto: <Text style={styles.previewStrong}>{fmtCRC(Number(sanitizeAmount(amountInput)) || 0)}</Text>
                                        </Text>

                                        <View style={{ marginTop: 14, gap: 10 }}>
                                            <Pressable
                                                style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed, creating && { opacity: 0.6 }]}
                                                onPress={createSaving}
                                                disabled={creating}
                                            >
                                                <Text style={styles.primaryText}>{creating ? "Enviando..." : "Enviar a aprobación"}</Text>
                                            </Pressable>

                                            <Pressable style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]} onPress={closeCreate} disabled={creating}>
                                                <Text style={styles.secondaryText}>Cancelar</Text>
                                            </Pressable>
                                        </View>
                                    </View>
                                </TouchableWithoutFeedback>
                            </KeyboardAvoidingView>
                        </View>
                    </TouchableWithoutFeedback>
                </Modal>

                {/* ===== MODAL REVISAR (check / x) ===== */}
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
                                                {selected?.name || "Ahorro"}
                                            </Text>
                                            <Text style={styles.reviewSub} numberOfLines={1}>
                                                {fmtCRC(selected?.amount || 0)}
                                            </Text>
                                        </View>

                                        <Pressable onPress={closeReview} hitSlop={10} style={styles.closeBtn}>
                                            <Text style={styles.closeBtnText}>✕</Text>
                                        </Pressable>
                                    </View>

                                    <View style={styles.reviewInfo}>
                                        <Ionicons name="information-circle-outline" size={18} color="#111827" />
                                        <Text style={styles.reviewInfoText}>
                                            {selected?.createdBy === user?.uid
                                                ? "Este ahorro lo creaste tú. Quedará aprobado cuando tu compañero lo acepte."
                                                : "¿Quieres aprobar este ahorro? Puedes aceptarlo o rechazarlo."}
                                        </Text>
                                    </View>

                                    {canReviewSelected ? (
                                        <View style={styles.reviewActions}>
                                            <Pressable
                                                onPress={approveSelected}
                                                disabled={reviewing}
                                                style={({ pressed }) => [
                                                    styles.approveBtn,
                                                    pressed && styles.pressed,
                                                    reviewing && { opacity: 0.6 },
                                                ]}
                                            >
                                                <Ionicons name="checkmark" size={18} color="#fff" />
                                                <Text style={styles.approveText}>Aprobar</Text>
                                            </Pressable>

                                            <Pressable
                                                onPress={() => {
                                                    confirm("Rechazar", "¿Seguro que deseas rechazar este ahorro?", {
                                                        confirmText: "Rechazar",
                                                        cancelText: "Cancelar",
                                                        destructive: true,
                                                        onConfirm: rejectSelected,
                                                    });
                                                }}
                                                disabled={reviewing}
                                                style={({ pressed }) => [
                                                    styles.rejectBtn,
                                                    pressed && styles.pressed,
                                                    reviewing && { opacity: 0.6 },
                                                ]}
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
    headerSub: { marginTop: 2, color: PL.textMuted, fontWeight: "700", fontSize: 12 },

    kpiRow: { marginTop: 12, flexDirection: "row", gap: 10 },
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

    ctaBtn: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 999,
        backgroundColor: PL.cta,
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
    bigPlusBtn: {
        marginTop: 16,
        width: 74,
        height: 74,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: PL.cta,
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

    moneyWrap: { marginTop: 6, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#E5E7EB", backgroundColor: "#FAFAFA", borderRadius: 14, overflow: "hidden" },
    moneyPrefix: { paddingHorizontal: 14, fontWeight: "900", color: "#111827", opacity: 0.9, fontSize: 16 },
    moneyInput: { flex: 1, height: 48, paddingHorizontal: 10, color: "#111827", fontWeight: "800", fontSize: 16 },

    preview: { marginTop: 8, fontSize: 12, color: "#6B7280" },
    previewStrong: { color: "#111827", fontWeight: "900" },

    primaryBtn: { width: "100%", paddingVertical: 14, borderRadius: 14, alignItems: "center", backgroundColor: PL.cta },
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
        backgroundColor: PL.cta,
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