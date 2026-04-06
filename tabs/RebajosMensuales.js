// Rebajos mensuales: aprobación del compañero; estado del mes compartido (grupo); pagos parciales; 1 cierre/mes.
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
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
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
  getDoc,
  runTransaction,
} from "firebase/firestore";

function clampPaymentDay(year, monthIndex, day) {
  const last = new Date(year, monthIndex + 1, 0).getDate();
  return Math.min(Math.max(1, day), last);
}

function getThisAndNextPaymentDates(paymentDay) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = clampPaymentDay(y, m, paymentDay);
  const thisDate = new Date(y, m, d);
  const nm = m + 1;
  const y2 = nm > 11 ? y + 1 : y;
  const m2 = nm > 11 ? 0 : nm;
  const d2 = clampPaymentDay(y2, m2, paymentDay);
  const nextDate = new Date(y2, m2, d2);
  return { thisDate, nextDate };
}

function getDateAlert(paymentDay) {
  const { thisDate } = getThisAndNextPaymentDates(paymentDay);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const pay = new Date(thisDate.getFullYear(), thisDate.getMonth(), thisDate.getDate());
  const diff = Math.round((pay - today) / 86400000);
  if (diff >= 0 && diff <= 3) return { kind: "soon", label: "Pago próximo" };
  if (diff < 0) return { kind: "overdue", label: "Fecha de pago vencida" };
  return null;
}

function getCurrentPeriodKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatPeriodLabel(periodKey) {
  const [y, m] = String(periodKey || "").split("-").map(Number);
  if (!y || !m) return String(periodKey);
  const dt = new Date(y, m - 1, 1);
  try {
    return dt.toLocaleDateString("es-CR", { month: "long", year: "numeric" });
  } catch {
    return periodKey;
  }
}

function formatDateES(d) {
  try {
    return d.toLocaleDateString("es-CR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return String(d);
  }
}

function formatPaidAt(ts) {
  if (!ts?.toDate) return "—";
  try {
    const d = ts.toDate();
    return d.toLocaleString("es-CR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return "—";
  }
}

function parseSaldoField(v) {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(String(v).replace(/[^\d.]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** Descuenta `amount` de saldo luego miSaldo */
function deductSaldoMi(saldo, mi, amount) {
  let rem = amount;
  let ns = saldo;
  let nm = mi;
  if (ns >= rem) {
    ns -= rem;
    rem = 0;
  } else {
    rem -= ns;
    ns = 0;
    nm -= rem;
  }
  return { newSaldo: ns, newMi: nm };
}

export default function RebajosMensualesScreen() {
  const navigation = useNavigation();
  const user = firebaseAuth.currentUser;

  const [profile, setProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  const [items, setItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(true);

  /** { [rebateId]: period doc fields } */
  const [periodByRebateId, setPeriodByRebateId] = useState({});
  const [partialInputByRebate, setPartialInputByRebate] = useState({});

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [rebateName, setRebateName] = useState("");
  const [rebateDesc, setRebateDesc] = useState("");
  const [paymentDayInput, setPaymentDayInput] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [creating, setCreating] = useState(false);

  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [reviewing, setReviewing] = useState(false);

  const [payingId, setPayingId] = useState(null);

  const sanitizeAmount = (t) => String(t || "").replace(/[^\d]/g, "");
  const groupId = profile?.groupId || "";
  const hasGroup = !!groupId;
  const partnerUid = profile?.partnerUid || "";

  const periodKey = getCurrentPeriodKey();

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

  useEffect(() => {
    if (!hasGroup) {
      setItems([]);
      setLoadingItems(false);
      return;
    }
    setLoadingItems(true);
    const colRef = collection(db, "groups", groupId, "monthlyRebates");
    const qRef = query(colRef, orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      qRef,
      (snap) => {
        setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoadingItems(false);
      },
      (e) => {
        setLoadingItems(false);
        Alert.alert("Error", e?.message || "No se pudieron cargar los rebajos.");
      }
    );
    return () => unsub();
  }, [hasGroup, groupId]);

  const approved = useMemo(() => items.filter((x) => !!x.accepted), [items]);
  const approvedIds = useMemo(() => approved.map((a) => a.id).sort().join(","), [approved]);

  useEffect(() => {
    if (!hasGroup || approved.length === 0) {
      setPeriodByRebateId({});
      return;
    }
    const pk = getCurrentPeriodKey();
    const unsubs = approved.map((rebate) => {
      const ref = doc(db, "groups", groupId, "monthlyRebates", rebate.id, "periods", pk);
      return onSnapshot(ref, (snap) => {
        setPeriodByRebateId((prev) => ({
          ...prev,
          [rebate.id]: snap.exists()
            ? snap.data()
            : {
                paidTotal: 0,
                amountTarget: typeof rebate.amount === "number" ? rebate.amount : 0,
                completed: false,
              },
        }));
      });
    });
    return () => unsubs.forEach((u) => u());
  }, [hasGroup, groupId, approvedIds]);

  const pending = useMemo(() => items.filter((x) => !x.accepted), [items]);

  const openCreate = () => {
    setRebateName("");
    setRebateDesc("");
    setPaymentDayInput("");
    setAmountInput("");
    setIsCreateOpen(true);
  };
  const closeCreate = () => {
    setIsCreateOpen(false);
    Keyboard.dismiss();
  };

  const openReview = (docRebate) => {
    setSelected(docRebate);
    setIsReviewOpen(true);
  };
  const closeReview = () => {
    setIsReviewOpen(false);
    setSelected(null);
  };

  const createRebate = useCallback(async () => {
    if (!user?.uid || !hasGroup) return;

    const name = String(rebateName || "").trim();
    const desc = String(rebateDesc || "").trim();
    const pd = Number(String(paymentDayInput || "").replace(/\D/g, ""));
    const amount = Number(sanitizeAmount(amountInput));

    if (!name) {
      Alert.alert("Dato requerido", "Escribe el nombre del rebajo.");
      return;
    }
    if (!Number.isFinite(pd) || pd < 1 || pd > 31) {
      Alert.alert("Día de pago", "Indica un día entre 1 y 31.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert("Monto inválido", "Ingresa un monto mayor a 0.");
      return;
    }

    try {
      setCreating(true);
      await addDoc(collection(db, "groups", groupId, "monthlyRebates"), {
        name,
        description: desc,
        paymentDay: pd,
        amount,
        accepted: false,
        createdAt: serverTimestamp(),
        createdBy: user.uid,
        createdByName: profile?.nombre || user?.displayName || "",
      });
      Alert.alert("✅ Enviado", "Rebajo enviado para aprobación de tu compañero.");
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
    rebateName,
    rebateDesc,
    paymentDayInput,
    amountInput,
    profile?.nombre,
    user?.displayName,
  ]);

  const canReviewSelected = useMemo(() => {
    if (!selected) return false;
    if (selected.accepted) return false;
    return selected.createdBy && selected.createdBy !== user?.uid;
  }, [selected, user?.uid]);

  const approveSelected = useCallback(async () => {
    if (!selected?.id || !hasGroup) return;
    try {
      setReviewing(true);
      const ref = doc(db, "groups", groupId, "monthlyRebates", selected.id);
      await updateDoc(ref, {
        accepted: true,
        acceptedAt: serverTimestamp(),
        acceptedBy: user?.uid || "",
      });
      Alert.alert("✅ Aprobado", "Rebajo aprobado.");
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
      await deleteDoc(doc(db, "groups", groupId, "monthlyRebates", selected.id));
      Alert.alert("Listo", "Rebajo rechazado y eliminado.");
      closeReview();
    } catch (e) {
      Alert.alert("Error", e?.message || "No se pudo rechazar.");
    } finally {
      setReviewing(false);
    }
  }, [selected?.id, hasGroup, groupId]);

  const applyPayment = useCallback(
    async (rebate, rawPayAmount) => {
      if (!user?.uid || !rebate?.id || !hasGroup) return;
      const payAmount = Number(rawPayAmount);
      if (!Number.isFinite(payAmount) || payAmount <= 0) {
        Alert.alert("Monto", "Ingresa un monto mayor a 0.");
        return;
      }

      const pk = getCurrentPeriodKey();
      const periodRef = doc(db, "groups", groupId, "monthlyRebates", rebate.id, "periods", pk);
      const paymentCol = collection(
        db,
        "groups",
        groupId,
        "monthlyRebates",
        rebate.id,
        "periods",
        pk,
        "payments"
      );
      const paymentRef = doc(paymentCol);
      const userRef = doc(db, "users", user.uid);

      try {
        setPayingId(rebate.id);
        await runTransaction(db, async (transaction) => {
          const pSnap = await transaction.get(periodRef);
          const uSnap = await transaction.get(userRef);

          const defaultTarget = typeof rebate.amount === "number" ? rebate.amount : 0;
          let paidTotal = 0;
          let completed = false;
          let target = defaultTarget;

          if (pSnap.exists()) {
            const d = pSnap.data();
            paidTotal = typeof d.paidTotal === "number" ? d.paidTotal : 0;
            completed = !!d.completed;
            if (typeof d.amountTarget === "number" && d.amountTarget > 0) target = d.amountTarget;
          }

          if (completed) {
            throw new Error("CLOSED");
          }

          const remaining = Math.max(0, Math.round(target) - Math.round(paidTotal));
          const apply = Math.min(Math.round(payAmount), remaining);
          if (apply <= 0) {
            throw new Error("ZERO");
          }

          const saldo = parseSaldoField(uSnap.data()?.saldo);
          const mi = typeof uSnap.data()?.miSaldo === "number" ? uSnap.data().miSaldo : 0;
          if (saldo + mi < apply) {
            throw new Error("NO_FUNDS");
          }

          const { newSaldo, newMi } = deductSaldoMi(saldo, mi, apply);
          const newPaid = paidTotal + apply;
          const newCompleted = newPaid >= target;

          let partnerSaldo = 0;
          if (partnerUid) {
            const partnerRef = doc(db, "users", partnerUid);
            const pr = await transaction.get(partnerRef);
            if (pr.exists()) partnerSaldo = parseSaldoField(pr.data()?.saldo);
          }

          transaction.update(userRef, { saldo: newSaldo, miSaldo: newMi });

          transaction.set(
            periodRef,
            {
              amountTarget: target,
              paidTotal: newPaid,
              completed: newCompleted,
              periodKey: pk,
              completedAt: newCompleted ? serverTimestamp() : null,
              completedByUid: newCompleted ? user.uid : null,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );

          transaction.set(paymentRef, {
            uid: user.uid,
            amount: apply,
            createdAt: serverTimestamp(),
          });

          const logRef = doc(collection(db, "users", user.uid, "miSaldoLogs"));
          transaction.set(logRef, {
            type: "rebajo_mensual",
            actorUid: user.uid,
            actorGenero: profile?.genero || "",
            rebateId: rebate.id,
            rebateName: rebate.name || "",
            amount: apply,
            periodKey: pk,
            monthCompleted: newCompleted,
            saldoAfter: newSaldo,
            saldoCompartidoAfter: newSaldo + partnerSaldo,
            createdAt: serverTimestamp(),
          });
        });

        setPartialInputByRebate((prev) => ({ ...prev, [rebate.id]: "" }));
        Alert.alert("✅ Listo", "Pago aplicado.");
      } catch (e) {
        const code = e?.message;
        if (code === "CLOSED") {
          Alert.alert("Mes cerrado", "Este rebajo ya se completó este mes. Podrás pagar de nuevo el próximo mes.");
        } else if (code === "ZERO") {
          Alert.alert("Nada que pagar", "El objetivo del mes ya está cubierto o el monto es 0.");
        } else if (code === "NO_FUNDS") {
          Alert.alert("Saldo insuficiente", "No tienes saldo suficiente para este pago.");
        } else {
          Alert.alert("Error", e?.message || "No se pudo aplicar.");
        }
      } finally {
        setPayingId(null);
      }
    },
    [hasGroup, groupId, partnerUid, profile?.genero]
  );

  const completeRemainder = useCallback(
    (rebate, remaining) => {
      if (remaining <= 0) {
        Alert.alert("Listo", "No hay saldo pendiente este mes.");
        return;
      }
      const label = new Intl.NumberFormat("es-CR", {
        style: "currency",
        currency: "CRC",
        maximumFractionDigits: 0,
      }).format(remaining);
      Alert.alert(
        "Completar mes",
        `Se descontará ${label} de tu saldo (general y Mi Saldo si hace falta) y se cerrará el mes para este rebajo.`,
        [
          { text: "Cancelar", style: "cancel" },
          { text: "Continuar", onPress: () => applyPayment(rebate, remaining) },
        ]
      );
    },
    [applyPayment]
  );

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
          <Text style={styles.lockTitle}>Rebajos bloqueados</Text>
          <Text style={styles.lockSub}>Crea un grupo con tu compañero en Partner.</Text>
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
        <View style={styles.headerCard}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={styles.iconBadge}>
              <MaterialCommunityIcons name="calendar-month" size={18} color="#111827" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Rebajos mensuales</Text>
              <Text style={styles.headerSub}>
                Mes en curso: {formatPeriodLabel(periodKey)}. Ambos ven el mismo avance; pueden pagar partes desde
                cada saldo.
              </Text>
            </View>
            <Pressable onPress={openCreate} style={({ pressed }) => [styles.ctaBtn, pressed && styles.pressed]}>
              <Ionicons name="add-outline" size={18} color="#fff" />
              <Text style={styles.ctaText}>Nuevo</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Text style={styles.cardTitle}>Pendientes de aprobación</Text>
            <View style={styles.pillPending}>
              <Ionicons name="time-outline" size={14} color="#111827" />
              <Text style={styles.pillText}>Compañero</Text>
            </View>
          </View>
          {loadingItems ? (
            <ActivityIndicator style={{ marginTop: 16 }} />
          ) : pending.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="checkmark-circle-outline" size={18} color="#111827" />
              <Text style={styles.emptyText}>No hay rebajos pendientes.</Text>
            </View>
          ) : (
            <View style={{ gap: 10, marginTop: 8 }}>
              {pending.map((it) => {
                const isMine = it.createdBy === user?.uid;
                return (
                  <Pressable
                    key={it.id}
                    onPress={() => openReview(it)}
                    style={({ pressed }) => [styles.itemRow, pressed && styles.pressed, isMine && { opacity: 0.9 }]}
                  >
                    <View style={styles.itemLeft}>
                      <View style={styles.itemDotPending} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.itemName} numberOfLines={1}>
                          {it.name}
                        </Text>
                        <Text style={styles.itemMeta} numberOfLines={1}>
                          Día {it.paymentDay || "—"} · {isMine ? "Esperando aprobación" : "Toca para revisar"}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.itemAmount}>{fmtCRC(it.amount)}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Text style={styles.cardTitle}>Rebajos programados</Text>
            <View style={styles.pillOk}>
              <Ionicons name="checkmark-circle-outline" size={14} color="#111827" />
              <Text style={styles.pillText}>Aprobados</Text>
            </View>
          </View>
          {loadingItems ? (
            <ActivityIndicator style={{ marginTop: 16 }} />
          ) : approved.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="information-circle-outline" size={18} color="#111827" />
              <Text style={styles.emptyText}>Aún no hay rebajos aprobados.</Text>
            </View>
          ) : (
            <View style={{ gap: 12, marginTop: 8 }}>
              {approved.map((it) => {
                const pd = typeof it.paymentDay === "number" ? it.paymentDay : 1;
                const { thisDate, nextDate } = getThisAndNextPaymentDates(pd);
                const alertInfo = getDateAlert(pd);

                const period = periodByRebateId[it.id];
                const target =
                  typeof period?.amountTarget === "number"
                    ? period.amountTarget
                    : typeof it.amount === "number"
                      ? it.amount
                      : 0;
                const paidTotal = typeof period?.paidTotal === "number" ? period.paidTotal : 0;
                const completed = !!period?.completed;
                const remaining = Math.max(0, Math.round(target) - Math.round(paidTotal));
                const progress = target > 0 ? Math.min(1, paidTotal / target) : 0;
                const paidThisMonth = completed;

                const partialStr = partialInputByRebate[it.id] ?? "";

                return (
                  <View
                    key={it.id}
                    style={[styles.rebateCard, paidThisMonth && styles.rebateCardPaid]}
                  >
                    <View style={styles.periodRow}>
                      <Ionicons name="calendar-number-outline" size={16} color={paidThisMonth ? "#047857" : "#374151"} />
                      <Text style={[styles.periodLabel, paidThisMonth && styles.dateTextPaid]}>
                        {formatPeriodLabel(periodKey)}
                      </Text>
                    </View>

                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.rebateTitle, paidThisMonth && styles.rebateTitlePaid]} numberOfLines={2}>
                          {it.name}
                        </Text>
                        {paidThisMonth && (
                          <View style={styles.paidBadge}>
                            <Ionicons name="checkmark-circle" size={18} color="#047857" />
                            <Text style={styles.paidBadgeText}>Mes cerrado (objetivo alcanzado)</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.rebateAmount, paidThisMonth && styles.rebateAmountPaid]}>
                        {fmtCRC(target)}
                      </Text>
                    </View>

                    {!!(it.description || "").trim() && (
                      <Text style={[styles.rebateDesc, paidThisMonth && styles.rebateDescPaid]} numberOfLines={3}>
                        {it.description}
                      </Text>
                    )}

                    <View style={styles.progressWrap}>
                      <View style={styles.progressBar}>
                        <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
                      </View>
                      <Text style={styles.progressMeta}>
                        Pagado {fmtCRC(paidTotal)} · Pendiente {fmtCRC(remaining)}
                      </Text>
                    </View>

                    <View style={styles.dateRow}>
                      <Ionicons name="calendar-outline" size={16} color={paidThisMonth ? "#047857" : "#374151"} />
                      <Text style={[styles.dateText, paidThisMonth && styles.dateTextPaid]}>
                        Fecha de pago (este mes): {formatDateES(thisDate)}
                      </Text>
                    </View>
                    <View style={styles.dateRow}>
                      <Ionicons name="arrow-forward-circle-outline" size={16} color={paidThisMonth ? "#047857" : "#374151"} />
                      <Text style={[styles.dateText, paidThisMonth && styles.dateTextPaid]}>
                        Siguiente pago: {formatDateES(nextDate)}
                      </Text>
                    </View>

                    {paidThisMonth && period?.completedAt && (
                      <View style={styles.paidAppliedRow}>
                        <Ionicons name="time-outline" size={16} color="#065F46" />
                        <Text style={styles.paidAppliedText}>Cerrado: {formatPaidAt(period.completedAt)}</Text>
                      </View>
                    )}

                    {!paidThisMonth && alertInfo && (
                      <View
                        style={[
                          styles.alertBanner,
                          alertInfo.kind === "soon" ? styles.alertSoon : styles.alertOverdue,
                        ]}
                      >
                        <Ionicons
                          name={alertInfo.kind === "soon" ? "alarm-outline" : "alert-circle-outline"}
                          size={16}
                          color="#111827"
                        />
                        <Text style={styles.alertText}>{alertInfo.label}</Text>
                      </View>
                    )}

                    {!paidThisMonth && (
                      <View style={{ gap: 10 }}>
                        <Text style={styles.partialLabel}>Pago parcial (desde tu saldo)</Text>
                        <View style={styles.partialRow}>
                          <View style={[styles.moneyWrap, { flex: 1, marginTop: 0 }]}>
                            <Text style={styles.moneyPrefix}>₡</Text>
                            <TextInput
                              value={partialStr}
                              onChangeText={(t) =>
                                setPartialInputByRebate((p) => ({ ...p, [it.id]: sanitizeAmount(t) }))
                              }
                              placeholder="Monto"
                              placeholderTextColor="#9CA3AF"
                              keyboardType="number-pad"
                              style={styles.moneyInput}
                              editable={payingId !== it.id}
                            />
                          </View>
                          <Pressable
                            onPress={() => applyPayment(it, partialStr)}
                            disabled={payingId === it.id}
                            style={({ pressed }) => [
                              styles.payBtn,
                              styles.payBtnInline,
                              payingId === it.id && { opacity: 0.5 },
                              pressed && payingId !== it.id && styles.pressed,
                            ]}
                          >
                            <Ionicons name="add-circle-outline" size={18} color="#fff" />
                            <Text style={styles.payBtnText}>{payingId === it.id ? "…" : "Agregar"}</Text>
                          </Pressable>
                        </View>

                        <Pressable
                          onPress={() => completeRemainder(it, remaining)}
                          disabled={payingId === it.id || remaining <= 0}
                          style={({ pressed }) => [
                            styles.completeBtn,
                            (payingId === it.id || remaining <= 0) && { opacity: 0.45 },
                            pressed && payingId !== it.id && remaining > 0 && styles.pressed,
                          ]}
                        >
                          <Ionicons name="checkmark-done-outline" size={18} color="#111827" />
                          <Text style={styles.completeBtnText}>
                            Completar saldo del mes ({fmtCRC(remaining)})
                          </Text>
                        </Pressable>
                      </View>
                    )}

                    {paidThisMonth && (
                      <View style={styles.paidLockedFooter}>
                        <Ionicons name="information-circle-outline" size={18} color="#065F46" />
                        <Text style={styles.paidLockedText}>
                          El próximo mes se abrirá un nuevo ciclo para este rebajo (mismo objetivo mensual).
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </View>

        <Text style={styles.footer}>PartnerLife • Rebajos mensuales</Text>

        <Modal visible={isCreateOpen} animationType="fade" transparent onRequestClose={closeCreate}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.modalOverlay}>
              <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : undefined}
                style={{ width: "100%" }}
              >
                <TouchableWithoutFeedback>
                  <View style={styles.modalCard}>
                    <View style={styles.modalHeader}>
                      <Text style={styles.modalTitle}>Nuevo rebajo</Text>
                      <Pressable onPress={closeCreate} hitSlop={10} style={styles.closeBtn}>
                        <Text style={styles.closeBtnText}>✕</Text>
                      </Pressable>
                    </View>
                    <Text style={styles.modalSub}>Tu compañero debe aprobarlo antes de que puedas usarlo.</Text>

                    <Text style={styles.label}>Nombre</Text>
                    <TextInput
                      value={rebateName}
                      onChangeText={setRebateName}
                      placeholder="Ej: Préstamo carro, Netflix…"
                      placeholderTextColor="#9CA3AF"
                      style={styles.input}
                    />

                    <Text style={[styles.label, { marginTop: 10 }]}>Descripción (opcional)</Text>
                    <TextInput
                      value={rebateDesc}
                      onChangeText={setRebateDesc}
                      placeholder="Detalle o notas"
                      placeholderTextColor="#9CA3AF"
                      style={[styles.input, { minHeight: 72 }]}
                      multiline
                    />

                    <Text style={[styles.label, { marginTop: 10 }]}>Día de pago del mes (1–31)</Text>
                    <TextInput
                      value={paymentDayInput}
                      onChangeText={(t) => setPaymentDayInput(t.replace(/\D/g, ""))}
                      placeholder="Ej: 15"
                      placeholderTextColor="#9CA3AF"
                      keyboardType="number-pad"
                      style={styles.input}
                    />

                    <Text style={[styles.label, { marginTop: 10 }]}>Monto mensual objetivo (CRC)</Text>
                    <View style={styles.moneyWrap}>
                      <Text style={styles.moneyPrefix}>₡</Text>
                      <TextInput
                        value={amountInput}
                        onChangeText={(t) => setAmountInput(sanitizeAmount(t))}
                        placeholder="Ej: 50000"
                        placeholderTextColor="#9CA3AF"
                        keyboardType="number-pad"
                        style={styles.moneyInput}
                      />
                    </View>

                    <View style={{ marginTop: 14, gap: 10 }}>
                      <Pressable
                        style={({ pressed }) => [
                          styles.primaryBtn,
                          pressed && styles.pressed,
                          creating && { opacity: 0.6 },
                        ]}
                        onPress={createRebate}
                        disabled={creating}
                      >
                        <Text style={styles.primaryText}>{creating ? "Enviando…" : "Enviar a aprobación"}</Text>
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

        <Modal visible={isReviewOpen} animationType="fade" transparent onRequestClose={closeReview}>
          <TouchableWithoutFeedback onPress={closeReview}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback>
                <View style={styles.reviewCard}>
                  <View style={styles.reviewTop}>
                    <View style={styles.reviewBadge}>
                      <Ionicons name="calendar-outline" size={18} color="#111827" />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.reviewTitle} numberOfLines={2}>
                        {selected?.name}
                      </Text>
                      <Text style={styles.reviewSub}>
                        {fmtCRC(selected?.amount)} · día {selected?.paymentDay}
                      </Text>
                    </View>
                    <Pressable onPress={closeReview} hitSlop={10} style={styles.closeBtn}>
                      <Text style={styles.closeBtnText}>✕</Text>
                    </Pressable>
                  </View>
                  {!!(selected?.description || "").trim() && (
                    <Text style={styles.reviewBody}>{selected.description}</Text>
                  )}
                  <View style={styles.reviewInfo}>
                    <Ionicons name="information-circle-outline" size={18} color="#111827" />
                    <Text style={styles.reviewInfoText}>
                      {selected?.createdBy === user?.uid
                        ? "Esperando aprobación de tu compañero."
                        : "¿Apruebas este rebajo mensual?"}
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
                          Alert.alert("Rechazar", "¿Eliminar esta propuesta?", [
                            { text: "Cancelar", style: "cancel" },
                            { text: "Rechazar", style: "destructive", onPress: rejectSelected },
                          ]);
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1220" },
  content: { padding: 16, paddingBottom: 26 },
  loadingWrap: { flex: 1, backgroundColor: "#0B1220", alignItems: "center", justifyContent: "center" },
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
  itemName: { fontWeight: "900", color: "#111827", fontSize: 13 },
  itemMeta: { marginTop: 2, fontWeight: "800", color: "#6B7280", fontSize: 12 },
  itemAmount: { fontWeight: "900", color: "#111827" },

  periodRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  periodLabel: { fontWeight: "900", color: "#374151", fontSize: 12, textTransform: "capitalize" },

  rebateCard: {
    padding: 14,
    borderRadius: 16,
    backgroundColor: "rgba(17,24,39,0.04)",
    borderWidth: 1,
    borderColor: "rgba(17,24,39,0.12)",
    gap: 8,
  },
  rebateCardPaid: {
    backgroundColor: "rgba(209,250,229,0.55)",
    borderColor: "rgba(16,185,129,0.45)",
    borderWidth: 1.5,
  },
  rebateTitle: { flex: 1, fontWeight: "900", color: "#111827", fontSize: 15 },
  rebateTitlePaid: { color: "#064E3B" },
  paidBadge: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(16,185,129,0.22)",
    borderWidth: 1,
    borderColor: "rgba(5,150,105,0.35)",
  },
  paidBadgeText: { fontWeight: "900", color: "#065F46", fontSize: 12 },
  rebateAmount: { fontWeight: "900", color: "#111827", fontSize: 15 },
  rebateAmountPaid: { color: "#064E3B" },
  rebateDesc: { color: "#4B5563", fontWeight: "700", fontSize: 13, lineHeight: 18 },
  rebateDescPaid: { color: "#047857" },

  progressWrap: { gap: 6 },
  progressBar: {
    height: 8,
    borderRadius: 999,
    backgroundColor: "rgba(17,24,39,0.08)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "rgba(16,185,129,0.85)",
  },
  progressMeta: { fontSize: 11, fontWeight: "800", color: "#4B5563" },

  dateRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dateText: { flex: 1, color: "#374151", fontWeight: "800", fontSize: 12 },
  dateTextPaid: { color: "#065F46" },
  paidAppliedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: "rgba(236,253,245,0.9)",
    borderWidth: 1,
    borderColor: "rgba(52,211,153,0.4)",
  },
  paidAppliedText: { flex: 1, fontWeight: "800", color: "#065F46", fontSize: 12 },
  paidLockedFooter: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.65)",
    borderWidth: 1,
    borderColor: "rgba(5,150,105,0.25)",
  },
  paidLockedText: { flex: 1, fontWeight: "800", color: "#047857", fontSize: 12, lineHeight: 17 },

  alertBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    marginTop: 4,
  },
  alertSoon: { backgroundColor: "rgba(251,191,36,0.25)", borderWidth: 1, borderColor: "rgba(217,119,6,0.35)" },
  alertOverdue: { backgroundColor: "rgba(248,113,113,0.22)", borderWidth: 1, borderColor: "rgba(185,28,28,0.35)" },
  alertText: { flex: 1, fontWeight: "900", color: "#111827", fontSize: 12 },

  partialLabel: { fontSize: 11, fontWeight: "900", color: "#374151", marginTop: 4 },
  partialRow: { flexDirection: "row", alignItems: "center", gap: 10 },

  payBtn: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "#111827",
  },
  payBtnInline: { marginTop: 0, paddingHorizontal: 14, minWidth: 110 },
  payBtnText: { color: "#fff", fontWeight: "900", fontSize: 14 },

  completeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 1.5,
    borderColor: "#111827",
  },
  completeBtnText: { color: "#111827", fontWeight: "900", fontSize: 13, flex: 1, textAlign: "center" },

  footer: { marginTop: 6, color: "rgba(255,255,255,0.55)", textAlign: "center", fontSize: 12 },
  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },

  lockCard: {
    margin: 16,
    backgroundColor: "rgba(255,255,255,0.97)",
    borderRadius: 18,
    padding: 18,
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
    elevation: 6,
  },
  lockHint: { marginTop: 10, color: "#111827", fontWeight: "900", opacity: 0.75, textAlign: "center" },

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
    minHeight: 48,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
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
  primaryBtn: { width: "100%", paddingVertical: 14, borderRadius: 14, alignItems: "center", backgroundColor: "#111827" },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "900" },
  secondaryBtn: { width: "100%", paddingVertical: 14, borderRadius: 14, alignItems: "center", backgroundColor: "#F3F4F6" },
  secondaryText: { color: "#111827", fontSize: 16, fontWeight: "800" },

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
  reviewTitle: { fontSize: 17, fontWeight: "900", color: "#111827" },
  reviewSub: { marginTop: 4, fontSize: 13, fontWeight: "800", color: "#6B7280" },
  reviewBody: { fontSize: 14, color: "#374151", fontWeight: "700", marginBottom: 10, lineHeight: 20 },
  reviewInfo: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 14 },
  reviewInfoText: { flex: 1, fontSize: 13, fontWeight: "800", color: "#374151", lineHeight: 18 },
  reviewActions: { flexDirection: "row", gap: 10 },
  approveBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
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
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "rgba(254,226,226,0.9)",
    borderWidth: 1,
    borderColor: "rgba(252,165,165,0.9)",
  },
  rejectText: { color: "#991B1B", fontWeight: "900" },
});
