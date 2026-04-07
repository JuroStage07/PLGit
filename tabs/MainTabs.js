import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  Keyboard,
  ScrollView,
  ActivityIndicator,
} from "react-native";

import { Calendar, LocaleConfig } from "react-native-calendars";

import {
  collection,
  doc,
  getDocs,
  query,
  where,
  addDoc,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";

import { db, auth as firebaseAuth } from "../firebaseConfig";
import { signOut } from "firebase/auth";
import { PL } from "../theme/plTheme";
import LoveBubbleBackground from "../components/LoveBubbleBackground";
import { useDialog } from "../context/DialogContext";

import { useNavigation } from "@react-navigation/native";
import { onSnapshot } from "firebase/firestore";

// Tabs
import PerfilScreen from "./PerfilScreen";
import PartnerScreen from "./PartnerScreen";
import AhorrosScreen from "./AhorrosScreen";
import SolicitudesScreen from './SolicitudScreen';
import MiSaldoScreen from './MiSaldoScreen';
import ListaScreen from "./ListaScreen";
import RebajosMensualesScreen from "./RebajosMensuales";

const Tab = createBottomTabNavigator();

/** ✅ Español para el calendario */
LocaleConfig.locales['es'] = {
  monthNames: [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ],
  monthNamesShort: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
  dayNames: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
  dayNamesShort: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
  today: 'Hoy',
};
LocaleConfig.defaultLocale = 'es';

const ListaDeseos = () => (
  <View style={styles.screen}>
    <View style={styles.deseosGlowRose} pointerEvents="none" />
    <View style={styles.deseosGlowSky} pointerEvents="none" />
    <View style={styles.deseosCard}>
      <View style={styles.deseosIconRing}>
        <View style={styles.deseosIconInner}>
          <FontAwesome5 name="gift" size={26} color={PL.roseBright} />
        </View>
      </View>
      <Text style={styles.deseosTitle}>Lista de deseos</Text>
      <Text style={styles.deseosSub}>
        Muy pronto podrás anotar regalos, metas y sorpresas para tu pareja, con un toque especial.
      </Text>
      <View style={styles.deseosDots}>
        <View style={[styles.deseosDot, { backgroundColor: PL.rose }]} />
        <View style={[styles.deseosDot, { backgroundColor: PL.sky }]} />
        <View style={[styles.deseosDot, { backgroundColor: PL.roseBright }]} />
      </View>
      <View style={styles.deseosBadge}>
        <Text style={styles.deseosBadgeText}>Próximamente</Text>
      </View>
    </View>
  </View>
);

function RequireGroup({ children }) {
  const navigation = useNavigation();
  const user = firebaseAuth.currentUser;

  const [loading, setLoading] = useState(true);
  const [hasGroup, setHasGroup] = useState(false);

  useEffect(() => {
    if (!user?.uid) {
      setHasGroup(false);
      setLoading(false);
      return;
    }

    const refDoc = doc(db, "users", user.uid);

    const unsub = onSnapshot(
      refDoc,
      (snap) => {
        const data = snap.data() || {};
        setHasGroup(!!data.groupId);
        setLoading(false);
      },
      () => {
        setHasGroup(false);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [user?.uid]);

  if (loading) {
    return (
      <View style={[styles.lockWrap, { justifyContent: "center" }]}>
        <ActivityIndicator />
        <Text style={styles.lockTitle}>Cargando…</Text>
      </View>
    );
  }

  if (!hasGroup) {
    return (
      <View style={styles.lockDarkWrap}>
        <View style={styles.lockCard}>
          <View style={styles.lockBadge}>
            <Ionicons name="lock-closed-outline" size={18} color={PL.skyDeep} />
          </View>

          <Text style={styles.lockTitleDark}>Funciones bloqueadas</Text>
          <Text style={styles.lockSubDark}>
            Estas se activan cuando creas un grupo con tu compañero.
            Ve a “Partner” y crea tu grupo para empezar.
          </Text>

          <Pressable
            onPress={() => navigation.navigate("Partner")}
            style={({ pressed }) => [
              styles.lockBigPlusBtn,
              pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
            ]}
          >
            <Ionicons name="add" size={34} color="#fff" />
          </Pressable>

          <Text style={styles.lockHintDark}>Crear grupo</Text>
        </View>
      </View>
    );
  }

  return children;
}

export default function MainTabs() {
  const { info, confirm } = useDialog();
  const user = firebaseAuth.currentUser;

  //calendario 
  const [groupId, setGroupId] = useState("");

  // Modales
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isDayOpen, setIsDayOpen] = useState(false);
  const [isTodayNotesOpen, setIsTodayNotesOpen] = useState(false);

  // Fechas / selección
  const [selectedDay, setSelectedDay] = useState(null); // "YYYY-MM-DD"

  // Conteo por día (para marcar)
  const [notesCountByDate, setNotesCountByDate] = useState({}); // {date: count}

  // Lista del día
  const [dayNotes, setDayNotes] = useState([]); // [{id, note, time}]
  const [noteText, setNoteText] = useState("");
  const [noteTime, setNoteTime] = useState("");

  // Lista de hoy (modal al abrir)
  const [todayNotesList, setTodayNotesList] = useState([]);

  const todayStr = useMemo(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  const daysCol = useMemo(() => {
    if (!groupId) return null;
    return collection(db, "groups", groupId, "calendarNotes");
  }, [groupId]);

  const closeCalendar = () => setIsCalendarOpen(false);

  const closeDayModal = () => {
    setIsDayOpen(false);
    Keyboard.dismiss();
    setNoteText("");
    setNoteTime("");
  };

  /** ✅ HH:MM (opcional) */
  const isValidTime = (t) => {
    if (!t) return true;
    return /^([01]\d|2[0-3]):([0-5]\d)$/.test(t.trim());
  };

  const itemsColForDay = useCallback((dayStr) => {
    if (!groupId || !dayStr) return null;

    return collection(db, "groups", groupId, "calendarNotes", dayStr, "items");
  }, [groupId]);

  /** ✅ borrar notas de días pasados (subcolecciones + doc día) */
  const cleanupOldNotes = useCallback(async () => {
    if (!daysCol || !groupId) return;

    const qOldDays = query(daysCol, where("date", "<", todayStr));
    const oldDaysSnap = await getDocs(qOldDays);

    for (const dayDoc of oldDaysSnap.docs) {
      const dayId = dayDoc.id; // YYYY-MM-DD

      // ✅ AHORA ES EN GROUPS, NO USERS
      const itemsCol = collection(db, "groups", groupId, "calendarNotes", dayId, "items");
      const itemsSnap = await getDocs(itemsCol);

      await Promise.all(itemsSnap.docs.map((d) => deleteDoc(d.ref)));

      // borrar el doc del día
      await deleteDoc(dayDoc.ref);
    }
  }, [daysCol, todayStr, groupId]);

  /** ✅ cargar conteo por día (para marcar calendario) */
  const loadCounts = useCallback(async () => {
    if (!daysCol) return;

    const qDays = query(daysCol, where("date", ">=", todayStr));
    const snap = await getDocs(qDays);

    const map = {};
    snap.forEach((d) => {
      const data = d.data() || {};
      if (data.date) map[data.date] = Number(data.count || 0);
    });

    setNotesCountByDate(map);
  }, [daysCol, todayStr]);

  /** ✅ cargar notas de un día */
  const loadDayNotes = useCallback(async (dayStr) => {
    const colRef = itemsColForDay(dayStr);
    if (!colRef) return;

    const snap = await getDocs(colRef);
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    list.sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
    setDayNotes(list);
  }, [itemsColForDay]);

  /** ✅ modal de hoy al abrir */
  const loadTodayNotesAndPopup = useCallback(async () => {
    if (!user?.uid) return;

    const todayItems = itemsColForDay(todayStr);
    if (!todayItems) return;

    const snap = await getDocs(todayItems);
    if (snap.empty) return;

    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .filter(x => (x.note || "").trim().length > 0)
      .sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));

    if (list.length > 0) {
      setTodayNotesList(list);
      setIsTodayNotesOpen(true);
    }
  }, [itemsColForDay, todayStr, user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;

    const refDoc = doc(db, "users", user.uid);
    const unsub = onSnapshot(refDoc, (snap) => {
      const data = snap.data() || {};
      setGroupId(data.groupId || "");
    });

    return () => unsub();
  }, [user?.uid]);

  /** ✅ al abrir app: limpiar pasadas, cargar conteos, mostrar notas de hoy si existen */
  useEffect(() => {
    if (!groupId) return;

    (async () => {
      try {
        await cleanupOldNotes();
        await loadCounts();
        await loadTodayNotesAndPopup();
      } catch (e) {
        info("Error", e.message);
      }
    })();
  }, [groupId, cleanupOldNotes, loadCounts, loadTodayNotesAndPopup, info]);

  /** ✅ al abrir modal calendario: refrescar conteos (por si cambió algo) */
  useEffect(() => {
    if (!isCalendarOpen || !groupId) return;

    (async () => {
      try {
        await cleanupOldNotes();
        await loadCounts();
      } catch (e) {
        info("Error", e.message);
      }
    })();
  }, [isCalendarOpen, groupId, cleanupOldNotes, loadCounts, info]);

  /** ✅ tocar día: abrir lista del día + cargar items */
  const onDayPress = async (day) => {
    const dateStr = day.dateString;
    setSelectedDay(dateStr);
    setIsDayOpen(true);

    try {
      await loadDayNotes(dateStr);
    } catch (e) {
      info("Error", e.message);
    }
  };

  /** ✅ agregar nota al día seleccionado */
  const addNote = async () => {
    if (!selectedDay || !user?.uid) return;

    const trimmed = noteText.trim();
    const timeTrim = noteTime.trim();

    if (!trimmed) {
      info("Dato requerido", "Escribe una nota.");
      return;
    }
    if (!isValidTime(timeTrim)) {
      info("Hora inválida", "Usa formato 24h: HH:MM (ej: 08:30).");
      return;
    }

    try {
      // 1) agregar item
      const colRef = itemsColForDay(selectedDay);
      await addDoc(colRef, {
        note: trimmed,
        time: timeTrim,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
      });

      // 2) recargar items
      await loadDayNotes(selectedDay);

      // 3) recalcular conteo y guardar metadata del día (date + count)
      const itemsSnap = await getDocs(colRef);
      const count = itemsSnap.size;

      const dayDocRef = doc(db, "groups", groupId, "calendarNotes", selectedDay);
      await setDoc(dayDocRef, { date: selectedDay, count }, { merge: true });

      // 4) refrescar conteos en UI
      setNotesCountByDate((prev) => ({ ...prev, [selectedDay]: count }));

      // limpiar inputs
      setNoteText("");
      setNoteTime("");
      Keyboard.dismiss();
    } catch (e) {
      info("Error", e.message);
    }
  };

  /** ✅ borrar una nota específica */
  const deleteItem = async (itemId) => {
    if (!selectedDay || !user?.uid) return;

    try {
      const itemRef = doc(db, "groups", groupId, "calendarNotes", selectedDay, "items", itemId);
      await deleteDoc(itemRef);

      // recargar y actualizar conteo
      const colRef = itemsColForDay(selectedDay);
      await loadDayNotes(selectedDay);

      const itemsSnap = await getDocs(colRef);
      const count = itemsSnap.size;

      const dayDocRef = doc(db, "groups", groupId, "calendarNotes", selectedDay);
      if (count === 0) {
        // si ya no hay items, borramos doc día para que no quede basura
        await deleteDoc(dayDocRef);
        setNotesCountByDate((prev) => {
          const copy = { ...prev };
          delete copy[selectedDay];
          return copy;
        });
      } else {
        await setDoc(dayDocRef, { date: selectedDay, count }, { merge: true });
        setNotesCountByDate((prev) => ({ ...prev, [selectedDay]: count }));
      }
    } catch (e) {
      info("Error", e.message);
    }
  };

  /** ✅ marcado: círculo rojo contorno si count > 0, hoy texto rosado */
  const markedDates = useMemo(() => {
    const marked = {};

    Object.keys(notesCountByDate).forEach((d) => {
      if ((notesCountByDate[d] || 0) > 0) {
        marked[d] = {
          customStyles: {
            container: {
              borderWidth: 2,
              borderColor: PL.sky,
              backgroundColor: "rgba(56,189,248,0.08)",
              borderRadius: 16,
            },
            text: {
              color: PL.ink,
              fontWeight: "800",
            },
          },
        };
      }
    });

    marked[todayStr] = {
      ...(marked[todayStr] || {}),
      customStyles: {
        ...(marked[todayStr]?.customStyles || {}),
        text: {
          ...(marked[todayStr]?.customStyles?.text || {}),
          color: PL.rose,
          fontWeight: "900",
        },
      },
    };

    if (selectedDay) {
      marked[selectedDay] = {
        ...(marked[selectedDay] || {}),
        customStyles: {
          container: {
            ...(marked[selectedDay]?.customStyles?.container || {}),
            borderColor: PL.roseBright,
          },
          text: {
            ...(marked[selectedDay]?.customStyles?.text || {}),
            fontWeight: "900",
          },
        },
      };
    }

    return marked;
  }, [notesCountByDate, todayStr, selectedDay]);

  return (
    <View style={{ flex: 1, backgroundColor: "transparent" }}>
      <LoveBubbleBackground />
      <Tab.Navigator
        initialRouteName="Perfil"
        sceneContainerStyle={{ backgroundColor: "transparent", flex: 1 }}
        style={{ backgroundColor: "transparent", flex: 1 }}
        screenOptions={({ route }) => ({
          headerTitleAlign: "center",
          headerStatusBarHeight: 0,
          headerStyle: {
            height: 52,
            elevation: 0,
            shadowOpacity: 0,
            backgroundColor: PL.headerBg,
            borderBottomWidth: 1,
            borderBottomColor: PL.headerBorder,
          },
          headerTintColor: PL.text,
          headerTitleStyle: { fontWeight: "800", fontSize: 17, color: PL.text },
          tabBarShowLabel: false,
          tabBarActiveTintColor: PL.tabActive,
          tabBarInactiveTintColor: PL.tabInactive,
          tabBarStyle: {
            height: 64,
            paddingBottom: 10,
            paddingTop: 8,
            backgroundColor: PL.tabBarBg,
            borderTopWidth: 1,
            borderTopColor: PL.skyBorder,
            shadowColor: "#f472b6",
            shadowOpacity: 0.12,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: -4 },
            elevation: 8,
          },

          headerLeft: () => (
            <Pressable
              onPress={() => setIsCalendarOpen(true)}
              style={({ pressed }) => [
                styles.headerBtn,
                { marginLeft: 12, marginRight: 0 },
                pressed && { opacity: 0.75 },
              ]}
              hitSlop={10}
            >
              <Ionicons name="calendar-outline" size={22} color={PL.sky} />
            </Pressable>
          ),

          headerRight: () => (
            <Pressable
              onPress={() => {
                confirm("Cerrar sesión", "¿Seguro que deseas cerrar sesión?", {
                  confirmText: "Cerrar",
                  cancelText: "Cancelar",
                  destructive: true,
                  onConfirm: async () => {
                    try {
                      await signOut(firebaseAuth);
                      info("Sesión cerrada", "Has cerrado sesión correctamente.");
                    } catch (e) {
                      info("Error", e.message);
                    }
                  },
                });
              }}
              style={({ pressed }) => [
                styles.headerBtn,
                pressed && { opacity: 0.75 },
              ]}
              hitSlop={10}
            >
              <Ionicons name="log-out-outline" size={22} color={PL.roseBright} />
            </Pressable>
          ),

          tabBarIcon: ({ color, size }) => {
            switch (route.name) {
              case 'Rebajos':
                return <MaterialCommunityIcons name="calendar-month" size={size} color={color} />;
              case 'Ahorros':
                return <Ionicons name="wallet-outline" size={size} color={color} />;
              case 'Solicitud':
                return <Ionicons name="document-text-outline" size={size} color={color} />;
              case 'Articulos':
                return <Ionicons name="list-outline" size={size} color={color} />;
              case 'Perfil':
                return <Ionicons name="settings-outline" size={size} color={color} />;
              case 'Deseos':
                return <FontAwesome5 name="gift" size={size - 2} color={color} />;
              default:
                return <Ionicons name="apps-outline" size={size} color={color} />;
              case 'Partner':
                return <Ionicons name="heart-outline" size={size} color={color} />;

            }
          },
        })}
      >
        <Tab.Screen
          name="Rebajos"
          options={{ title: 'Rebajos mensuales' }}
        >
          {() => (
            <RequireGroup>
              <RebajosMensualesScreen />
            </RequireGroup>
          )}
        </Tab.Screen>

        <Tab.Screen
          name="Ahorros"
          component={AhorrosScreen}
          options={{
            title:
              'Ahorros'

          }}
        />

        <Tab.Screen name="Solicitud" options={{ title: "Solicitud" }}>
          {() => (
            <RequireGroup>
              <SolicitudesScreen />
            </RequireGroup>
          )}
        </Tab.Screen>

        <Tab.Screen name="Mi Saldo" options={{ title: "Mi Saldo" }}>
          {() => (
            <RequireGroup>
              <MiSaldoScreen />
            </RequireGroup>
          )}
        </Tab.Screen>

        <Tab.Screen name="Articulos" options={{ title: 'Artículos' }}>
          {() => (
            <RequireGroup>
              <ListaScreen />
            </RequireGroup>
          )}
        </Tab.Screen>

        {/* Partner y Perfil normales */}
        <Tab.Screen name="Partner" component={PartnerScreen} options={{ title: 'Partner' }} />
        <Tab.Screen name="Perfil" component={PerfilScreen} options={{ title: 'Perfil' }} />

        <Tab.Screen name="Deseos" options={{ title: 'Lista de deseos' }}>
          {() => (
            <RequireGroup>
              <ListaDeseos />
            </RequireGroup>
          )}
        </Tab.Screen>
      </Tab.Navigator>

      {/* ✅ MODAL CALENDARIO */}
      <Modal visible={isCalendarOpen} animationType="fade" transparent onRequestClose={closeCalendar}>
        <TouchableWithoutFeedback onPress={closeCalendar}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
              <TouchableWithoutFeedback>
                <View style={styles.calendarCard}>
                  <View style={styles.calendarHeader}>
                    <Text style={styles.calendarTitle}>Calendario</Text>
                    <Pressable onPress={closeCalendar} hitSlop={10} style={styles.closeBtn}>
                      <Text style={styles.closeBtnText}>✕</Text>
                    </Pressable>
                  </View>

                  <Text style={styles.calendarSubtitle}>
                    Toca un día para ver y agregar notas.
                  </Text>

                  <View style={styles.calendarWrap}>
                    <Calendar
                      current={todayStr}
                      markingType="custom"
                      markedDates={markedDates}
                      onDayPress={onDayPress}
                      theme={{
                        backgroundColor: "#fff",
                        calendarBackground: "#f8fafc",
                        textSectionTitleColor: PL.textSubtle,
                        dayTextColor: PL.ink,
                        textDisabledColor: "#cbd5e1",
                        arrowColor: PL.skyDeep,
                        monthTextColor: PL.ink,
                        textDayFontWeight: "700",
                        textMonthFontWeight: "900",
                        textDayHeaderFontWeight: "800",
                      }}
                    />
                  </View>

                  <Pressable style={styles.calendarOkBtn} onPress={closeCalendar}>
                    <Text style={styles.calendarOkText}>Listo</Text>
                  </Pressable>
                </View>
              </TouchableWithoutFeedback>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ✅ MODAL LISTA DEL DÍA */}
      <Modal visible={isDayOpen} animationType="fade" transparent onRequestClose={closeDayModal}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
              <TouchableWithoutFeedback>
                <View style={styles.noteCard}>
                  <View style={styles.calendarHeader}>
                    <Text style={styles.calendarTitle}>Notas • {selectedDay || ""}</Text>
                    <Pressable onPress={closeDayModal} hitSlop={10} style={styles.closeBtn}>
                      <Text style={styles.closeBtnText}>✕</Text>
                    </Pressable>
                  </View>

                  <Text style={styles.calendarSubtitle}>Agrega varias notas para este día.</Text>

                  {/* Formulario */}
                  <Text style={styles.label}>Hora (opcional)</Text>
                  <TextInput
                    value={noteTime}
                    onChangeText={setNoteTime}
                    placeholder="Ej: 08:30"
                    placeholderTextColor="#9CA3AF"
                    style={styles.timeInput}
                    keyboardType="numbers-and-punctuation"
                    returnKeyType="next"
                  />

                  <Text style={[styles.label, { marginTop: 10 }]}>Nota</Text>
                  <TextInput
                    value={noteText}
                    onChangeText={setNoteText}
                    placeholder="Escribe tu nota…"
                    placeholderTextColor="#9CA3AF"
                    style={styles.noteInput}
                    multiline
                  />

                  <Pressable style={styles.calendarOkBtn} onPress={addNote}>
                    <Text style={styles.calendarOkText}>Agregar nota</Text>
                  </Pressable>

                  {/* Lista */}
                  <Text style={[styles.label, { marginTop: 14 }]}>Lista</Text>

                  <View style={styles.todayList}>
                    <ScrollView style={{ maxHeight: 220 }}>
                      {dayNotes.length === 0 ? (
                        <View style={{ padding: 12 }}>
                          <Text style={{ color: "#6B7280", fontWeight: "700" }}>
                            No hay notas para este día.
                          </Text>
                        </View>
                      ) : (
                        dayNotes.map((item) => (
                          <View key={item.id} style={styles.todayItem}>
                            <View style={styles.todayDot} />
                            <View style={{ flex: 1 }}>
                              <View style={styles.todayRowTop}>
                                <Text style={styles.todayItemTitle}>Nota</Text>
                                {!!item.time && <Text style={styles.todayTime}>⏰ {item.time}</Text>}
                              </View>
                              <Text style={styles.todayText}>{item.note}</Text>

                              <Pressable
                                onPress={() => {
                                  confirm("Eliminar nota", "¿Deseas eliminar esta nota?", {
                                    confirmText: "Eliminar",
                                    cancelText: "Cancelar",
                                    destructive: true,
                                    onConfirm: () => deleteItem(item.id),
                                  });
                                }}
                                style={({ pressed }) => [styles.deleteMiniBtn, pressed && { opacity: 0.7 }]}
                              >
                                <Ionicons name="trash-outline" size={14} color="#991B1B" />
                                <Text style={styles.deleteMiniText}>Eliminar</Text>
                              </Pressable>
                            </View>
                          </View>
                        ))
                      )}
                    </ScrollView>
                  </View>

                  <Text style={styles.noteHint}>
                    Las notas de días pasados se eliminan automáticamente.
                  </Text>
                </View>
              </TouchableWithoutFeedback>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ✅ MODAL NOTAS DE HOY (al abrir app) */}
      <Modal
        visible={isTodayNotesOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setIsTodayNotesOpen(false)}
      >
        <TouchableWithoutFeedback onPress={() => setIsTodayNotesOpen(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.todayCard}>
                <View style={styles.todayHeader}>
                  <View style={styles.todayBadge}>
                    <Ionicons name="notifications-outline" size={16} color={PL.skyDeep} />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.todayTitle}>Notas de hoy</Text>
                    <Text style={styles.todaySub}>Tienes {todayNotesList.length} nota(s) para {todayStr}</Text>
                  </View>

                  <Pressable onPress={() => setIsTodayNotesOpen(false)} style={styles.closeBtn} hitSlop={10}>
                    <Text style={styles.closeBtnText}>✕</Text>
                  </Pressable>
                </View>

                <View style={styles.todayList}>
                  <ScrollView style={{ maxHeight: 260 }}>
                    {todayNotesList.map((item) => (
                      <View key={item.id} style={styles.todayItem}>
                        <View style={styles.todayDot} />
                        <View style={{ flex: 1 }}>
                          <View style={styles.todayRowTop}>
                            <Text style={styles.todayItemTitle}>Nota</Text>
                            {!!item.time && <Text style={styles.todayTime}>⏰ {item.time}</Text>}
                          </View>
                          <Text style={styles.todayText}>{item.note}</Text>
                        </View>
                      </View>
                    ))}
                  </ScrollView>
                </View>

                <Pressable style={styles.todayOkBtn} onPress={() => setIsTodayNotesOpen(false)}>
                  <Text style={styles.todayOkText}>Entendido</Text>
                </Pressable>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    overflow: 'hidden',
  },
  deseosGlowRose: {
    position: 'absolute',
    top: '18%',
    left: -60,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: PL.bgGlowRose,
  },
  deseosGlowSky: {
    position: 'absolute',
    bottom: '12%',
    right: -50,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: PL.bgGlowSky,
  },
  deseosCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: PL.cardOnDark,
    borderRadius: 24,
    paddingVertical: 28,
    paddingHorizontal: 22,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: PL.glassBorder,
  },
  deseosIconRing: {
    padding: 3,
    borderRadius: 999,
    backgroundColor: PL.skyLight,
    borderWidth: 1,
    borderColor: PL.skyBorder,
  },
  deseosIconInner: {
    width: 72,
    height: 72,
    borderRadius: 999,
    backgroundColor: PL.roseLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: PL.roseBorder,
  },
  deseosTitle: { fontSize: 22, fontWeight: '900', color: PL.text, letterSpacing: 0.2 },
  deseosSub: {
    marginTop: 12,
    fontSize: 14,
    color: PL.textMuted,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 21,
  },
  deseosDots: { flexDirection: 'row', gap: 8, marginTop: 18 },
  deseosDot: { width: 8, height: 8, borderRadius: 4 },
  deseosBadge: {
    marginTop: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: PL.skyMuted,
    borderWidth: 1,
    borderColor: PL.skyBorder,
  },
  deseosBadgeText: { fontSize: 12, fontWeight: '900', color: PL.sky, letterSpacing: 0.5 },

  headerBtn: {
    marginRight: 12,
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PL.glass,
    borderWidth: 1,
    borderColor: PL.glassBorder,
  },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.60)', justifyContent: 'center', padding: 18 },

  calendarCard: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },

  noteCard: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },

  calendarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  calendarTitle: { fontSize: 18, fontWeight: '900', color: PL.ink },

  closeBtn: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: PL.surfaceMuted },
  closeBtnText: { fontSize: 16, fontWeight: '900', color: PL.ink },

  calendarSubtitle: { fontSize: 13, opacity: 0.85, marginBottom: 10, color: PL.textSubtle },

  calendarWrap: { borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: PL.skyBorder },

  calendarOkBtn: { marginTop: 12, backgroundColor: PL.cta, borderRadius: 14, paddingVertical: 12, alignItems: "center" },
  calendarOkText: { color: "#fff", fontWeight: "900", fontSize: 15 },

  label: { fontSize: 12, fontWeight: "900", color: PL.ink },

  timeInput: {
    height: 46,
    borderRadius: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: PL.skyBorder,
    backgroundColor: PL.surfaceMuted,
    color: PL.ink,
    fontWeight: '800',
  },

  noteInput: {
    marginTop: 6,
    minHeight: 90,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: PL.skyBorder,
    backgroundColor: PL.surfaceMuted,
    color: PL.ink,
    fontWeight: '700',
    textAlignVertical: 'top',
  },

  noteHint: { marginTop: 10, fontSize: 12, color: PL.textSubtle, lineHeight: 16, textAlign: "center" },

  // Modal hoy y lista
  todayCard: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  todayHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  todayBadge: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: 'rgba(236,72,153,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(236,72,153,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayTitle: { fontSize: 16, fontWeight: '900', color: PL.ink },
  todaySub: { marginTop: 2, fontSize: 12, color: PL.textSubtle, fontWeight: '700' },

  todayList: { borderRadius: 16, borderWidth: 1, borderColor: PL.skyBorder, overflow: 'hidden' },
  todayItem: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: PL.borderLight,
    backgroundColor: PL.surfaceMuted,
  },
  todayDot: {
    width: 10,
    height: 10,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: PL.rose,
    marginTop: 6,
  },
  todayRowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  todayItemTitle: { fontWeight: '900', color: PL.ink },
  todayTime: { fontWeight: '900', color: PL.skyDeep, opacity: 0.95, fontSize: 12 },
  todayText: { color: PL.ink, fontWeight: '700', opacity: 0.85 },

  todayOkBtn: { marginTop: 12, backgroundColor: PL.cta, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  todayOkText: { color: '#fff', fontWeight: '900', fontSize: 15 },

  deleteMiniBtn: {
    marginTop: 10,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: "rgba(239,68,68,0.10)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.25)",
  },
  deleteMiniText: { color: "#991B1B", fontWeight: "900", fontSize: 12 },

  lockWrap: {
    flex: 1,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  lockTitle: {
    marginTop: 10,
    fontSize: 18,
    fontWeight: "900",
    color: PL.ink,
    textAlign: "center",
  },
  lockSub: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: "700",
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 18,
    maxWidth: 320,
  },
  bigPlusBtn: {
    marginTop: 18,
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
  lockHint: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: "900",
    color: PL.ink,
    opacity: 0.8,
  },

  lockDarkWrap: {
    flex: 1,
    backgroundColor: 'transparent',
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },

  lockCard: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: "rgba(255,255,255,0.97)",
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: PL.skyBorder,
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
    backgroundColor: PL.roseLight,
    borderWidth: 1,
    borderColor: PL.roseBorder,
    alignItems: "center",
    justifyContent: "center",
  },

  lockTitleDark: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: "900",
    color: PL.ink,
    textAlign: "center",
  },

  lockSubDark: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: "800",
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 16,
    maxWidth: 320,
  },

  lockBigPlusBtn: {
    marginTop: 16,
    width: 74,
    height: 74,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PL.cta,
    borderWidth: 2,
    borderColor: PL.roseBorder,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },

  lockHintDark: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: "900",
    color: PL.ink,
    opacity: 0.8,
  },
});
