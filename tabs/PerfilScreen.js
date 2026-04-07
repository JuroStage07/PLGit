import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
    View,
    Text,
    StyleSheet,
    Pressable,
    ActivityIndicator,
    ScrollView,
    Modal,
    TextInput,
    KeyboardAvoidingView,
    Platform,
    TouchableWithoutFeedback,
    Keyboard,
    Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import {
    doc,
    collection,
    updateDoc,
    increment,
    onSnapshot,
    getDoc,
    serverTimestamp,
    writeBatch,
} from "firebase/firestore";
import { useNavigation } from "@react-navigation/native";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth as firebaseAuth, db, storage, functions } from "../firebaseConfig";
import { SafeAreaView } from "react-native-safe-area-context";
import { PL } from "../theme/plTheme";
import { useDialog } from "../context/DialogContext";

export default function PerfilScreen() {
    const { info, confirm } = useDialog();
    const navigation = useNavigation();

    const user = firebaseAuth.currentUser;

    const [loading, setLoading] = useState(true);
    const [profile, setProfile] = useState(null);

    //Saldo compartido
    const [partnerProfile, setPartnerProfile] = useState(null);

    // Modal salario
    const [isSalaryOpen, setIsSalaryOpen] = useState(false);
    const [salaryInput, setSalaryInput] = useState("");
    /** Monto que va a Mi Saldo (config del grupo), para vista previa del modal */
    const [salaryModalMiStep, setSalaryModalMiStep] = useState(null);

    // Modal foto
    const [isPhotoOpen, setIsPhotoOpen] = useState(false);
    const [uploadingPhoto, setUploadingPhoto] = useState(false);

    const photoURL = profile?.photoURL || null;
    const email = profile?.email || user?.email || "";

    const createdAtText = useMemo(() => {
        const ts = profile?.createdAt;
        const date = ts?.toDate ? ts.toDate() : null;
        if (!date) return "—";
        return date.toLocaleDateString();
    }, [profile?.createdAt]);

    const saldoNumber = useMemo(() => {
        const v = profile?.saldo;
        if (typeof v === "number") return v;
        if (typeof v === "string") {
            const n = Number(String(v).replace(/[^\d.]/g, ""));
            return Number.isFinite(n) ? n : 0;
        }
        return 0;
    }, [profile?.saldo]);

    const saldoText = useMemo(() => {
        try {
            return new Intl.NumberFormat("es-CR", {
                style: "currency",
                currency: "CRC",
                maximumFractionDigits: 0,
            }).format(saldoNumber);
        } catch {
            return `₡ ${Math.round(saldoNumber).toLocaleString("es-CR")}`;
        }
    }, [saldoNumber]);

    //crea el saldo del partner + compartido
    const partnerSaldoNumber = useMemo(() => {
        const v = partnerProfile?.saldo;
        if (typeof v === "number") return v;
        if (typeof v === "string") {
            const n = Number(String(v).replace(/[^\d.]/g, ""));
            return Number.isFinite(n) ? n : 0;
        }
        return 0;
    }, [partnerProfile?.saldo]);

    const sharedSaldoNumber = useMemo(() => {
        return (saldoNumber || 0) + (partnerSaldoNumber || 0);
    }, [saldoNumber, partnerSaldoNumber]);

    const sharedSaldoText = useMemo(() => {
        try {
            return new Intl.NumberFormat("es-CR", {
                style: "currency",
                currency: "CRC",
                maximumFractionDigits: 0,
            }).format(sharedSaldoNumber);
        } catch {
            return `₡ ${Math.round(sharedSaldoNumber).toLocaleString("es-CR")}`;
        }
    }, [sharedSaldoNumber]);

    const hasPartner = !!profile?.partnerUid;

    // ✅ cargar perfil
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
                info("Error", e.message);
            }
        );

        return () => unsub();
    }, [user?.uid]);

    //Listener de compañero
    useEffect(() => {
        const partnerUid = profile?.partnerUid;

        if (!partnerUid) {
            setPartnerProfile(null);
            return;
        }

        const partnerRef = doc(db, "users", partnerUid);

        const unsub = onSnapshot(
            partnerRef,
            (snap) => setPartnerProfile(snap.exists() ? snap.data() : null),
            () => setPartnerProfile(null)
        );

        return () => unsub();
    }, [profile?.partnerUid]);

    useEffect(() => {
        if (!isSalaryOpen || !profile?.groupId) {
            setSalaryModalMiStep(null);
            return;
        }
        let cancelled = false;
        (async () => {
            const cfgRef = doc(db, "groups", profile.groupId, "miSaldoConfig", "main");
            const snap = await getDoc(cfgRef);
            if (cancelled) return;
            let v = 10000;
            if (snap.exists()) {
                const val = snap.data()?.value;
                if (typeof val === "number" && val > 0) v = val;
            }
            setSalaryModalMiStep(v);
        })();
        return () => {
            cancelled = true;
        };
    }, [isSalaryOpen, profile?.groupId]);

    // ---------- SALARIO (SUMA) ----------
    const openSalaryModal = () => {
        setSalaryInput("");
        setIsSalaryOpen(true);
    };

    const closeSalaryModal = () => {
        setIsSalaryOpen(false);
        Keyboard.dismiss();
    };

    const sanitizeNumeric = (text) => String(text || "").replace(/[^\d]/g, "");

    const saveSalary = async () => {
        if (!user?.uid) return;

        const cleaned = sanitizeNumeric(salaryInput);
        if (!cleaned) {
            info("Dato requerido", "Ingresa una cantidad.");
            return;
        }

        const amount = Number(cleaned);
        if (!Number.isFinite(amount) || amount <= 0) {
            info("Cantidad inválida", "Ingresa un número mayor a 0.");
            return;
        }

        try {
            const refDoc = doc(db, "users", user.uid);
            const groupId = profile?.groupId || "";

            let miSaldoStep = 0;
            if (groupId) {
                const cfgRef = doc(db, "groups", groupId, "miSaldoConfig", "main");
                const cfgSnap = await getDoc(cfgRef);
                if (cfgSnap.exists()) {
                    const v = cfgSnap.data()?.value;
                    miSaldoStep =
                        typeof v === "number" && v > 0 ? v : 10000;
                } else {
                    miSaldoStep = 10000;
                }
            }

            if (groupId && miSaldoStep > 0 && amount < miSaldoStep) {
                info(
                    "Monto insuficiente",
                    `El ingreso debe ser al menos ${new Intl.NumberFormat("es-CR", {
                        style: "currency",
                        currency: "CRC",
                        maximumFractionDigits: 0,
                    }).format(miSaldoStep)} para apartar el ahorro a Mi Saldo.`
                );
                return;
            }

            const newSaldo =
                (saldoNumber || 0) +
                amount -
                (groupId && miSaldoStep > 0 ? miSaldoStep : 0);

            const parseSaldoField = (v) => {
                if (typeof v === "number") return v;
                if (typeof v === "string") {
                    const n = Number(String(v).replace(/[^\d.]/g, ""));
                    return Number.isFinite(n) ? n : 0;
                }
                return 0;
            };

            let partnerSaldo = 0;
            if (profile?.partnerUid) {
                const pSnap = await getDoc(doc(db, "users", profile.partnerUid));
                if (pSnap.exists()) {
                    partnerSaldo = parseSaldoField(pSnap.data()?.saldo);
                }
            }
            const saldoCompartidoAfter = newSaldo + partnerSaldo;

            const payload =
                groupId && miSaldoStep > 0
                    ? { saldo: increment(amount - miSaldoStep), miSaldo: increment(miSaldoStep) }
                    : { saldo: increment(amount) };

            const batch = writeBatch(db);
            batch.update(refDoc, {
                ...payload,
                salaryIngresoAt: serverTimestamp(),
            });
            if (groupId && miSaldoStep > 0) {
                const logRef = doc(collection(db, "users", user.uid, "miSaldoLogs"));
                batch.set(logRef, {
                    type: "salario_perfil",
                    actorUid: user.uid,
                    actorGenero: profile?.genero || "",
                    salaryAdded: amount,
                    saldoCompartidoAfter,
                    saldoAfter: newSaldo,
                    miSaldoAdded: miSaldoStep,
                    createdAt: serverTimestamp(),
                });
            }
            await batch.commit();

            setProfile((prev) => {
                const next = { ...(prev || {}), saldo: newSaldo };
                if (groupId && miSaldoStep > 0) {
                    const prevMi = typeof prev?.miSaldo === "number" ? prev.miSaldo : 0;
                    next.miSaldo = prevMi + miSaldoStep;
                }
                return next;
            });

            info("✅ Listo", "Saldo sumado correctamente.");
            closeSalaryModal();
        } catch (e) {
            info("Error", e.message);
        }
    };

    // ---------- FOTO PERFIL ----------
    const openPhotoModal = () => setIsPhotoOpen(true);
    const closePhotoModal = () => setIsPhotoOpen(false);

    const uriToBlob = async (uri) => {
        const res = await fetch(uri);
        return await res.blob();
    };

    const uploadProfilePhoto = async (uri) => {
        if (!user?.uid) return;

        setUploadingPhoto(true);
        try {
            const blob = await uriToBlob(uri);

            const fileRef = ref(storage, `avatars/${user.uid}/avatar.jpg`);
            await uploadBytes(fileRef, blob, { contentType: "image/jpeg" });

            const url = await getDownloadURL(fileRef);

            const refDoc = doc(db, "users", user.uid);
            await updateDoc(refDoc, { photoURL: url });

            setProfile((prev) => ({ ...(prev || {}), photoURL: url }));

            closePhotoModal();
            info("✅ Foto actualizada", "Tu foto de perfil se guardó correctamente.");
        } catch (e) {
            info("Error", e.message);
        } finally {
            setUploadingPhoto(false);
        }
    };

    const pickFromGallery = async () => {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
            info("Permiso requerido", "Activa el permiso de galería para elegir una foto.");
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.85,
        });

        if (!result.canceled) {
            const uri = result.assets?.[0]?.uri;
            if (uri) await uploadProfilePhoto(uri);
        }
    };

    const takeWithCamera = async () => {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
            info("Permiso requerido", "Activa el permiso de cámara para tomar una foto.");
            return;
        }

        const result = await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.85,
        });

        if (!result.canceled) {
            const uri = result.assets?.[0]?.uri;
            if (uri) await uploadProfilePhoto(uri);
        }
    };

    const removePhoto = async () => {
        if (!user?.uid) return;

        try {
            const refDoc = doc(db, "users", user.uid);
            await updateDoc(refDoc, { photoURL: "" });

            setProfile((prev) => ({ ...(prev || {}), photoURL: "" }));
            closePhotoModal();
            info("Listo", "Foto eliminada.");
        } catch (e) {
            info("Error", e.message);
        }
    };

    if (loading) {
        return (
            <View style={styles.loadingWrap}>
                <ActivityIndicator size="large" />
                <Text style={styles.loadingText}>Cargando perfil…</Text>
            </View>
        );
    }

    const salaryPreviewText = (() => {
        const cleaned = sanitizeNumeric(salaryInput);
        const amount = cleaned ? Number(cleaned) : 0;
        const step = profile?.groupId ? (salaryModalMiStep ?? 10000) : 0;
        const net =
            (saldoNumber || 0) +
            (Number.isFinite(amount) ? amount : 0) -
            (profile?.groupId && amount > 0 ? step : 0);
        try {
            return new Intl.NumberFormat("es-CR", {
                style: "currency",
                currency: "CRC",
                maximumFractionDigits: 0,
            }).format(net);
        } catch {
            return `₡ ${Math.round(net).toLocaleString("es-CR")}`;
        }
    })();

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: "transparent" }} edges={["left", "right"]}>

            <ScrollView style={styles.container} contentContainerStyle={styles.content}>
                {/* Header */}
                <View style={styles.header}>
                    <Pressable onPress={openPhotoModal} style={styles.avatarWrap}>
                        {photoURL ? (
                            <Image source={{ uri: photoURL }} style={styles.avatarImg} />
                        ) : (
                            <View style={styles.avatarFallback}>
                                <Ionicons name="person" size={26} color="#fff" />
                            </View>
                        )}
                        <View style={styles.avatarEditBadge}>
                            <Ionicons name="camera" size={14} color="#111827" />
                        </View>
                    </Pressable>

                    <View style={styles.headerInfo}>
                        <Text style={styles.name}>{profile?.nombre || "Tu perfil"}</Text>
                        <Text style={styles.email}>{email}</Text>
                    </View>
                </View>

                {/* Información */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Información</Text>

                    <Row icon="person-outline" label="Usuario" value={profile?.usuario ? `@${profile.usuario}` : "—"} />
                    <Row icon="cash-outline" label="Saldo" value={saldoText} highlight />
                    <Row icon="people-outline" label="Saldo compartido" value={hasPartner ? sharedSaldoText : "—"} highlight />
                    <Row icon="male-female-outline" label="Género" value={profile?.genero || "—"} />
                    <Row icon="calendar-outline" label="Registrado" value={createdAtText} />
                </View>

                {/* Acciones */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Acciones</Text>

                    <Pressable style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]} onPress={openSalaryModal}>
                        <Ionicons name="add-circle-outline" size={18} color="#fff" />
                        <Text style={styles.actionBtnText}>Ingresar salario</Text>
                    </Pressable>

                    <Text style={styles.hint}>
                        {profile?.groupId
                            ? "El salario ingresado suma a tu saldo general, pero se resta de ahí el mismo monto que se aparta a Mi Saldo (configurado en la pestaña Mi Saldo)."
                            : "Se sumará al saldo general actual."}
                    </Text>
                </View>

                {/* Compañero */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Compañero</Text>

                    <Text style={{ color: "#111827", fontWeight: "800", opacity: 0.8 }}>
                        {profile?.partnerUid
                            ? `Emparejado con @${profile?.partnerUsuario || ""}`
                            : "Aún no tienes compañero."}
                    </Text>

                    <Pressable
                        onPress={() => navigation.navigate("Partner")}
                        style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed, { marginTop: 12 }]}
                    >
                        <Ionicons name="heart-outline" size={18} color="#fff" />
                        <Text style={styles.actionBtnText}>Ir a Compañero</Text>
                    </Pressable>
                </View>

                <Text style={styles.footer}>PartnerLife • MoniJuro™</Text>

                {/* MODAL SALARIO */}
                <Modal visible={isSalaryOpen} animationType="fade" transparent onRequestClose={closeSalaryModal}>
                    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                        <View style={styles.modalOverlay}>
                            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ width: "100%" }}>
                                <TouchableWithoutFeedback>
                                    <View style={styles.modalCard}>
                                        <View style={styles.modalHeader}>
                                            <Text style={styles.modalTitle}>Ingresar salario</Text>
                                            <Pressable onPress={closeSalaryModal} hitSlop={10} style={styles.closeBtn}>
                                                <Text style={styles.closeBtnText}>✕</Text>
                                            </Pressable>
                                        </View>

                                        <Text style={styles.modalSubtitle}>
                                            Escribe la cantidad (solo números).
                                            {profile?.groupId
                                                ? " Tu saldo general sube (ingreso − apartado a Mi Saldo); Mi Saldo recibe el apartado configurado y se guarda el registro."
                                                : " Se sumará a tu saldo general."}
                                        </Text>

                                        <View style={styles.modalBody}>
                                            <Text style={styles.label}>Cantidad</Text>

                                            <View style={styles.moneyInputWrap}>
                                                <Text style={styles.moneyPrefix}>₡</Text>
                                                <TextInput
                                                    value={salaryInput}
                                                    onChangeText={(t) => setSalaryInput(sanitizeNumeric(t))}
                                                    placeholder="Ej: 350000"
                                                    placeholderTextColor="#9CA3AF"
                                                    keyboardType="number-pad"
                                                    style={styles.moneyInput}
                                                    returnKeyType="done"
                                                    onSubmitEditing={saveSalary}
                                                />
                                            </View>

                                            <Text style={styles.preview}>
                                                Saldo general quedará en:{" "}
                                                <Text style={styles.previewStrong}>{salaryPreviewText}</Text>
                                            </Text>
                                            {profile?.groupId &&
                                            Number(sanitizeNumeric(salaryInput)) > 0 ? (
                                                <Text style={styles.previewSub}>
                                                    Se apartan{" "}
                                                    {new Intl.NumberFormat("es-CR", {
                                                        style: "currency",
                                                        currency: "CRC",
                                                        maximumFractionDigits: 0,
                                                    }).format(salaryModalMiStep ?? 10000)}{" "}
                                                    a Mi Saldo (se restan del saldo general).
                                                </Text>
                                            ) : null}
                                        </View>

                                        <View style={styles.modalActions}>
                                            <Pressable style={({ pressed }) => [styles.modalPrimaryBtn, pressed && styles.pressed]} onPress={saveSalary}>
                                                <Text style={styles.modalPrimaryBtnText}>Guardar</Text>
                                            </Pressable>

                                            <Pressable style={({ pressed }) => [styles.modalSecondaryBtn, pressed && styles.pressed]} onPress={closeSalaryModal}>
                                                <Text style={styles.modalSecondaryBtnText}>Cancelar</Text>
                                            </Pressable>
                                        </View>
                                    </View>
                                </TouchableWithoutFeedback>
                            </KeyboardAvoidingView>
                        </View>
                    </TouchableWithoutFeedback>
                </Modal>

                {/* MODAL FOTO PRO */}
                <Modal visible={isPhotoOpen} animationType="fade" transparent onRequestClose={closePhotoModal}>
                    <Pressable style={styles.sheetOverlay} onPress={closePhotoModal} />

                    <View style={styles.sheet}>
                        <View style={styles.sheetHandle} />

                        <Text style={styles.sheetTitle}>Foto de perfil</Text>
                        <Text style={styles.sheetSub}>Elige una opción para actualizar tu foto.</Text>

                        <Pressable style={({ pressed }) => [styles.sheetBtn, pressed && styles.sheetPressed]} onPress={takeWithCamera} disabled={uploadingPhoto}>
                            <View style={styles.sheetIcon}>
                                <Ionicons name="camera-outline" size={18} color="#111827" />
                            </View>
                            <Text style={styles.sheetBtnText}>Tomar foto</Text>
                        </Pressable>

                        <Pressable style={({ pressed }) => [styles.sheetBtn, pressed && styles.sheetPressed]} onPress={pickFromGallery} disabled={uploadingPhoto}>
                            <View style={styles.sheetIcon}>
                                <Ionicons name="images-outline" size={18} color="#111827" />
                            </View>
                            <Text style={styles.sheetBtnText}>Elegir de galería</Text>
                        </Pressable>

                        {!!photoURL && (
                            <Pressable
                                style={({ pressed }) => [styles.sheetBtnDanger, pressed && styles.sheetPressed]}
                                onPress={() => {
                                    confirm("Eliminar foto", "¿Seguro que quieres eliminar tu foto de perfil?", {
                                        confirmText: "Eliminar",
                                        cancelText: "Cancelar",
                                        destructive: true,
                                        onConfirm: removePhoto,
                                    });
                                }}
                                disabled={uploadingPhoto}
                            >
                                <View style={styles.sheetIconDanger}>
                                    <Ionicons name="trash-outline" size={18} color="#991B1B" />
                                </View>
                                <Text style={styles.sheetBtnDangerText}>Eliminar foto</Text>
                            </Pressable>
                        )}

                        <Pressable style={({ pressed }) => [styles.sheetCancel, pressed && styles.sheetPressed]} onPress={closePhotoModal} disabled={uploadingPhoto}>
                            <Text style={styles.sheetCancelText}>{uploadingPhoto ? "Subiendo..." : "Cerrar"}</Text>
                        </Pressable>
                    </View>
                </Modal>
            </ScrollView>
        </SafeAreaView>
    );
}

function Row({ icon, label, value, highlight }) {
    return (
        <View style={styles.row}>
            <View style={styles.rowLeft}>
                <View style={[styles.rowIcon, highlight && styles.rowIconHighlight]}>
                    <Ionicons name={icon} size={16} color="#111827" />
                </View>
                <Text style={styles.rowLabel}>{label}</Text>
            </View>
            <Text style={[styles.rowValue, highlight && styles.rowValueHighlight]} numberOfLines={1}>
                {value}
            </Text>
        </View>
    );
}

/* ------------------ EMPAREJAR POR @ ------------------ */

function PartnerSection({ genero, nombre, profile }) {
    const g = String(genero || "").toLowerCase();
    const isFemenino = g === "femenino";
    const isMasculino = g === "masculino";

    const myColor = isFemenino ? "#ec4899" : isMasculino ? "#3b82f6" : "#9CA3AF";

    const partnerUid = profile?.partnerUid || "";
    const hasPartner = !!partnerUid;

    // 👇 genero real del partner (leído del doc del partner)
    const [partnerGeneroLive, setPartnerGeneroLive] = useState("");

    const [isFindOpen, setIsFindOpen] = useState(false);
    const openFind = () => setIsFindOpen(true);
    const closeFind = () => setIsFindOpen(false);

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
    const partnerColor =
        pg === "femenino" ? "#ec4899" : pg === "masculino" ? "#3b82f6" : "#9CA3AF";

    const leftColor = hasPartner ? myColor : "#D1D5DB";
    const rightColor = hasPartner ? partnerColor : "#D1D5DB";

    // logs bien puestos (ya nada sale undefined)
    console.log("partnerUid:", partnerUid);
    console.log("hasPartner:", hasPartner);
    console.log("partnerGeneroLive:", partnerGeneroLive);
    console.log("leftColor:", leftColor, "rightColor:", rightColor);

    const partnerNombre = profile?.partnerNombre || "";
    const partnerUsuario = profile?.partnerUsuario || "";

    return (
        <View style={styles.partnerWrap}>
            {/* Header romántico */}
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
                    <Pressable
                        onPress={openFind}
                        style={({ pressed }) => [styles.partnerCta, pressed && { opacity: 0.88 }]}
                    >
                        <Ionicons name="search-outline" size={16} color="#fff" />
                        <Text style={styles.partnerCtaText}>Buscar</Text>
                    </Pressable>
                )}
            </View>

            {/* Cuerpo */}
            <View style={styles.coupleRow}>
                {/* Tú */}
                <View style={[styles.personChip, { borderColor: "rgba(236,72,153,0.18)" }]}>
                    <View style={[styles.personAvatar, { borderColor: myColor }]}>
                        <Text style={styles.personInitial}>{String(nombre || "T").slice(0, 1).toUpperCase()}</Text>
                    </View>

                    <View style={{ flex: 1 }}>
                        <Text style={styles.personName} numberOfLines={1}>
                            {nombre || "Tú"}
                        </Text>

                        <View style={styles.personMetaRow}>
                            <View style={[styles.dot, { backgroundColor: myColor }]} />
                            <Text style={styles.personMeta}>Tú</Text>
                        </View>
                    </View>
                </View>

                {/* Centro corazón */}
                <View style={styles.heartCenter}>
                    <View style={styles.heartRing} />
                    <View style={styles.heartGlowSoft} />

                    <View style={styles.heartHalfWrap}>
                        <HalfHeart side="left" color={leftColor} />
                        <HalfHeart side="right" color={rightColor} />
                    </View>
                </View>

                {/* Partner */}
                <View style={[styles.personChip, { borderColor: "rgba(59,130,246,0.16)" }]}>
                    {hasPartner ? (
                        <>
                            <View style={[styles.personAvatar, { borderColor: partnerColor }]}>
                                <Text style={styles.personInitial}>
                                    {String(partnerNombre || "P").slice(0, 1).toUpperCase()}
                                </Text>
                            </View>

                            <View style={{ flex: 1 }}>
                                <Text style={styles.personName} numberOfLines={1}>
                                    {partnerNombre || "Compañero"}
                                </Text>

                                <View style={styles.personMetaRow}>
                                    <View style={[styles.dot, { backgroundColor: partnerColor }]} />
                                    <Text style={styles.personMeta}>@{partnerUsuario}</Text>
                                </View>
                            </View>
                        </>
                    ) : (
                        <Pressable
                            onPress={openFind}
                            style={({ pressed }) => [styles.emptyPartner, pressed && { opacity: 0.9 }]}
                        >
                            <View style={styles.emptyIcon}>
                                <Ionicons name="person-add-outline" size={18} color="#6B7280" />
                            </View>
                            <Text style={styles.emptyTitle}>Disponible</Text>
                            <Text style={styles.emptySub}>Toca para buscar</Text>
                        </Pressable>
                    )}
                </View>
            </View>

            {/* Mensaje abajo */}
            <View style={styles.partnerFooterNote}>
                <Ionicons name="sparkles-outline" size={16} color="#111827" />
                <Text style={styles.partnerFooterText}>
                    {hasPartner ? (
                        <>
                            Emparejado con <Text style={{ fontWeight: "900" }}>@{partnerUsuario}</Text>
                        </>
                    ) : (
                        <>
                            Envía una solicitud con el <Text style={{ fontWeight: "900" }}>@usuario</Text>.
                        </>
                    )}
                </Text>
            </View>
        </View>
    );


}


function PartnerSide({ side, active, glowColor, color, name, onPressAvailable }) {
    const isLeft = side === "left";

    const glowStyle =
        glowColor === "#ec4899"
            ? styles.heartGlowPink
            : glowColor === "#3b82f6"
                ? styles.heartGlowBlue
                : styles.heartGlowOff;

    return (
        <View style={styles.partnerSide}>
            <View pointerEvents="none" style={[styles.heartGlow, isLeft ? styles.heartGlowLeft : styles.heartGlowRight, active ? glowStyle : styles.heartGlowOff]} />

            <Pressable
                disabled={!onPressAvailable}
                onPress={onPressAvailable}
                style={({ pressed }) => [
                    styles.heartPressWrap,
                    !!onPressAvailable && pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
                ]}
            >
                <HalfHeart side={side} color={color} />
            </Pressable>

            {name ? (
                <Text style={styles.partnerName} numberOfLines={1}>
                    {name}
                </Text>
            ) : (
                <View style={styles.availableWrap}>
                    <View style={styles.availableIcon}>
                        <Ionicons name="person-add-outline" size={16} color="#6B7280" />
                    </View>
                    <Text style={styles.availableText}>Disponible</Text>
                </View>
            )}
        </View>
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

/* ------------------ STYLES ------------------ */

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: "transparent" },
    content: { padding: 16, paddingBottom: 26 },

    loadingWrap: { flex: 1, backgroundColor: "transparent", alignItems: "center", justifyContent: "center", padding: 16 },
    loadingText: { marginTop: 10, color: PL.textMuted },

    header: {
        backgroundColor: PL.headerCardBg,
        borderRadius: 20,
        padding: 16,
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 14,
        borderWidth: 1,
        borderColor: PL.headerCardBorder,
    },

    avatarWrap: { width: 58, height: 58, borderRadius: 20 },
    avatarImg: { width: 58, height: 58, borderRadius: 20 },
    avatarFallback: {
        width: 58,
        height: 58,
        borderRadius: 20,
        backgroundColor: "rgba(236,72,153,0.20)",
        borderWidth: 1,
        borderColor: "rgba(236,72,153,0.35)",
        alignItems: "center",
        justifyContent: "center",
    },
    avatarEditBadge: {
        position: "absolute",
        right: -4,
        bottom: -4,
        width: 26,
        height: 26,
        borderRadius: 10,
        backgroundColor: "#fff",
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: "#E5E7EB",
    },

    headerInfo: { marginLeft: 12, flex: 1 },
    name: { color: PL.ink, fontWeight: "900", fontSize: 18 },
    email: { marginTop: 2, color: PL.textMuted },

    card: {
        backgroundColor: "rgba(255,255,255,0.95)",
        borderRadius: 18,
        padding: 16,
        marginBottom: 12,
        shadowColor: "#000",
        shadowOpacity: 0.16,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 10 },
        elevation: 5,
    },
    cardTitle: { fontWeight: "900", fontSize: 14, color: "#111827", marginBottom: 10 },

    row: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 10,
        borderTopWidth: 1,
        borderTopColor: "#EEF2F7",
    },
    rowLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, paddingRight: 10 },
    rowIcon: { width: 28, height: 28, borderRadius: 10, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center" },
    rowIconHighlight: { backgroundColor: "rgba(236,72,153,0.14)" },
    rowLabel: { color: "#111827", fontWeight: "800" },
    rowValue: { color: "#111827", fontWeight: "800", opacity: 0.85, maxWidth: "55%" },
    rowValueHighlight: { fontWeight: "900" },

    actionBtn: {
        marginTop: 6,
        backgroundColor: PL.cta,
        borderRadius: 14,
        paddingVertical: 14,
        paddingHorizontal: 14,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: 10,
    },
    actionBtnText: { color: "#fff", fontWeight: "900", fontSize: 15 },

    pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },

    hint: { marginTop: 10, color: "#6B7280", fontSize: 12, lineHeight: 16 },
    footer: { marginTop: 8, color: PL.textSubtle, textAlign: "center", fontSize: 12 },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.60)", justifyContent: "center", padding: 18 },
    modalCard: { width: "100%", maxWidth: 520, alignSelf: "center", backgroundColor: "#fff", borderRadius: 18, padding: 18 },
    modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
    modalTitle: { fontSize: 18, fontWeight: "900", color: "#111827" },
    closeBtn: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "#F3F4F6" },
    closeBtnText: { fontSize: 16, fontWeight: "900", color: "#111827" },
    modalSubtitle: { fontSize: 13, opacity: 0.7, marginBottom: 14 },
    modalBody: { gap: 10 },
    label: { fontSize: 12, fontWeight: "900", color: "#111827" },
    moneyInputWrap: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#E5E7EB", backgroundColor: "#FAFAFA", borderRadius: 14, overflow: "hidden" },
    moneyPrefix: { paddingHorizontal: 14, fontWeight: "900", color: "#111827", opacity: 0.9, fontSize: 16 },
    moneyInput: { flex: 1, height: 48, paddingHorizontal: 10, color: "#111827", fontWeight: "800", fontSize: 16 },
    preview: { marginTop: 4, fontSize: 12, color: "#6B7280" },
    previewStrong: { color: "#111827", fontWeight: "900" },
    previewSub: { marginTop: 8, fontSize: 12, color: "#6B7280", lineHeight: 17, fontWeight: "700" },
    modalActions: { marginTop: 16, gap: 10 },
    modalPrimaryBtn: { width: "100%", paddingVertical: 14, borderRadius: 14, alignItems: "center", backgroundColor: PL.cta },
    modalPrimaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "900" },
    modalSecondaryBtn: { width: "100%", paddingVertical: 14, borderRadius: 14, alignItems: "center", backgroundColor: "#F3F4F6" },
    modalSecondaryBtnText: { color: "#111827", fontSize: 16, fontWeight: "800" },

    // Bottom sheet
    sheetOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.60)" },
    sheet: { backgroundColor: "#fff", paddingHorizontal: 16, paddingTop: 10, paddingBottom: 16, borderTopLeftRadius: 22, borderTopRightRadius: 22 },
    sheetHandle: { alignSelf: "center", width: 46, height: 5, borderRadius: 10, backgroundColor: "#E5E7EB", marginBottom: 10 },
    sheetTitle: { fontSize: 16, fontWeight: "900", color: "#111827" },
    sheetSub: { marginTop: 4, fontSize: 12, color: "#6B7280", marginBottom: 12 },
    sheetBtn: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#F3F4F6", paddingVertical: 14, paddingHorizontal: 12, borderRadius: 16, marginBottom: 10 },
    sheetIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#E5E7EB" },
    sheetBtnText: { fontWeight: "900", color: "#111827" },
    sheetBtnDanger: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "rgba(239,68,68,0.10)", paddingVertical: 14, paddingHorizontal: 12, borderRadius: 16, marginBottom: 10, borderWidth: 1, borderColor: "rgba(239,68,68,0.25)" },
    sheetIconDanger: { width: 34, height: 34, borderRadius: 12, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(239,68,68,0.25)" },
    sheetBtnDangerText: { fontWeight: "900", color: "#991B1B" },
    sheetCancel: { backgroundColor: PL.cta, paddingVertical: 14, borderRadius: 16, alignItems: "center", justifyContent: "center", marginTop: 2 },
    sheetCancelText: { color: "#fff", fontWeight: "900" },
    sheetPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },

    // Partner
    partnerWrap: { width: "100%" },
    partnerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 },
    partnerSide: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 10 },
    partnerDivider: { width: 1, height: 130, backgroundColor: "#E5E7EB", marginHorizontal: 10, borderRadius: 10 },

    heartPressWrap: { width: 78, height: 78, alignItems: "center", justifyContent: "center" },
    heartBox: { width: 68, height: 60, alignItems: "center", justifyContent: "center" },
    heartCrop: { width: 68, height: 60, overflow: "hidden", alignItems: "center", justifyContent: "center" },
    heartCropLeft: { alignItems: "flex-start" },
    heartCropRight: { alignItems: "flex-end" },

    partnerName: { marginTop: 10, fontWeight: "900", color: "#111827", maxWidth: 140 },

    availableWrap: {
        marginTop: 10,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 999,
        backgroundColor: "#F3F4F6",
        borderWidth: 1,
        borderColor: "#E5E7EB",
    },
    availableIcon: { width: 28, height: 28, borderRadius: 10, backgroundColor: "#fff", borderWidth: 1, borderColor: "#E5E7EB", alignItems: "center", justifyContent: "center" },
    availableText: { color: "#6B7280", fontWeight: "900" },

    partnerHint: { marginTop: 12, fontSize: 12, color: "#6B7280", lineHeight: 16 },

    unlinkBtn: {
        alignSelf: "flex-start",
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 14,
        backgroundColor: "rgba(239,68,68,0.10)",
        borderWidth: 1,
        borderColor: "rgba(239,68,68,0.22)",
    },
    unlinkText: { color: "#991B1B", fontWeight: "900" },

    heartGlow: { position: "absolute", width: 120, height: 120, borderRadius: 999, opacity: 0.6 },
    heartGlowLeft: { left: -10 },
    heartGlowRight: { right: -10 },
    heartGlowPink: { backgroundColor: "rgba(236,72,153,0.25)" },
    heartGlowBlue: { backgroundColor: "rgba(59,130,246,0.22)" },
    heartGlowOff: { opacity: 0 },

    // Find modal
    findCard: {
        width: "100%",
        maxWidth: 520,
        alignSelf: "center",
        backgroundColor: "#fff",
        borderRadius: 18,
        padding: 16,
        shadowColor: "#000",
        shadowOpacity: 0.18,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 10 },
        elevation: 6,
    },
    findHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
    findBadge: {
        width: 34,
        height: 34,
        borderRadius: 12,
        backgroundColor: "rgba(236,72,153,0.12)",
        borderWidth: 1,
        borderColor: "rgba(236,72,153,0.22)",
        alignItems: "center",
        justifyContent: "center",
    },
    findTitle: { fontSize: 16, fontWeight: "900", color: "#111827" },
    findSub: { marginTop: 2, fontSize: 12, color: "#6B7280", fontWeight: "700" },

    findBody: { borderRadius: 16, borderWidth: 1, borderColor: "#E5E7EB", overflow: "hidden", backgroundColor: "#FAFAFA" },
    findItem: { flexDirection: "row", gap: 10, paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#EEF2F7" },
    findText: { flex: 1, color: "#111827", fontWeight: "800", opacity: 0.85 },

    findOkBtn: { marginTop: 12, backgroundColor: PL.cta, borderRadius: 14, paddingVertical: 12, alignItems: "center" },
    findOkText: { color: "#fff", fontWeight: "900", fontSize: 15 },

    handleInputWrap: {
        flexDirection: "row",
        alignItems: "center",
        borderWidth: 1,
        borderColor: "#E5E7EB",
        backgroundColor: "#FAFAFA",
        borderRadius: 14,
        overflow: "hidden",
    },
    handlePrefix: { paddingHorizontal: 14, fontWeight: "900", color: "#111827", opacity: 0.6, fontSize: 16 },
    handleInput: { flex: 1, height: 48, paddingHorizontal: 10, color: "#111827", fontWeight: "800", fontSize: 16 },
    partnerHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 12,
    },
    partnerHeaderLeft: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    partnerBadge: {
        width: 34,
        height: 34,
        borderRadius: 12,
        backgroundColor: "rgba(236,72,153,0.12)",
        borderWidth: 1,
        borderColor: "rgba(236,72,153,0.22)",
        alignItems: "center",
        justifyContent: "center",
    },
    partnerTitle: { fontSize: 14, fontWeight: "900", color: "#111827" },
    partnerSubtitle: { marginTop: 2, fontSize: 12, color: "#6B7280", fontWeight: "800" },

    partnerActionBtn: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 999,
        backgroundColor: "#ec4899",
        shadowColor: "#000",
        shadowOpacity: 0.12,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 8 },
        elevation: 4,
    },
    partnerActionText: { color: "#fff", fontWeight: "900" },

    partnerBody: {
        flexDirection: "row",
        alignItems: "stretch",
        gap: 12,
    },

    partnerCard: {
        flex: 1,
        borderRadius: 18,
        backgroundColor: "rgba(236,72,153,0.06)",
        borderWidth: 1,
        borderColor: "rgba(236,72,153,0.18)",
        padding: 12,
    },

    partnerCardTop: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },

    partnerAvatar: {
        width: 40,
        height: 40,
        borderRadius: 16,
        backgroundColor: "rgba(255,255,255,0.9)",
        borderWidth: 2,
        alignItems: "center",
        justifyContent: "center",
    },

    partnerNameText: { fontWeight: "900", color: "#111827", fontSize: 13 },

    genderChip: {
        marginTop: 6,
        alignSelf: "flex-start",
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 999,
        borderWidth: 1,
    },
    genderDot: { width: 8, height: 8, borderRadius: 99 },
    genderChipText: { fontWeight: "900", color: "#111827", fontSize: 11, opacity: 0.85 },

    partnerCenter: {
        width: 110,
        alignItems: "center",
        justifyContent: "center",
    },
    partnerLine: {
        position: "absolute",
        top: "50%",
        left: 0,
        right: 0,
        height: 1,
        backgroundColor: "#E5E7EB",
    },
    partnerHeartWrap: {
        width: 92,
        height: 84,
        borderRadius: 18,
        backgroundColor: "#fff",
        borderWidth: 1,
        borderColor: "#E5E7EB",
        alignItems: "center",
        justifyContent: "center",
        paddingTop: 6,
    },

    partnerEmpty: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 6,
    },
    partnerEmptyIcon: {
        width: 38,
        height: 38,
        borderRadius: 14,
        backgroundColor: "#F3F4F6",
        borderWidth: 1,
        borderColor: "#E5E7EB",
        alignItems: "center",
        justifyContent: "center",
    },
    partnerEmptyTitle: { marginTop: 10, fontWeight: "900", color: "#111827" },
    partnerEmptySub: { marginTop: 2, fontWeight: "800", color: "#6B7280", fontSize: 12 },

    partnerGhostBtn: {
        marginTop: 10,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 14,
        backgroundColor: "#F3F4F6",
        borderWidth: 1,
        borderColor: "#E5E7EB",
    },
    partnerGhostText: { fontWeight: "900", color: "#111827" },

    partnerHintBox: {
        marginTop: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 14,
        backgroundColor: "rgba(17,24,39,0.03)",
        borderWidth: 1,
        borderColor: "#E5E7EB",
    },
    partnerHintText: {
        flex: 1,
        color: "#111827",
        fontWeight: "800",
        opacity: 0.85,
        fontSize: 12,
        lineHeight: 16,
    },

    // --- ROMANTIC CENTER ---
    partnerLineRomantic: {
        position: "absolute",
        top: "50%",
        left: 0,
        right: 0,
        height: 1,
        backgroundColor: "rgba(236,72,153,0.20)",
    },

    heartAura: {
        position: "absolute",
        width: 140,
        height: 140,
        borderRadius: 999,
        backgroundColor: "rgba(236,72,153,0.18)",
        opacity: 1,
    },

    partnerHeartWrapRomantic: {
        width: 96,
        height: 90,
        borderRadius: 22,
        backgroundColor: "rgba(255,255,255,0.92)",
        borderWidth: 1,
        borderColor: "rgba(236,72,153,0.22)",
        alignItems: "center",
        justifyContent: "center",
        paddingTop: 6,
        shadowColor: "#000",
        shadowOpacity: 0.12,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 10 },
        elevation: 6,
    },

    partnerHeartWrapRomanticOn: {
        borderColor: "rgba(236,72,153,0.35)",
        backgroundColor: "rgba(255,255,255,0.98)",
    },

    sparkleTopLeft: {
        position: "absolute",
        top: 10,
        left: 10,
        opacity: 0.9,
    },
    sparkleBottomRight: {
        position: "absolute",
        bottom: 10,
        right: 10,
        opacity: 0.9,
    },

    // --- ROMANTIC HINT BOX ---
    partnerHintBox: {
        marginTop: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 16,
        backgroundColor: "rgba(236,72,153,0.08)",
        borderWidth: 1,
        borderColor: "rgba(236,72,153,0.18)",
    },

    // --- CHIP MÁS CUTE ---
    genderChip: {
        marginTop: 6,
        alignSelf: "flex-start",
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 999,
        borderWidth: 1,
        backgroundColor: "rgba(255,255,255,0.75)",
    },
    partnerStatusRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },

    partnerHeaderRomantic: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 12,
    },
    partnerHeartBadge: {
        width: 34,
        height: 34,
        borderRadius: 12,
        backgroundColor: "rgba(236,72,153,0.12)",
        borderWidth: 1,
        borderColor: "rgba(236,72,153,0.22)",
        alignItems: "center",
        justifyContent: "center",
    },
    partnerTitleRomantic: { fontSize: 14, fontWeight: "900", color: "#111827" },
    partnerSubRomantic: { marginTop: 2, fontSize: 12, color: "#6B7280", fontWeight: "800" },

    partnerCta: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 999,
        backgroundColor: PL.cta,
    },
    partnerCtaText: { color: "#fff", fontWeight: "900" },

    coupleRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
    },

    personChip: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        padding: 12,
        borderRadius: 18,
        backgroundColor: "rgba(255,255,255,0.92)",
        borderWidth: 1,
        shadowColor: "#000",
        shadowOpacity: 0.06,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 8 },
        elevation: 2,
    },

    personAvatar: {
        width: 42,
        height: 42,
        borderRadius: 16,
        backgroundColor: "rgba(17,24,39,0.04)",
        borderWidth: 2,
        alignItems: "center",
        justifyContent: "center",
    },
    personInitial: { fontWeight: "900", color: "#111827", fontSize: 16 },

    personName: { fontWeight: "900", color: "#111827", fontSize: 13 },
    personMetaRow: { marginTop: 6, flexDirection: "row", alignItems: "center", gap: 8 },
    dot: { width: 8, height: 8, borderRadius: 999 },
    personMeta: { fontWeight: "900", color: "#6B7280", fontSize: 12 },

    heartCenter: {
        width: 92,
        height: 92,
        alignItems: "center",
        justifyContent: "center",
    },
    heartRing: {
        position: "absolute",
        width: 92,
        height: 92,
        borderRadius: 999,
        backgroundColor: "rgba(236,72,153,0.08)",
        borderWidth: 1,
        borderColor: "rgba(236,72,153,0.20)",
    },
    heartGlowSoft: {
        position: "absolute",
        width: 120,
        height: 120,
        borderRadius: 999,
        backgroundColor: "rgba(236,72,153,0.10)",
    },
    heartHalfWrap: {
        width: 86,
        height: 78,
        borderRadius: 18,
        backgroundColor: "rgba(255,255,255,0.96)",
        borderWidth: 1,
        borderColor: "rgba(17,24,39,0.08)",
        alignItems: "center",
        justifyContent: "center",
        shadowColor: "#000",
        shadowOpacity: 0.08,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 10 },
        elevation: 2,
        paddingTop: 6,
    },

    emptyPartner: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 6 },
    emptyIcon: {
        width: 42,
        height: 42,
        borderRadius: 16,
        backgroundColor: "rgba(17,24,39,0.04)",
        borderWidth: 1,
        borderColor: "rgba(17,24,39,0.10)",
        alignItems: "center",
        justifyContent: "center",
    },
    emptyTitle: { marginTop: 8, fontWeight: "900", color: "#111827", fontSize: 13 },
    emptySub: { marginTop: 2, fontWeight: "800", color: "#6B7280", fontSize: 12 },

    partnerFooterNote: {
        marginTop: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 16,
        backgroundColor: "rgba(236,72,153,0.06)",
        borderWidth: 1,
        borderColor: "rgba(236,72,153,0.16)",
    },
    partnerFooterText: {
        flex: 1,
        color: "#111827",
        fontWeight: "800",
        opacity: 0.9,
        fontSize: 12,
        lineHeight: 16,
    },

});
