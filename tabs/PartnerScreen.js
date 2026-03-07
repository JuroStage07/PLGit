// screens/PartnerScreen.js
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { View, ScrollView, Text, StyleSheet, Pressable, Alert, Modal, TextInput, TouchableWithoutFeedback, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { auth as firebaseAuth, db, functions } from "../firebaseConfig";
import { httpsCallable } from "firebase/functions";
import { doc, onSnapshot, getDocs, collection, updateDoc, serverTimestamp, setDoc, deleteDoc, deleteField } from "firebase/firestore";
import { SafeAreaView } from "react-native-safe-area-context";

export default function PartnerScreen() {
    const user = firebaseAuth.currentUser;

    const [loading, setLoading] = useState(true);
    const [profile, setProfile] = useState(null);

    // ====== GRUPO ======
    const [isGroupOpen, setIsGroupOpen] = useState(false);
    const [groupName, setGroupName] = useState("");
    const [creatingGroup, setCreatingGroup] = useState(false);

    //Eliminar compañero
    const [breakOpen, setBreakOpen] = useState(false);
    const [breakCountdown, setBreakCountdown] = useState(5);
    const [breaking, setBreaking] = useState(false);

    const hasGroup = !!profile?.groupId && !!profile?.group;

    const openGroupModal = () => {
        setGroupName("");
        setIsGroupOpen(true);
    };

    const closeGroupModal = () => {
        setIsGroupOpen(false);
        setGroupName("");
    };

    const sanitizeGroupName = (t) =>
        String(t || "").trim().replace(/\s+/g, " ");

    // 👇 MODALES (los mismos que ya tienes)
    const [isFindOpen, setIsFindOpen] = useState(false);
    const [incomingOpen, setIncomingOpen] = useState(false);
    const [handle, setHandle] = useState("");
    const [finding, setFinding] = useState(false);
    const [incoming, setIncoming] = useState([]);
    const [loadingIncoming, setLoadingIncoming] = useState(false);

    const glowFor = (c) => {
        if (c === "#3b82f6") return styles.heartGlowSoftBlue;  // masculino
        if (c === "#ec4899") return styles.heartGlowSoftPink;  // femenino
        return styles.heartGlowSoftNeutral;
    };

    const ringFor = (c) => {
        if (c === "#3b82f6") return styles.heartRingBlue;
        if (c === "#ec4899") return styles.heartRingPink;
        return styles.heartRingNeutral;
    };

    // ✅ listener perfil (como ya lo tenías con onSnapshot)
    useEffect(() => {
        if (!user?.uid) {
            setProfile(null);
            setLoading(false);
            return;
        }

        setLoading(true);
        const refDoc = doc(db, "users", user.uid);

        const unsub = onSnapshot(
            refDoc,
            (snap) => {
                setProfile(snap.exists() ? snap.data() : null);
                setLoading(false);
            },
            (e) => {
                setLoading(false);
                Alert.alert("Error", e.message);
            }
        );

        return () => unsub();
    }, [user?.uid]);

    const genero = profile?.genero;
    const nombre = profile?.nombre || user?.displayName || "—";

    const g = String(genero || "").toLowerCase();
    const isFemenino = g === "femenino";
    const isMasculino = g === "masculino";
    const myColor = isFemenino ? "#ec4899" : isMasculino ? "#3b82f6" : "#9CA3AF";

    const partnerUid = profile?.partnerUid || "";
    const hasPartner = !!partnerUid;

    // genero live del partner
    const [partnerGeneroLive, setPartnerGeneroLive] = useState("");
    useEffect(() => {
        if (!hasPartner) {
            setPartnerGeneroLive("");
            return;
        }
        const partnerRef = doc(db, "users", partnerUid);
        const unsub = onSnapshot(partnerRef, (snap) => {
            const data = snap.data() || {};
            setPartnerGeneroLive(String(data.genero || ""));
        });
        return () => unsub();
    }, [hasPartner, partnerUid]);

    const pg = String(partnerGeneroLive || profile?.partnerGenero || "").toLowerCase();
    const partnerColor = pg === "femenino" ? "#ec4899" : pg === "masculino" ? "#3b82f6" : "#9CA3AF";

    const leftColor = hasPartner ? myColor : "#D1D5DB";
    const rightColor = hasPartner ? partnerColor : "#D1D5DB";

    const partnerNombre = profile?.partnerNombre || "";
    const partnerUsuario = profile?.partnerUsuario || "";

    const normalizeHandle = (t) =>
        String(t || "").trim().toLowerCase().replace(/^@+/, "").replace(/\s+/g, "");

    const openFind = () => setIsFindOpen(true);
    const closeFind = () => setIsFindOpen(false);

    const loadIncoming = useCallback(async () => {
        if (!user?.uid) return;
        try {
            setLoadingIncoming(true);
            const snap = await getDocs(collection(db, "users", user.uid, "partnerRequests"));
            const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            setIncoming(list);
        } catch (e) {
            Alert.alert("Error", e.message);
        } finally {
            setLoadingIncoming(false);
        }
    }, [user?.uid]);

    useEffect(() => {
        if (incomingOpen) loadIncoming();
    }, [incomingOpen, loadIncoming]);

    useEffect(() => {
        if (!breakOpen) {
            setBreakCountdown(5);
            return;
        }

        const timer = setInterval(() => {
            setBreakCountdown((v) => {
                if (v <= 1) {
                    clearInterval(timer);
                    return 0;
                }
                return v - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [breakOpen]);

    const breakPartner = async () => {
        if (!user?.uid) return;

        try {
            setBreaking(true);

            const fn = httpsCallable(functions, "breakPartnerRelationship");
            await fn();

            Alert.alert("Relación eliminada", "La relación y el grupo fueron eliminados.");

            setBreakOpen(false);
        } catch (e) {
            Alert.alert("Error", e?.message || "No se pudo romper la relación.");
        } finally {
            setBreaking(false);
        }
    };

    const sendRequestByHandle = async () => {
        if (!user?.uid) return;

        const h = normalizeHandle(handle);
        if (!h) {
            Alert.alert("Dato requerido", "Escribe un usuario, por ejemplo: @maria");
            return;
        }

        try {
            setFinding(true);
            const fn = httpsCallable(functions, "sendPartnerRequest");
            await fn({ toUsuario: h });

            Alert.alert("✅ Solicitud enviada", `Solicitud enviada a @${h}`);
            setHandle("");
            setIsFindOpen(false);
        } catch (e) {
            Alert.alert("Error", e?.message || "No se pudo enviar la solicitud.");
        } finally {
            setFinding(false);
        }
    };

    const rejectRequest = async (req) => {
        try {
            const fn = httpsCallable(functions, "rejectPartnerRequest");
            await fn({ fromUid: req.fromUid });
            await loadIncoming();
        } catch (e) {
            Alert.alert("Error", e?.message || "No se pudo rechazar.");
        }
    };

    const acceptRequest = async (req) => {
        try {
            const fn = httpsCallable(functions, "acceptPartnerRequest");
            await fn({ fromUid: req.fromUid });

            Alert.alert("💖 Emparejados", `Ahora estás conectado con @${req.fromUsuario || ""}`);
            await loadIncoming();
            setIncomingOpen(false);
            setIsFindOpen(false);
        } catch (e) {
            Alert.alert("Error", e?.message || "No se pudo aceptar.");
        }
    };

    const partneredAtText = useMemo(() => {
        const ts = profile?.partneredAt;
        const d = ts?.toDate ? ts.toDate() : null;
        if (!d) return "";
        try {
            return d.toLocaleDateString("es-CR", { day: "2-digit", month: "short", year: "numeric" });
        } catch {
            return d.toLocaleDateString();
        }
    }, [profile?.partneredAt]);

    if (loading) {
        return (
            <View style={styles.loadingWrap}>
                <ActivityIndicator size="large" />
                <Text style={styles.loadingText}>Cargando compañero…</Text>
            </View>
        );
    }

    const createGroup = async () => {
        if (!user?.uid) return;
        if (!hasPartner) {
            Alert.alert("Sin compañero", "Debes estar emparejado para crear un grupo.");
            return;
        }

        const name = sanitizeGroupName(groupName);
        if (!name) {
            Alert.alert("Dato requerido", "Escribe un nombre para el grupo.");
            return;
        }

        try {
            setCreatingGroup(true);

            const groupId = `g_${Date.now()}`;

            const myRef = doc(db, "users", user.uid);
            const partnerRef = doc(db, "users", partnerUid);
            const groupRef = doc(db, "groups", groupId);

            // 1) crear doc del grupo
            await setDoc(groupRef, {
                name,
                members: [user.uid, partnerUid],
                createdAt: serverTimestamp(),
                createdBy: user.uid,
            });

            // 2) guardar puntero en ambos users
            const userPayload = {
                groupId,
                group: name,
                groupCreatedAt: serverTimestamp(),
            };

            await Promise.all([
                updateDoc(myRef, userPayload),
                updateDoc(partnerRef, userPayload),
            ]);

            Alert.alert("✅ Grupo creado", `Grupo "${name}" listo.`);
            closeGroupModal();
        } catch (e) {
            Alert.alert("Error", e?.message || "No se pudo crear el grupo.");
        } finally {
            setCreatingGroup(false);
        }
    };

    const deleteGroup = async () => {
        if (!user?.uid) return;

        const groupId = profile?.groupId;
        if (!groupId) return;

        if (!hasPartner) {
            Alert.alert("Sin compañero", "No se puede eliminar el grupo sin compañero vinculado.");
            return;
        }

        try {
            setCreatingGroup(true); // reutilizamos loading state

            const groupRef = doc(db, "groups", groupId);
            const myRef = doc(db, "users", user.uid);
            const partnerRef = doc(db, "users", partnerUid);

            // 1) borrar doc del grupo
            await deleteDoc(groupRef);

            // 2) limpiar campos en ambos users
            const clearPayload = {
                groupId: deleteField(),
                group: deleteField(),
                groupCreatedAt: deleteField(),
            };

            await Promise.all([
                updateDoc(myRef, clearPayload),
                updateDoc(partnerRef, clearPayload),
            ]);

            Alert.alert("✅ Grupo eliminado", "Se eliminó el grupo y se limpió en ambos perfiles.");
        } catch (e) {
            Alert.alert("Error", e?.message || "No se pudo eliminar el grupo.");
        } finally {
            setCreatingGroup(false);
        }
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#0B1220" }} edges={["left", "right", "bottom"]}>
<ScrollView
    style={styles.container}
    contentContainerStyle={styles.content}
    showsVerticalScrollIndicator={false}
  >
                {/* ====== TU UI ROMÁNTICO AQUÍ ====== */}
                <View style={styles.card}>
                    {/* header + botón buscar */}
                    <View style={styles.partnerHeaderRomantic}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                            <View style={styles.partnerHeartBadge}>
                                <Ionicons name="heart" size={16} color="#ec4899" />
                            </View>

                            <View>
                                <Text style={styles.partnerTitleRomantic}>Compañero</Text>
                                <Text style={styles.partnerSubRomantic}>
                                    {hasPartner ? "Emparejados 💞" : "Aún falta tu media naranja 🍊"}
                                </Text>
                            </View>
                        </View>

                        {!hasPartner && (
                            <Pressable onPress={openFind} style={({ pressed }) => [styles.partnerCta, pressed && { opacity: 0.88 }]}>
                                <Ionicons name="search-outline" size={16} color="#fff" />
                                <Text style={styles.partnerCtaText}>Buscar</Text>
                            </Pressable>
                        )}
                    </View>

                    {/* ====== PAREJA (TÚ ARRIBA / CORAZONES / PARTNER ABAJO) ====== */}
                    <View style={styles.coupleStack}>
                        {/* Tú arriba */}
                        <View style={styles.personPill}>
                            <View style={[styles.personAvatar, { borderColor: myColor }]}>
                                <Text style={styles.personInitial}>
                                    {String(nombre || "T").slice(0, 1).toUpperCase()}
                                </Text>
                            </View>

                            <View style={styles.personTextWrap}>
                                <Text style={styles.personName} numberOfLines={1}>
                                    {nombre || "Tú"}
                                </Text>

                                <View style={styles.personMetaRow}>
                                    <View style={[styles.dot, { backgroundColor: myColor }]} />
                                    <Text style={styles.personMeta} numberOfLines={1}>
                                        Tú 💗
                                    </Text>
                                </View>
                            </View>
                        </View>

                        {/* Corazón arriba (tu color) */}
                        {/* Corazones (con conexión) */}
                        <View style={styles.heartsStack}>
                            <View style={styles.heartConnector} />
                            <View style={styles.heartSparkleLeft} />
                            <View style={styles.heartSparkleRight} />

                            {/* Corazón arriba */}
                            <View style={styles.heartNode}>
                                <View style={ringFor(leftColor)} />
                                <View style={glowFor(leftColor)} />
                                <Ionicons name="heart" size={44} color={leftColor} />
                            </View>

                            <View style={[styles.heartNode, { marginTop: -10 }]}>
                                <View style={ringFor(rightColor)} />
                                <View style={glowFor(rightColor)} />
                                <Ionicons name="heart" size={44} color={rightColor} />
                            </View>


                            {!!partneredAtText && hasPartner && (
                                <Text style={styles.sinceText}>Desde {partneredAtText} ✨</Text>
                            )}
                        </View>

                        {/* Partner abajo */}
                        {hasPartner ? (
                            <View style={styles.personPill}>
                                <View style={[styles.personAvatar, { borderColor: partnerColor }]}>
                                    <Text style={styles.personInitial}>
                                        {String(partnerNombre || "P").slice(0, 1).toUpperCase()}
                                    </Text>
                                </View>

                                <View style={styles.personTextWrap}>
                                    <Text style={styles.personName} numberOfLines={1}>
                                        {partnerNombre || "Compañero"}
                                    </Text>

                                    <View style={styles.personMetaRow}>
                                        <View style={[styles.dot, { backgroundColor: partnerColor }]} />
                                        <Text style={styles.personMeta} numberOfLines={1}>
                                            @{partnerUsuario}
                                        </Text>
                                    </View>
                                </View>
                            </View>
                        ) : (
                            <Pressable
                                onPress={openFind}
                                style={({ pressed }) => [styles.personPill, styles.personPillEmpty, pressed && { opacity: 0.9 }]}
                            >
                                <View style={styles.emptyIcon}>
                                    <Ionicons name="person-add-outline" size={18} color="#6B7280" />
                                </View>

                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <Text style={styles.emptyTitle} numberOfLines={1}>
                                        Disponible ✨
                                    </Text>
                                    <Text style={styles.emptySub} numberOfLines={2}>
                                        Toca para buscar con @usuario
                                    </Text>
                                </View>

                                <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
                            </Pressable>
                        )}
                    </View>

                    {/* nota */}
                    <View style={styles.partnerFooterNote}>
                        {hasPartner && (
                            <Pressable
                                onPress={() => setBreakOpen(true)}
                                style={({ pressed }) => [
                                    styles.breakBtn,
                                    pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] },
                                ]}
                            >
                                <Ionicons name="heart-dislike-outline" size={16} color="#991B1B" />
                                <Text style={styles.breakBtnText}>Romper vínculo</Text>
                            </Pressable>
                        )}
                        <Ionicons name={hasPartner ? "heart-circle-outline" : "sparkles-outline"} size={16} color="#111827" />
                        <Text style={styles.partnerFooterText}>
                            {hasPartner ? (
                                <>Emparejado con <Text style={{ fontWeight: "900" }}>@{partnerUsuario}</Text></>
                            ) : (
                                <>Envía una solicitud con el <Text style={{ fontWeight: "900" }}>@usuario</Text>.</>
                            )}
                        </Text>
                    </View>
                </View>

                {/* ====== CARD GRUPO ====== */}
                <View style={[styles.card, { marginTop: 12 }]}>
                    <View style={styles.partnerHeaderRomantic}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                            <View style={styles.partnerHeartBadge}>
                                <Ionicons name="people" size={16} color="#111827" />
                            </View>

                            <View>
                                <Text style={styles.partnerTitleRomantic}>Grupo</Text>
                                <Text style={styles.partnerSubRomantic}>
                                    {hasGroup ? "Listo para eventos y solicitudes ✨" : "Crea un grupo con tu compañero"}
                                </Text>
                            </View>
                        </View>

                        {!hasGroup && (
                            <Pressable
                                onPress={openGroupModal}
                                style={({ pressed }) => [styles.partnerCta, pressed && { opacity: 0.88 }]}
                                disabled={!hasPartner}
                            >
                                <Ionicons name="add-outline" size={16} color="#fff" />
                                <Text style={styles.partnerCtaText}>Crear</Text>
                            </Pressable>
                        )}
                    </View>

                    {hasGroup ? (
                        <View style={styles.groupInfoBox}>
                            <Pressable
                                style={({ pressed }) => [
                                    styles.groupDangerBtn,
                                    pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] },
                                    creatingGroup && { opacity: 0.6 },
                                ]}
                                disabled={creatingGroup}
                                onPress={() => {
                                    Alert.alert(
                                        "Eliminar grupo",
                                        "¿Seguro? Esto quitará el grupo para ambos usuarios.",
                                        [
                                            { text: "Cancelar", style: "cancel" },
                                            { text: "Eliminar", style: "destructive", onPress: deleteGroup },
                                        ]
                                    );
                                }}
                            >
                                <Ionicons name="trash-outline" size={16} color="#991B1B" />
                                <Text style={styles.groupDangerText}>Eliminar grupo</Text>
                            </Pressable>
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <Text style={styles.groupName} numberOfLines={1}>
                                    {profile?.group}
                                </Text>
                                <Text style={styles.groupMeta} numberOfLines={1}>
                                    ID: {profile?.groupId}
                                </Text>
                            </View>
                            <Ionicons name="checkmark-circle" size={20} color="#16A34A" />
                        </View>

                    ) : (
                        <View style={styles.groupEmptyBox}>
                            <Ionicons name="information-circle-outline" size={18} color="#111827" />
                            <Text style={styles.groupEmptyText}>
                                {hasPartner
                                    ? "Crea un grupo para manejar eventos y solicitudes en conjunto."
                                    : "Debes emparejarte primero para poder crear un grupo."}
                            </Text>
                        </View>
                    )}
                </View>

                {/* ====== MODAL buscar ====== */}
                <Modal visible={isFindOpen} animationType="fade" transparent onRequestClose={closeFind}>
                    <TouchableWithoutFeedback onPress={closeFind}>
                        <View style={styles.modalOverlay}>
                            <TouchableWithoutFeedback>
                                <View style={styles.findCard}>
                                    <View style={styles.findHeader}>
                                        <View style={styles.findBadge}>
                                            <Ionicons name="people-outline" size={16} color="#111827" />
                                        </View>

                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.findTitle}>Buscar compañero</Text>
                                            <Text style={styles.findSub}>Escribe el @usuario para enviar solicitud.</Text>
                                        </View>

                                        <Pressable onPress={closeFind} hitSlop={10} style={styles.closeBtn}>
                                            <Text style={styles.closeBtnText}>✕</Text>
                                        </Pressable>
                                    </View>

                                    <Text style={styles.label}>Usuario</Text>
                                    <View style={styles.handleInputWrap}>
                                        <Text style={styles.handlePrefix}>@</Text>
                                        <TextInput
                                            value={handle}
                                            onChangeText={setHandle}
                                            placeholder="Ej: marialopez"
                                            placeholderTextColor="#9CA3AF"
                                            autoCapitalize="none"
                                            style={styles.handleInput}
                                            returnKeyType="done"
                                            onSubmitEditing={sendRequestByHandle}
                                        />
                                    </View>

                                    <Pressable style={[styles.findOkBtn, finding && { opacity: 0.6 }]} onPress={sendRequestByHandle} disabled={finding}>
                                        <Text style={styles.findOkText}>{finding ? "Enviando..." : "Enviar solicitud"}</Text>
                                    </Pressable>

                                    <Pressable style={styles.modalSecondaryBtn} onPress={() => setIncomingOpen(true)}>
                                        <Text style={styles.modalSecondaryBtnText}>Ver solicitudes recibidas</Text>
                                    </Pressable>

                                    {/* Modal solicitudes */}
                                    <Modal visible={incomingOpen} animationType="fade" transparent onRequestClose={() => setIncomingOpen(false)}>
                                        <TouchableWithoutFeedback onPress={() => setIncomingOpen(false)}>
                                            <View style={styles.modalOverlay}>
                                                <TouchableWithoutFeedback>
                                                    <View style={styles.findCard}>
                                                        <View style={styles.findHeader}>
                                                            <View style={styles.findBadge}>
                                                                <Ionicons name="mail-open-outline" size={16} color="#111827" />
                                                            </View>

                                                            <View style={{ flex: 1 }}>
                                                                <Text style={styles.findTitle}>Solicitudes recibidas</Text>
                                                                <Text style={styles.findSub}>Acepta o rechaza para emparejarte.</Text>
                                                            </View>

                                                            <Pressable onPress={() => setIncomingOpen(false)} hitSlop={10} style={styles.closeBtn}>
                                                                <Text style={styles.closeBtnText}>✕</Text>
                                                            </Pressable>
                                                        </View>

                                                        <View style={styles.findBody}>
                                                            {loadingIncoming ? (
                                                                <View style={[styles.findItem, { borderBottomWidth: 0, justifyContent: "center" }]}>
                                                                    <ActivityIndicator />
                                                                    <Text style={[styles.findText, { marginLeft: 10 }]}>Cargando…</Text>
                                                                </View>
                                                            ) : incoming.length === 0 ? (
                                                                <View style={[styles.findItem, { borderBottomWidth: 0 }]}>
                                                                    <Ionicons name="information-circle-outline" size={18} color="#111827" />
                                                                    <Text style={styles.findText}>No tienes solicitudes por ahora.</Text>
                                                                </View>
                                                            ) : (
                                                                incoming.map((req) => (
                                                                    <View key={req.fromUid} style={styles.findItem}>
                                                                        <Ionicons name="person-outline" size={18} color="#111827" />
                                                                        <View style={{ flex: 1 }}>
                                                                            <Text style={[styles.findText, { opacity: 1 }]} numberOfLines={1}>
                                                                                {req.fromNombre || "Usuario"} • @{req.fromUsuario || ""}
                                                                            </Text>

                                                                            <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                                                                                <Pressable style={[styles.modalPrimaryBtn, { flex: 1, paddingVertical: 10 }]} onPress={() => acceptRequest(req)}>
                                                                                    <Text style={styles.modalPrimaryBtnText}>Aceptar</Text>
                                                                                </Pressable>

                                                                                <Pressable style={[styles.modalSecondaryBtn, { flex: 1, paddingVertical: 10 }]} onPress={() => rejectRequest(req)}>
                                                                                    <Text style={styles.modalSecondaryBtnText}>Rechazar</Text>
                                                                                </Pressable>
                                                                            </View>
                                                                        </View>
                                                                    </View>
                                                                ))
                                                            )}
                                                        </View>

                                                        <Pressable style={styles.findOkBtn} onPress={() => setIncomingOpen(false)}>
                                                            <Text style={styles.findOkText}>Cerrar</Text>
                                                        </Pressable>
                                                    </View>
                                                </TouchableWithoutFeedback>
                                            </View>
                                        </TouchableWithoutFeedback>
                                    </Modal>
                                </View>
                            </TouchableWithoutFeedback>
                        </View>
                    </TouchableWithoutFeedback>
                </Modal>

                {/* ====== MODAL CREAR GRUPO ====== */}
                <Modal visible={isGroupOpen} animationType="fade" transparent onRequestClose={closeGroupModal}>
                    <TouchableWithoutFeedback onPress={closeGroupModal}>
                        <View style={styles.modalOverlay}>
                            <TouchableWithoutFeedback>
                                <View style={styles.findCard}>
                                    <View style={styles.findHeader}>
                                        <View style={styles.findBadge}>
                                            <Ionicons name="people-outline" size={16} color="#111827" />
                                        </View>

                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.findTitle}>Crear grupo</Text>
                                            <Text style={styles.findSub}>Ponle un nombre a su grupo.</Text>
                                        </View>

                                        <Pressable onPress={closeGroupModal} hitSlop={10} style={styles.closeBtn}>
                                            <Text style={styles.closeBtnText}>✕</Text>
                                        </Pressable>
                                    </View>

                                    <Text style={styles.label}>Nombre del grupo</Text>
                                    <View style={styles.handleInputWrap}>
                                        <TextInput
                                            value={groupName}
                                            onChangeText={setGroupName}
                                            placeholder="Ej: Moni & Justin 💖"
                                            placeholderTextColor="#9CA3AF"
                                            style={styles.handleInput}
                                            returnKeyType="done"
                                            onSubmitEditing={createGroup}
                                        />
                                    </View>

                                    <Pressable
                                        style={[styles.findOkBtn, (creatingGroup || !hasPartner) && { opacity: 0.6 }]}
                                        onPress={createGroup}
                                        disabled={creatingGroup || !hasPartner}
                                    >
                                        <Text style={styles.findOkText}>{creatingGroup ? "Creando..." : "Confirmar"}</Text>
                                    </Pressable>

                                    <Pressable style={styles.modalSecondaryBtn} onPress={closeGroupModal}>
                                        <Text style={styles.modalSecondaryBtnText}>Cancelar</Text>
                                    </Pressable>
                                </View>
                            </TouchableWithoutFeedback>
                        </View>
                    </TouchableWithoutFeedback>
                </Modal>

                <Modal visible={breakOpen} animationType="fade" transparent onRequestClose={() => setBreakOpen(false)}>
                    <TouchableWithoutFeedback onPress={() => setBreakOpen(false)}>
                        <View style={styles.modalOverlay}>
                            <TouchableWithoutFeedback>

                                <View style={styles.findCard}>

                                    <View style={styles.findHeader}>
                                        <View style={styles.findBadge}>
                                            <Ionicons name="warning-outline" size={16} color="#991B1B" />
                                        </View>

                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.findTitle}>Romper vínculo</Text>
                                            <Text style={styles.findSub}>
                                                Esta acción eliminará la relación, el grupo, eventos y ahorros para ambos.
                                            </Text>
                                        </View>
                                    </View>

                                    <View style={styles.breakWarningBox}>
                                        <Ionicons name="heart-dislike-outline" size={18} color="#991B1B" />
                                        <Text style={styles.breakWarningText}>
                                            Esta acción es permanente y afectará también a tu compañero.
                                        </Text>
                                    </View>

                                    <View style={styles.breakCountdownBox}>
                                        <Text style={styles.breakCountdownText}>
                                            Podrás confirmar en {breakCountdown}s
                                        </Text>
                                    </View>

                                    <Pressable
                                        disabled={breakCountdown !== 0 || breaking}
                                        style={[
                                            styles.breakConfirmBtn,
                                            (breakCountdown !== 0 || breaking) && { opacity: 0.6 }
                                        ]}
                                        onPress={breakPartner}
                                    >
                                        <Text style={styles.breakConfirmText}>
                                            {breaking ? "Eliminando..." : "Confirmar ruptura"}
                                        </Text>
                                    </Pressable>

                                    <Pressable style={styles.modalSecondaryBtn} onPress={() => setBreakOpen(false)}>
                                        <Text style={styles.modalSecondaryBtnText}>Cancelar</Text>
                                    </Pressable>

                                </View>

                            </TouchableWithoutFeedback>
                        </View>
                    </TouchableWithoutFeedback>
                </Modal>

            </ScrollView>
        </SafeAreaView>
    );
}

function HalfHeart({ side, color }) {
    const isLeft = side === "left";
    return (
        <View style={styles.heartBox}>
            <View style={[styles.heartCrop, isLeft ? styles.heartCropLeft : styles.heartCropRight]}>
                <Ionicons name="heart-sharp" size={56} color={color} />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#0B1220", padding: 16 },
    loadingWrap: { flex: 1, backgroundColor: "#0B1220", alignItems: "center", justifyContent: "center", padding: 16 },
    loadingText: { marginTop: 10, color: "rgba(255,255,255,0.75)" },

    card: {
        backgroundColor: "rgba(255,255,255,0.97)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
        borderRadius: 18,
        padding: 16,
        shadowColor: "#000",
        shadowOpacity: 0.16,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 10 },
        elevation: 5,
    },

    partnerHeaderRomantic: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
    partnerHeartBadge: {
        width: 34, height: 34, borderRadius: 12,
        backgroundColor: "rgba(236,72,153,0.12)",
        borderWidth: 1, borderColor: "rgba(236,72,153,0.22)",
        alignItems: "center", justifyContent: "center",
    },
    partnerTitleRomantic: { fontSize: 14, fontWeight: "900", color: "#111827" },
    partnerSubRomantic: { marginTop: 2, fontSize: 12, color: "#6B7280", fontWeight: "800" },

    partnerCta: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 999, backgroundColor: "#111827" },
    partnerCtaText: { color: "#fff", fontWeight: "900" },

    personInitial: { fontWeight: "900", color: "#111827", fontSize: 16 },
    personName: { fontWeight: "900", color: "#111827", fontSize: 13 },
    personMetaRow: { marginTop: 6, flexDirection: "row", alignItems: "center", gap: 8 },
    dot: { width: 8, height: 8, borderRadius: 999 },
    personMeta: { fontWeight: "900", color: "#6B7280", fontSize: 12 },

    heartRing: {
        position: "absolute", width: 92, height: 92, borderRadius: 999,
        backgroundColor: "rgba(236,72,153,0.08)",
        borderWidth: 1, borderColor: "rgba(236,72,153,0.20)",
    },
    heartGlowSoft: { position: "absolute", width: 120, height: 120, borderRadius: 999, backgroundColor: "rgba(236,72,153,0.10)" },
    heartHalfWrap: {
        width: 86, height: 78, borderRadius: 18,
        backgroundColor: "rgba(255,255,255,0.96)",
        borderWidth: 1, borderColor: "rgba(17,24,39,0.08)",
        alignItems: "center", justifyContent: "center", paddingTop: 6,
    },

    heartBox: { width: 68, height: 60, alignItems: "center", justifyContent: "center" },
    heartCrop: { width: 68, height: 60, overflow: "hidden", alignItems: "center", justifyContent: "center" },
    heartCropLeft: { alignItems: "flex-start" },
    heartCropRight: { alignItems: "flex-end" },

    emptyPartner: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 6 },
    emptyIcon: { width: 42, height: 42, borderRadius: 16, backgroundColor: "rgba(17,24,39,0.04)", borderWidth: 1, borderColor: "rgba(17,24,39,0.10)", alignItems: "center", justifyContent: "center" },
    emptyTitle: { marginTop: 8, fontWeight: "900", color: "#111827", fontSize: 13 },
    emptySub: { marginTop: 2, fontWeight: "800", color: "#6B7280", fontSize: 12 },

    partnerFooterNote: {
        marginTop: 12, flexDirection: "row", alignItems: "center", gap: 10,
        paddingVertical: 10, paddingHorizontal: 12, borderRadius: 16,
        backgroundColor: "rgba(236,72,153,0.06)",
        borderWidth: 1, borderColor: "rgba(236,72,153,0.16)",
    },
    partnerFooterText: { flex: 1, color: "#111827", fontWeight: "800", opacity: 0.9, fontSize: 12, lineHeight: 16 },

    // modal styles (reusa tus estilos si quieres)
    modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.60)", justifyContent: "center", padding: 18 },
    findCard: { width: "100%", maxWidth: 520, alignSelf: "center", backgroundColor: "#fff", borderRadius: 18, padding: 16 },
    findHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
    findBadge: { width: 34, height: 34, borderRadius: 12, backgroundColor: "rgba(236,72,153,0.12)", borderWidth: 1, borderColor: "rgba(236,72,153,0.22)", alignItems: "center", justifyContent: "center" },
    findTitle: { fontSize: 16, fontWeight: "900", color: "#111827" },
    findSub: { marginTop: 2, fontSize: 12, color: "#6B7280", fontWeight: "700" },
    closeBtn: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "#F3F4F6" },
    closeBtnText: { fontSize: 16, fontWeight: "900", color: "#111827" },
    label: { fontSize: 12, fontWeight: "900", color: "#111827" },

    handleInputWrap: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#E5E7EB", backgroundColor: "#FAFAFA", borderRadius: 14, overflow: "hidden", marginTop: 8 },
    handlePrefix: { paddingHorizontal: 14, fontWeight: "900", color: "#111827", opacity: 0.6, fontSize: 16 },
    handleInput: { flex: 1, height: 48, paddingHorizontal: 10, color: "#111827", fontWeight: "800", fontSize: 16 },

    findOkBtn: { marginTop: 12, backgroundColor: "#111827", borderRadius: 14, paddingVertical: 12, alignItems: "center" },
    findOkText: { color: "#fff", fontWeight: "900", fontSize: 15 },

    modalPrimaryBtn: { width: "100%", paddingVertical: 14, borderRadius: 14, alignItems: "center", backgroundColor: "#111827" },
    modalPrimaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "900" },
    modalSecondaryBtn: { width: "100%", paddingVertical: 14, borderRadius: 14, alignItems: "center", backgroundColor: "#F3F4F6", marginTop: 10 },
    modalSecondaryBtnText: { color: "#111827", fontSize: 16, fontWeight: "800" },

    findBody: { marginTop: 10, borderRadius: 16, borderWidth: 1, borderColor: "#E5E7EB", overflow: "hidden", backgroundColor: "#FAFAFA" },
    findItem: { flexDirection: "row", gap: 10, paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#EEF2F7" },
    findText: { flex: 1, color: "#111827", fontWeight: "800", opacity: 0.85 },

    // ====== NUEVO LAYOUT PRO ROMÁNTICO ======
    personTextWrap: {
        flex: 1,
        minWidth: 0, // ✅ permite ellipsis / numberOfLines correcto
    },

    heartRing: {
        position: "absolute",
        width: 92,
        height: 92,
        borderRadius: 999,
        backgroundColor: "rgba(236,72,153,0.10)",
        borderWidth: 1,
        borderColor: "rgba(236,72,153,0.22)",
    },

    // Estado vacío más pro (con flecha y texto completo)
    emptyPartnerPro: {
        flex: 1,
        minWidth: 0,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },

    // ====== PAREJA VERTICAL PRO + ROMÁNTICO ======
    coupleStack: {
        marginTop: 8,
        alignItems: "center",
        gap: 10,
    },

    personPill: {
        width: "100%",
        minWidth: 0,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        padding: 12,
        borderRadius: 18,
        backgroundColor: "#fff",
        borderWidth: 1,
        borderColor: "rgba(17,24,39,0.10)",
        shadowColor: "#000",
        shadowOpacity: 0.08,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 10 },
        elevation: 2,
    },

    personPillEmpty: {
        justifyContent: "space-between",
    },

    personAvatar: {
        width: 44,
        height: 44,
        borderRadius: 16,
        backgroundColor: "rgba(17,24,39,0.04)",
        borderWidth: 2,
        alignItems: "center",
        justifyContent: "center",
    },

    personInitial: {
        fontWeight: "900",
        color: "#111827",
        fontSize: 16,
    },

    personTextWrap: {
        flex: 1,
        minWidth: 0,     // ✅ clave para que no se corte raro
    },

    personName: {
        fontWeight: "900",
        color: "#111827",
        fontSize: 13,
        flexShrink: 1,   // ✅ permite que el texto se ajuste
    },

    personMetaRow: {
        marginTop: 6,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },

    dot: { width: 8, height: 8, borderRadius: 999 },

    personMeta: {
        fontWeight: "900",
        color: "#6B7280",
        fontSize: 12,
        flexShrink: 1,
    },

    heartNode: {
        width: 98,
        height: 98,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
    },

    heartRingTop: {
        position: "absolute",
        width: 98,
        height: 98,
        borderRadius: 999,
        backgroundColor: "rgba(236,72,153,0.10)",
        borderWidth: 1,
        borderColor: "rgba(236,72,153,0.22)",
    },

    heartRingBottom: {
        position: "absolute",
        width: 98,
        height: 98,
        borderRadius: 999,
        backgroundColor: "rgba(59,130,246,0.08)",
        borderWidth: 1,
        borderColor: "rgba(59,130,246,0.20)",
    },

    heartGlowSoft: {
        position: "absolute",
        width: 130,
        height: 130,
        borderRadius: 999,
        backgroundColor: "rgba(236,72,153,0.08)",
    },

    emptyIcon: {
        width: 44,
        height: 44,
        borderRadius: 16,
        backgroundColor: "rgba(17,24,39,0.04)",
        borderWidth: 1,
        borderColor: "rgba(17,24,39,0.10)",
        alignItems: "center",
        justifyContent: "center",
    },

    emptyTitle: { fontWeight: "900", color: "#111827", fontSize: 13 },

    emptySub: {
        marginTop: 2,
        fontWeight: "800",
        color: "#6B7280",
        fontSize: 12,
        lineHeight: 16,
    },

    // --- hearts stack ---
    heartsStack: {
        alignItems: "center",
        justifyContent: "center",
        marginVertical: 6,
    },

    heartConnector: {
        position: "absolute",
        width: 2,
        top: 38,
        bottom: 38,
        borderRadius: 99,
        backgroundColor: "rgba(17,24,39,0.10)",
    },

    heartSparkleLeft: {
        position: "absolute",
        left: "42%",
        top: 28,
        width: 8,
        height: 8,
        borderRadius: 99,
        backgroundColor: "rgba(236,72,153,0.35)",
    },

    heartSparkleRight: {
        position: "absolute",
        right: "42%",
        bottom: 28,
        width: 8,
        height: 8,
        borderRadius: 99,
        backgroundColor: "rgba(59,130,246,0.30)",
    },

    heartGlowSoftBlue: {
        position: "absolute",
        width: 132,
        height: 132,
        borderRadius: 999,
        backgroundColor: "rgba(59,130,246,0.08)",
    },

    sinceText: {
        marginTop: 8,
        fontSize: 12,
        fontWeight: "900",
        color: "#6B7280",
    },

    heartRingPink: {
        position: "absolute",
        width: 98,
        height: 98,
        borderRadius: 999,
        backgroundColor: "rgba(236,72,153,0.10)",
        borderWidth: 1,
        borderColor: "rgba(236,72,153,0.22)",
    },

    heartRingNeutral: {
        position: "absolute",
        width: 98,
        height: 98,
        borderRadius: 999,
        backgroundColor: "rgba(17,24,39,0.06)",
        borderWidth: 1,
        borderColor: "rgba(17,24,39,0.14)",
    },

    heartGlowSoftPink: {
        position: "absolute",
        width: 132,
        height: 132,
        borderRadius: 999,
        backgroundColor: "rgba(236,72,153,0.09)",
    },
    heartGlowSoftBlue: {
        position: "absolute",
        width: 132,
        height: 132,
        borderRadius: 999,
        backgroundColor: "rgba(59,130,246,0.09)",
    },
    heartGlowSoftNeutral: {
        position: "absolute",
        width: 132,
        height: 132,
        borderRadius: 999,
        backgroundColor: "rgba(17,24,39,0.06)",
    },

    groupInfoBox: {
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
    groupName: { fontWeight: "900", color: "#111827", fontSize: 14 },
    groupMeta: { marginTop: 4, fontWeight: "800", color: "#6B7280", fontSize: 12 },

    groupEmptyBox: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 10,
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderRadius: 16,
        backgroundColor: "rgba(236,72,153,0.06)",
        borderWidth: 1,
        borderColor: "rgba(236,72,153,0.14)",
    },
    groupEmptyText: { flex: 1, color: "#111827", fontWeight: "800", opacity: 0.85, fontSize: 12, lineHeight: 16 },
    groupDangerBtn: {
        marginTop: 10,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        paddingVertical: 12,
        borderRadius: 14,
        backgroundColor: "rgba(239,68,68,0.10)",
        borderWidth: 1,
        borderColor: "rgba(239,68,68,0.22)",
    },
    groupDangerText: { color: "#991B1B", fontWeight: "900" },

    breakBtn: {
        marginTop: 10,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        paddingVertical: 12,
        borderRadius: 14,
        backgroundColor: "rgba(239,68,68,0.10)",
        borderWidth: 1,
        borderColor: "rgba(239,68,68,0.22)"
    },

    breakBtnText: {
        color: "#991B1B",
        fontWeight: "900"
    },

    breakWarningBox: {
        flexDirection: "row",
        gap: 10,
        alignItems: "flex-start",
        padding: 12,
        borderRadius: 14,
        backgroundColor: "rgba(239,68,68,0.06)",
        borderWidth: 1,
        borderColor: "rgba(239,68,68,0.18)",
        marginTop: 10
    },

    breakWarningText: {
        flex: 1,
        color: "#111827",
        fontWeight: "800",
        fontSize: 12,
        lineHeight: 16
    },

    breakCountdownBox: {
        marginTop: 10,
        alignItems: "center"
    },

    breakCountdownText: {
        fontWeight: "900",
        color: "#991B1B"
    },

    breakConfirmBtn: {
        marginTop: 12,
        backgroundColor: "#991B1B",
        borderRadius: 14,
        paddingVertical: 12,
        alignItems: "center"
    },

    breakConfirmText: {
        color: "#fff",
        fontWeight: "900"
    },
});
