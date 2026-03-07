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
  Switch,
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

export default function ListaScreen({ navigation }) {
  const user = firebaseAuth.currentUser;

  const [profile, setProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  const [savedItems, setSavedItems] = useState([]);
  const [loadingSavedItems, setLoadingSavedItems] = useState(true);

  const [lists, setLists] = useState([]);
  const [loadingLists, setLoadingLists] = useState(true);

  const [selectedList, setSelectedList] = useState(null);
  const [selectedListItems, setSelectedListItems] = useState([]);
  const [loadingSelectedItems, setLoadingSelectedItems] = useState(false);

  // Crear lista
  const [isCreateListOpen, setIsCreateListOpen] = useState(false);
  const [listNameInput, setListNameInput] = useState("");
  const [isDailyInput, setIsDailyInput] = useState(false);
  const [creatingList, setCreatingList] = useState(false);

  // Modal artículos guardados
  const [isSavedItemsOpen, setIsSavedItemsOpen] = useState(false);
  const [savedSearch, setSavedSearch] = useState("");

  // Crear artículo guardado
  const [isCreateSavedItemOpen, setIsCreateSavedItemOpen] = useState(false);
  const [savedItemNameInput, setSavedItemNameInput] = useState("");
  const [savedItemPriceInput, setSavedItemPriceInput] = useState("");
  const [creatingSavedItem, setCreatingSavedItem] = useState(false);

  // Editar artículo guardado
  const [isEditSavedItemOpen, setIsEditSavedItemOpen] = useState(false);
  const [selectedSavedItem, setSelectedSavedItem] = useState(null);
  const [editSavedItemNameInput, setEditSavedItemNameInput] = useState("");
  const [editSavedItemPriceInput, setEditSavedItemPriceInput] = useState("");
  const [savingSavedItemEdit, setSavingSavedItemEdit] = useState(false);

  // Detalle de lista
  const [isListDetailOpen, setIsListDetailOpen] = useState(false);

  // Agregar item manual
  const [isAddManualItemOpen, setIsAddManualItemOpen] = useState(false);
  const [manualItemNameInput, setManualItemNameInput] = useState("");
  const [manualItemPriceInput, setManualItemPriceInput] = useState("");
  const [creatingManualItem, setCreatingManualItem] = useState(false);

  // Agregar desde artículos
  const [isAddFromSavedOpen, setIsAddFromSavedOpen] = useState(false);

  // Editar item de lista
  const [isEditListItemOpen, setIsEditListItemOpen] = useState(false);
  const [selectedListItem, setSelectedListItem] = useState(null);
  const [editListItemNameInput, setEditListItemNameInput] = useState("");
  const [editListItemPriceInput, setEditListItemPriceInput] = useState("");
  const [updateSavedToo, setUpdateSavedToo] = useState(false);
  const [savingListItemEdit, setSavingListItemEdit] = useState(false);

  const sanitizeAmount = (t) => String(t || "").replace(/[^\d]/g, "");
  const groupId = profile?.groupId || "";
  const hasGroup = !!groupId;

  const fmtCRC = (n) => {
    const v = Number(n || 0);
    if (!v) return "—";
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

  /* ---------------- PROFILE ---------------- */
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

  /* ---------------- SAVED ITEMS ---------------- */
  useEffect(() => {
    if (!hasGroup) {
      setSavedItems([]);
      setLoadingSavedItems(false);
      return;
    }

    setLoadingSavedItems(true);
    const colRef = collection(db, "groups", groupId, "savedItems");
    const qRef = query(colRef, orderBy("createdAt", "desc"));

    const unsub = onSnapshot(
      qRef,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setSavedItems(list);
        setLoadingSavedItems(false);
      },
      (e) => {
        setLoadingSavedItems(false);
        Alert.alert("Error", e.message);
      }
    );

    return () => unsub();
  }, [hasGroup, groupId]);

  /* ---------------- LISTS ---------------- */
  useEffect(() => {
    if (!hasGroup) {
      setLists([]);
      setLoadingLists(false);
      return;
    }

    setLoadingLists(true);
    const colRef = collection(db, "groups", groupId, "lists");
    const qRef = query(colRef, orderBy("createdAt", "desc"));

    const unsub = onSnapshot(
      qRef,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setLists(list);
        setLoadingLists(false);
      },
      (e) => {
        setLoadingLists(false);
        Alert.alert("Error", e.message);
      }
    );

    return () => unsub();
  }, [hasGroup, groupId]);

  /* ---------------- SELECTED LIST ITEMS ---------------- */
  useEffect(() => {
    if (!hasGroup || !selectedList?.id || !isListDetailOpen) {
      setSelectedListItems([]);
      return;
    }

    setLoadingSelectedItems(true);
    const colRef = collection(db, "groups", groupId, "lists", selectedList.id, "items");
    const qRef = query(colRef, orderBy("createdAt", "asc"));

    const unsub = onSnapshot(
      qRef,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setSelectedListItems(list);
        setLoadingSelectedItems(false);
      },
      (e) => {
        setLoadingSelectedItems(false);
        Alert.alert("Error", e.message);
      }
    );

    return () => unsub();
  }, [hasGroup, groupId, selectedList?.id, isListDetailOpen]);

  /* ---------------- HELPERS ---------------- */
  const syncListMetrics = useCallback(
    async (listId, items) => {
      if (!hasGroup || !listId) return;

      const totalItems = items.length;
      const checkedItems = items.filter((x) => !!x.checked).length;
      const progress = totalItems ? Math.round((checkedItems / totalItems) * 100) : 0;
      const spentCRC = items.reduce((acc, x) => {
        if (x.checked && typeof x.price === "number") return acc + x.price;
        return acc;
      }, 0);

      const listRef = doc(db, "groups", groupId, "lists", listId);

      await updateDoc(listRef, {
        totalItems,
        checkedItems,
        progress,
        spentCRC,
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid || "",
      });
    },
    [hasGroup, groupId, user?.uid]
  );

  const filteredSavedItems = useMemo(() => {
    const q = String(savedSearch || "").trim().toLowerCase();
    if (!q) return savedItems;
    return savedItems.filter((x) => String(x.name || "").toLowerCase().includes(q));
  }, [savedItems, savedSearch]);

  const completionForSelected = useMemo(() => {
    const total = selectedListItems.length;
    if (!total) return 0;
    const done = selectedListItems.filter((x) => !!x.checked).length;
    return Math.round((done / total) * 100);
  }, [selectedListItems]);

  const spentForSelected = useMemo(() => {
    return selectedListItems.reduce((acc, x) => {
      if (x.checked && typeof x.price === "number") return acc + x.price;
      return acc;
    }, 0);
  }, [selectedListItems]);

  const totalSelectedPrice = useMemo(() => {
    return selectedListItems.reduce((acc, x) => {
      if (typeof x.price === "number") return acc + x.price;
      return acc;
    }, 0);
  }, [selectedListItems]);

  /* ---------------- MODALS OPEN/CLOSE ---------------- */
  const openCreateList = () => {
    setListNameInput("");
    setIsDailyInput(false);
    setIsCreateListOpen(true);
  };

  const closeCreateList = () => {
    setIsCreateListOpen(false);
    Keyboard.dismiss();
  };

  const openSavedItems = () => {
    setSavedSearch("");
    setIsSavedItemsOpen(true);
  };

  const closeSavedItems = () => {
    setIsSavedItemsOpen(false);
  };

  const openCreateSavedItem = () => {
    setSavedItemNameInput("");
    setSavedItemPriceInput("");
    setIsCreateSavedItemOpen(true);
  };

  const closeCreateSavedItem = () => {
    setIsCreateSavedItemOpen(false);
    Keyboard.dismiss();
  };

  const openEditSavedItem = (item) => {
    setSelectedSavedItem(item);
    setEditSavedItemNameInput(item?.name || "");
    setEditSavedItemPriceInput(
      typeof item?.price === "number" ? String(item.price) : ""
    );
    setIsEditSavedItemOpen(true);
  };

  const closeEditSavedItem = () => {
    setIsEditSavedItemOpen(false);
    setSelectedSavedItem(null);
    setEditSavedItemNameInput("");
    setEditSavedItemPriceInput("");
  };

  const openListDetail = (item) => {
    setSelectedList(item);
    setIsListDetailOpen(true);
  };

  const closeListDetail = () => {
    setIsListDetailOpen(false);
    setSelectedList(null);
    setSelectedListItems([]);
  };

  const openAddManualItem = () => {
    setManualItemNameInput("");
    setManualItemPriceInput("");
    setIsAddManualItemOpen(true);
  };

  const closeAddManualItem = () => {
    setIsAddManualItemOpen(false);
    Keyboard.dismiss();
  };

  const openAddFromSaved = () => {
    setSavedSearch("");
    setIsAddFromSavedOpen(true);
  };

  const closeAddFromSaved = () => {
    setIsAddFromSavedOpen(false);
  };

  const openEditListItem = (item) => {
    setSelectedListItem(item);
    setEditListItemNameInput(item?.name || "");
    setEditListItemPriceInput(typeof item?.price === "number" ? String(item.price) : "");
    setUpdateSavedToo(false);
    setIsEditListItemOpen(true);
  };

  const closeEditListItem = () => {
    setIsEditListItemOpen(false);
    setSelectedListItem(null);
    setEditListItemNameInput("");
    setEditListItemPriceInput("");
    setUpdateSavedToo(false);
  };

  /* ---------------- CRUD SAVED ITEMS ---------------- */
  const createSavedItem = useCallback(async () => {
    if (!user?.uid || !hasGroup) return;

    const name = String(savedItemNameInput || "").trim();
    const priceRaw = sanitizeAmount(savedItemPriceInput);
    const price = priceRaw ? Number(priceRaw) : null;

    if (!name) {
      Alert.alert("Dato requerido", "Escribe el nombre del artículo.");
      return;
    }

    try {
      setCreatingSavedItem(true);
      const colRef = collection(db, "groups", groupId, "savedItems");

      await addDoc(colRef, {
        name,
        price: Number.isFinite(price) ? price : null,
        createdAt: serverTimestamp(),
        createdBy: user.uid,
      });

      closeCreateSavedItem();
    } catch (e) {
      Alert.alert("Error", e?.message || "No se pudo crear el artículo.");
    } finally {
      setCreatingSavedItem(false);
    }
  }, [user?.uid, hasGroup, groupId, savedItemNameInput, savedItemPriceInput]);

  const saveSavedItemEdit = useCallback(async () => {
    if (!hasGroup || !selectedSavedItem?.id) return;

    const name = String(editSavedItemNameInput || "").trim();
    const priceRaw = sanitizeAmount(editSavedItemPriceInput);
    const price = priceRaw ? Number(priceRaw) : null;

    if (!name) {
      Alert.alert("Dato requerido", "Escribe el nombre del artículo.");
      return;
    }

    try {
      setSavingSavedItemEdit(true);
      const refDoc = doc(db, "groups", groupId, "savedItems", selectedSavedItem.id);

      await updateDoc(refDoc, {
        name,
        price: Number.isFinite(price) ? price : null,
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid || "",
      });

      closeEditSavedItem();
    } catch (e) {
      Alert.alert("Error", e?.message || "No se pudo guardar.");
    } finally {
      setSavingSavedItemEdit(false);
    }
  }, [
    hasGroup,
    groupId,
    selectedSavedItem?.id,
    editSavedItemNameInput,
    editSavedItemPriceInput,
    user?.uid,
  ]);

  const deleteSavedItem = useCallback(
    async (item) => {
      if (!hasGroup || !item?.id) return;

      try {
        const refDoc = doc(db, "groups", groupId, "savedItems", item.id);
        await deleteDoc(refDoc);
      } catch (e) {
        Alert.alert("Error", e?.message || "No se pudo eliminar.");
      }
    },
    [hasGroup, groupId]
  );

  /* ---------------- CRUD LISTS ---------------- */
  const createList = useCallback(async () => {
    if (!user?.uid || !hasGroup) return;

    const name = String(listNameInput || "").trim();

    if (!name) {
      Alert.alert("Dato requerido", "Escribe el nombre de la lista.");
      return;
    }

    try {
      setCreatingList(true);
      const colRef = collection(db, "groups", groupId, "lists");

      await addDoc(colRef, {
        name,
        isDaily: !!isDailyInput,
        totalItems: 0,
        checkedItems: 0,
        progress: 0,
        spentCRC: 0,
        createdAt: serverTimestamp(),
        createdBy: user.uid,
      });

      closeCreateList();
    } catch (e) {
      Alert.alert("Error", e?.message || "No se pudo crear la lista.");
    } finally {
      setCreatingList(false);
    }
  }, [user?.uid, hasGroup, groupId, listNameInput, isDailyInput]);

  const deleteList = useCallback(
    async (item) => {
      if (!hasGroup || !item?.id) return;

      try {
        const refDoc = doc(db, "groups", groupId, "lists", item.id);
        await deleteDoc(refDoc);
      } catch (e) {
        Alert.alert("Error", e?.message || "No se pudo eliminar la lista.");
      }
    },
    [hasGroup, groupId]
  );

  /* ---------------- CRUD LIST ITEMS ---------------- */
  const addManualItemToList = useCallback(async () => {
    if (!user?.uid || !hasGroup || !selectedList?.id) return;

    const name = String(manualItemNameInput || "").trim();
    const priceRaw = sanitizeAmount(manualItemPriceInput);
    const price = priceRaw ? Number(priceRaw) : null;

    if (!name) {
      Alert.alert("Dato requerido", "Escribe el nombre del artículo.");
      return;
    }

    try {
      setCreatingManualItem(true);

      const colRef = collection(db, "groups", groupId, "lists", selectedList.id, "items");

      await addDoc(colRef, {
        name,
        price: Number.isFinite(price) ? price : null,
        checked: false,
        fromSavedItem: false,
        createdAt: serverTimestamp(),
        createdBy: user.uid,
      });

      const nextItems = [
        ...selectedListItems,
        {
          id: `tmp-${Date.now()}`,
          name,
          price: Number.isFinite(price) ? price : null,
          checked: false,
        },
      ];

      await syncListMetrics(selectedList.id, nextItems);
      closeAddManualItem();
    } catch (e) {
      Alert.alert("Error", e?.message || "No se pudo agregar el artículo.");
    } finally {
      setCreatingManualItem(false);
    }
  }, [
    user?.uid,
    hasGroup,
    groupId,
    selectedList?.id,
    manualItemNameInput,
    manualItemPriceInput,
    selectedListItems,
    syncListMetrics,
  ]);

  const addSavedItemToList = useCallback(
    async (savedItem) => {
      if (!user?.uid || !hasGroup || !selectedList?.id) return;

      try {
        const colRef = collection(db, "groups", groupId, "lists", selectedList.id, "items");

        await addDoc(colRef, {
          name: savedItem.name || "",
          price: typeof savedItem.price === "number" ? savedItem.price : null,
          checked: false,
          fromSavedItem: true,
          sourceSavedItemId: savedItem.id,
          createdAt: serverTimestamp(),
          createdBy: user.uid,
        });

        const nextItems = [
          ...selectedListItems,
          {
            id: `tmp-${Date.now()}`,
            name: savedItem.name || "",
            price: typeof savedItem.price === "number" ? savedItem.price : null,
            checked: false,
            fromSavedItem: true,
            sourceSavedItemId: savedItem.id,
          },
        ];

        await syncListMetrics(selectedList.id, nextItems);
        closeAddFromSaved();
      } catch (e) {
        Alert.alert("Error", e?.message || "No se pudo agregar desde artículos.");
      }
    },
    [user?.uid, hasGroup, groupId, selectedList?.id, selectedListItems, syncListMetrics]
  );

  const toggleItemChecked = useCallback(
    async (item) => {
      if (!hasGroup || !selectedList?.id || !item?.id) return;

      try {
        const nextChecked = !item.checked;

        const itemRef = doc(db, "groups", groupId, "lists", selectedList.id, "items", item.id);
        await updateDoc(itemRef, {
          checked: nextChecked,
          updatedAt: serverTimestamp(),
          updatedBy: user?.uid || "",
        });

        const nextItems = selectedListItems.map((x) =>
          x.id === item.id ? { ...x, checked: nextChecked } : x
        );

        await syncListMetrics(selectedList.id, nextItems);
      } catch (e) {
        Alert.alert("Error", e?.message || "No se pudo actualizar.");
      }
    },
    [hasGroup, groupId, selectedList?.id, selectedListItems, syncListMetrics, user?.uid]
  );

  const saveListItemEdit = useCallback(async () => {
    if (!hasGroup || !selectedList?.id || !selectedListItem?.id) return;

    const name = String(editListItemNameInput || "").trim();
    const priceRaw = sanitizeAmount(editListItemPriceInput);
    const price = priceRaw ? Number(priceRaw) : null;

    if (!name) {
      Alert.alert("Dato requerido", "Escribe el nombre del artículo.");
      return;
    }

    try {
      setSavingListItemEdit(true);

      const itemRef = doc(db, "groups", groupId, "lists", selectedList.id, "items", selectedListItem.id);
      await updateDoc(itemRef, {
        name,
        price: Number.isFinite(price) ? price : null,
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid || "",
      });

      if (
        updateSavedToo &&
        selectedListItem?.fromSavedItem &&
        selectedListItem?.sourceSavedItemId
      ) {
        const savedRef = doc(db, "groups", groupId, "savedItems", selectedListItem.sourceSavedItemId);
        await updateDoc(savedRef, {
          name,
          price: Number.isFinite(price) ? price : null,
          updatedAt: serverTimestamp(),
          updatedBy: user?.uid || "",
        });
      }

      const nextItems = selectedListItems.map((x) =>
        x.id === selectedListItem.id
          ? { ...x, name, price: Number.isFinite(price) ? price : null }
          : x
      );

      await syncListMetrics(selectedList.id, nextItems);
      closeEditListItem();
    } catch (e) {
      Alert.alert("Error", e?.message || "No se pudo guardar.");
    } finally {
      setSavingListItemEdit(false);
    }
  }, [
    hasGroup,
    selectedList?.id,
    selectedListItem,
    editListItemNameInput,
    editListItemPriceInput,
    updateSavedToo,
    groupId,
    user?.uid,
    selectedListItems,
    syncListMetrics,
  ]);

  const deleteListItem = useCallback(
    async (item) => {
      if (!hasGroup || !selectedList?.id || !item?.id) return;

      try {
        const refDoc = doc(db, "groups", groupId, "lists", selectedList.id, "items", item.id);
        await deleteDoc(refDoc);

        const nextItems = selectedListItems.filter((x) => x.id !== item.id);
        await syncListMetrics(selectedList.id, nextItems);
      } catch (e) {
        Alert.alert("Error", e?.message || "No se pudo eliminar.");
      }
    },
    [hasGroup, groupId, selectedList?.id, selectedListItems, syncListMetrics]
  );

  /* ---------------- UI STATES ---------------- */
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

          <Text style={styles.lockTitle}>Artículos bloqueados</Text>
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
        <View style={styles.headerCard}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={styles.iconBadge}>
              <Ionicons name="list-outline" size={18} color="#111827" />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Artículos y listas</Text>
              <Text style={styles.headerSub}>
                Todo lo que guardes aquí lo ven tú y tu compañero.
              </Text>
            </View>
          </View>

          <View style={styles.kpiRow}>
            <View style={styles.kpiBox}>
              <Text style={styles.kpiLabel}>Artículos</Text>
              <Text style={styles.kpiValue}>{savedItems.length}</Text>
            </View>
            <View style={styles.kpiBox}>
              <Text style={styles.kpiLabel}>Listas</Text>
              <Text style={styles.kpiValue}>{lists.length}</Text>
            </View>
            <View style={styles.kpiBox}>
              <Text style={styles.kpiLabel}>Diarias</Text>
              <Text style={styles.kpiValue}>{lists.filter((x) => x.isDaily).length}</Text>
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
            <Pressable onPress={openSavedItems} style={({ pressed }) => [styles.secondaryActionBtn, pressed && styles.pressed]}>
              <Ionicons name="albums-outline" size={18} color="#111827" />
              <Text style={styles.secondaryActionText}>Ver artículos</Text>
            </Pressable>

            <Pressable onPress={openCreateList} style={({ pressed }) => [styles.ctaBtn, pressed && styles.pressed]}>
              <Ionicons name="add-outline" size={18} color="#fff" />
              <Text style={styles.ctaText}>Nueva lista</Text>
            </Pressable>
          </View>
        </View>

        {/* LISTAS */}
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Text style={styles.cardTitle}>Listas del grupo</Text>
            <View style={styles.pillSoft}>
              <Ionicons name="checkmark-done-outline" size={14} color="#111827" />
              <Text style={styles.pillText}>Progreso y gasto</Text>
            </View>
          </View>

          {loadingLists ? (
            <View style={styles.centerBox}>
              <ActivityIndicator />
            </View>
          ) : lists.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="reader-outline" size={18} color="#111827" />
              <Text style={styles.emptyText}>Todavía no hay listas creadas.</Text>
            </View>
          ) : (
            <View style={{ gap: 10, marginTop: 10 }}>
              {lists.map((it) => (
                <Pressable
                  key={it.id}
                  onPress={() => openListDetail(it)}
                  style={({ pressed }) => [styles.listCard, pressed && styles.pressed]}
                >
                  <View style={styles.listCardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemName}>{it.name || "Lista"}</Text>
                      <Text style={styles.itemMeta}>
                        {it.isDaily ? "Lista diaria" : "Lista normal"}
                      </Text>
                    </View>

                    <View style={styles.pillPending}>
                      <Text style={styles.pillText}>{it.isDaily ? "Diaria" : "General"}</Text>
                    </View>
                  </View>

                  <View style={styles.listStatsRow}>
                    <View style={styles.statMini}>
                      <Text style={styles.statMiniLabel}>Items</Text>
                      <Text style={styles.statMiniValue}>{Number(it.totalItems || 0)}</Text>
                    </View>
                    <View style={styles.statMini}>
                      <Text style={styles.statMiniLabel}>Completo</Text>
                      <Text style={styles.statMiniValue}>{Number(it.progress || 0)}%</Text>
                    </View>
                    <View style={styles.statMini}>
                      <Text style={styles.statMiniLabel}>Gastado</Text>
                      <Text style={styles.statMiniValue}>{fmtCRC(Number(it.spentCRC || 0))}</Text>
                    </View>
                  </View>

                  <View style={styles.progressBarWrapSmall}>
                    <View
                      style={[
                        styles.progressBarFill,
                        { width: `${Math.max(0, Math.min(100, Number(it.progress || 0)))}%` },
                      ]}
                    />
                  </View>

                  <View style={styles.listActionsRow}>
                    <Pressable
                      onPress={() =>
                        Alert.alert("Eliminar lista", "¿Deseas eliminar esta lista?", [
                          { text: "Cancelar", style: "cancel" },
                          { text: "Eliminar", style: "destructive", onPress: () => deleteList(it) },
                        ])
                      }
                      style={({ pressed }) => [styles.deleteMiniBtn, pressed && { opacity: 0.7 }]}
                    >
                      <Ionicons name="trash-outline" size={14} color="#991B1B" />
                      <Text style={styles.deleteMiniText}>Eliminar</Text>
                    </Pressable>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        <Text style={styles.footer}>PartnerLife • MoniJuro™</Text>

        {/* MODAL ARTÍCULOS GUARDADOS */}
        <Modal visible={isSavedItemsOpen} animationType="fade" transparent onRequestClose={closeSavedItems}>
          <TouchableWithoutFeedback onPress={closeSavedItems}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback>
                <View style={styles.reviewCard}>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Artículos guardados</Text>
                    <Pressable onPress={closeSavedItems} hitSlop={10} style={styles.closeBtn}>
                      <Text style={styles.closeBtnText}>✕</Text>
                    </Pressable>
                  </View>

                  <TextInput
                    value={savedSearch}
                    onChangeText={setSavedSearch}
                    placeholder="Buscar artículo..."
                    placeholderTextColor="#9CA3AF"
                    style={styles.input}
                  />

                  <Pressable
                    onPress={openCreateSavedItem}
                    style={({ pressed }) => [styles.primaryBtn, { marginTop: 12 }, pressed && styles.pressed]}
                  >
                    <Text style={styles.primaryText}>Nuevo artículo</Text>
                  </Pressable>

                  <View style={[styles.todayList, { marginTop: 12 }]}>
                    <ScrollView style={{ maxHeight: 340 }}>
                      {loadingSavedItems ? (
                        <View style={{ padding: 14, alignItems: "center" }}>
                          <ActivityIndicator />
                        </View>
                      ) : filteredSavedItems.length === 0 ? (
                        <View style={{ padding: 14 }}>
                          <Text style={{ color: "#6B7280", fontWeight: "800" }}>
                            No hay artículos guardados.
                          </Text>
                        </View>
                      ) : (
                        filteredSavedItems.map((item) => (
                          <Pressable
                            key={item.id}
                            onPress={() => openEditSavedItem(item)}
                            style={({ pressed }) => [styles.savedPickerRow, pressed && styles.pressed]}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={styles.itemName}>{item.name}</Text>
                              <Text style={styles.itemMeta}>
                                {typeof item.price === "number" ? fmtCRC(item.price) : "Sin precio"}
                              </Text>
                            </View>
                            <Ionicons name="create-outline" size={20} color="#111827" />
                          </Pressable>
                        ))
                      )}
                    </ScrollView>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>

        {/* MODAL CREAR ARTÍCULO */}
        <Modal visible={isCreateSavedItemOpen} animationType="fade" transparent onRequestClose={closeCreateSavedItem}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.modalOverlay}>
              <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ width: "100%" }}>
                <TouchableWithoutFeedback>
                  <View style={styles.modalCard}>
                    <View style={styles.modalHeader}>
                      <Text style={styles.modalTitle}>Nuevo artículo</Text>
                      <Pressable onPress={closeCreateSavedItem} hitSlop={10} style={styles.closeBtn}>
                        <Text style={styles.closeBtnText}>✕</Text>
                      </Pressable>
                    </View>

                    <Text style={styles.modalSub}>Guárdalo para reutilizarlo luego en listas.</Text>

                    <Text style={styles.label}>Nombre</Text>
                    <TextInput
                      value={savedItemNameInput}
                      onChangeText={setSavedItemNameInput}
                      placeholder="Ej: Arroz"
                      placeholderTextColor="#9CA3AF"
                      style={styles.input}
                    />

                    <Text style={[styles.label, { marginTop: 10 }]}>Precio (opcional)</Text>
                    <View style={styles.moneyWrap}>
                      <Text style={styles.moneyPrefix}>₡</Text>
                      <TextInput
                        value={savedItemPriceInput}
                        onChangeText={(t) => setSavedItemPriceInput(sanitizeAmount(t))}
                        placeholder="Ej: 2500"
                        placeholderTextColor="#9CA3AF"
                        keyboardType="number-pad"
                        style={styles.moneyInput}
                      />
                    </View>

                    <View style={{ marginTop: 14, gap: 10 }}>
                      <Pressable
                        style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed, creatingSavedItem && { opacity: 0.6 }]}
                        onPress={createSavedItem}
                        disabled={creatingSavedItem}
                      >
                        <Text style={styles.primaryText}>
                          {creatingSavedItem ? "Guardando..." : "Guardar artículo"}
                        </Text>
                      </Pressable>

                      <Pressable style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]} onPress={closeCreateSavedItem}>
                        <Text style={styles.secondaryText}>Cancelar</Text>
                      </Pressable>
                    </View>
                  </View>
                </TouchableWithoutFeedback>
              </KeyboardAvoidingView>
            </View>
          </TouchableWithoutFeedback>
        </Modal>

        {/* MODAL EDITAR ARTÍCULO GUARDADO */}
        <Modal visible={isEditSavedItemOpen} animationType="fade" transparent onRequestClose={closeEditSavedItem}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.modalOverlay}>
              <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ width: "100%" }}>
                <TouchableWithoutFeedback>
                  <View style={styles.modalCard}>
                    <View style={styles.modalHeader}>
                      <Text style={styles.modalTitle}>Editar artículo</Text>
                      <Pressable onPress={closeEditSavedItem} hitSlop={10} style={styles.closeBtn}>
                        <Text style={styles.closeBtnText}>✕</Text>
                      </Pressable>
                    </View>

                    <Text style={styles.label}>Nombre</Text>
                    <TextInput
                      value={editSavedItemNameInput}
                      onChangeText={setEditSavedItemNameInput}
                      placeholder="Nombre"
                      placeholderTextColor="#9CA3AF"
                      style={styles.input}
                    />

                    <Text style={[styles.label, { marginTop: 10 }]}>Precio</Text>
                    <View style={styles.moneyWrap}>
                      <Text style={styles.moneyPrefix}>₡</Text>
                      <TextInput
                        value={editSavedItemPriceInput}
                        onChangeText={(t) => setEditSavedItemPriceInput(sanitizeAmount(t))}
                        placeholder="Ej: 2500"
                        placeholderTextColor="#9CA3AF"
                        keyboardType="number-pad"
                        style={styles.moneyInput}
                      />
                    </View>

                    <View style={{ marginTop: 14, gap: 10 }}>
                      <Pressable
                        style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed, savingSavedItemEdit && { opacity: 0.6 }]}
                        onPress={saveSavedItemEdit}
                        disabled={savingSavedItemEdit}
                      >
                        <Text style={styles.primaryText}>
                          {savingSavedItemEdit ? "Guardando..." : "Guardar cambios"}
                        </Text>
                      </Pressable>

                      <Pressable
                        style={({ pressed }) => [styles.dangerBtn, pressed && styles.pressed]}
                        onPress={() => {
                          Alert.alert("Eliminar artículo", "¿Deseas eliminar este artículo?", [
                            { text: "Cancelar", style: "cancel" },
                            {
                              text: "Eliminar",
                              style: "destructive",
                              onPress: async () => {
                                try {
                                  await deleteSavedItem(selectedSavedItem);
                                  closeEditSavedItem();
                                } catch {}
                              },
                            },
                          ]);
                        }}
                      >
                        <Text style={styles.dangerText}>Eliminar artículo</Text>
                      </Pressable>

                      <Pressable style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]} onPress={closeEditSavedItem}>
                        <Text style={styles.secondaryText}>Cerrar</Text>
                      </Pressable>
                    </View>
                  </View>
                </TouchableWithoutFeedback>
              </KeyboardAvoidingView>
            </View>
          </TouchableWithoutFeedback>
        </Modal>

        {/* MODAL CREAR LISTA */}
        <Modal visible={isCreateListOpen} animationType="fade" transparent onRequestClose={closeCreateList}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.modalOverlay}>
              <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ width: "100%" }}>
                <TouchableWithoutFeedback>
                  <View style={styles.modalCard}>
                    <View style={styles.modalHeader}>
                      <Text style={styles.modalTitle}>Nueva lista</Text>
                      <Pressable onPress={closeCreateList} hitSlop={10} style={styles.closeBtn}>
                        <Text style={styles.closeBtnText}>✕</Text>
                      </Pressable>
                    </View>

                    <Text style={styles.modalSub}>Crea una lista normal o una lista diaria.</Text>

                    <Text style={styles.label}>Nombre de la lista</Text>
                    <TextInput
                      value={listNameInput}
                      onChangeText={setListNameInput}
                      placeholder="Ej: Compras quincena"
                      placeholderTextColor="#9CA3AF"
                      style={styles.input}
                    />

                    <View style={styles.switchRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.label}>¿Lista diaria?</Text>
                        <Text style={styles.switchSub}>
                          Si está activa, podrás seguir agregando artículos en cualquier momento.
                        </Text>
                      </View>
                      <Switch value={isDailyInput} onValueChange={setIsDailyInput} />
                    </View>

                    <View style={{ marginTop: 14, gap: 10 }}>
                      <Pressable
                        style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed, creatingList && { opacity: 0.6 }]}
                        onPress={createList}
                        disabled={creatingList}
                      >
                        <Text style={styles.primaryText}>
                          {creatingList ? "Creando..." : "Crear lista"}
                        </Text>
                      </Pressable>

                      <Pressable style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]} onPress={closeCreateList}>
                        <Text style={styles.secondaryText}>Cancelar</Text>
                      </Pressable>
                    </View>
                  </View>
                </TouchableWithoutFeedback>
              </KeyboardAvoidingView>
            </View>
          </TouchableWithoutFeedback>
        </Modal>

        {/* MODAL DETALLE LISTA */}
        <Modal visible={isListDetailOpen} animationType="fade" transparent onRequestClose={closeListDetail}>
          <TouchableWithoutFeedback onPress={closeListDetail}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback>
                <View style={styles.reviewCard}>
                  <View style={styles.reviewTop}>
                    <View style={styles.reviewBadge}>
                      <Ionicons name="checkbox-outline" size={18} color="#111827" />
                    </View>

                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.reviewTitle} numberOfLines={1}>
                        {selectedList?.name || "Lista"}
                      </Text>
                      <Text style={styles.reviewSub}>
                        {selectedList?.isDaily ? "Lista diaria" : "Lista normal"} • {completionForSelected}% completo
                      </Text>
                    </View>

                    <Pressable onPress={closeListDetail} hitSlop={10} style={styles.closeBtn}>
                      <Text style={styles.closeBtnText}>✕</Text>
                    </Pressable>
                  </View>

                  <View style={styles.kpiRow}>
                    <View style={styles.kpiBoxLight}>
                      <Text style={styles.kpiLabelDark}>Items</Text>
                      <Text style={styles.kpiValueDark}>{selectedListItems.length}</Text>
                    </View>
                    <View style={styles.kpiBoxLight}>
                      <Text style={styles.kpiLabelDark}>Completado</Text>
                      <Text style={styles.kpiValueDark}>{completionForSelected}%</Text>
                    </View>
                    <View style={styles.kpiBoxLight}>
                      <Text style={styles.kpiLabelDark}>Gastado</Text>
                      <Text style={styles.kpiValueDark}>{fmtCRC(spentForSelected)}</Text>
                    </View>
                  </View>

                  <View style={styles.kpiRow}>
                    <View style={styles.kpiBoxLight}>
                      <Text style={styles.kpiLabelDark}>Total lista</Text>
                      <Text style={styles.kpiValueDark}>{fmtCRC(totalSelectedPrice)}</Text>
                    </View>
                    <View style={styles.kpiBoxLight}>
                      <Text style={styles.kpiLabelDark}>Confirmados</Text>
                      <Text style={styles.kpiValueDark}>
                        {selectedListItems.filter((x) => !!x.checked).length}
                      </Text>
                    </View>
                    <View style={styles.kpiBoxLight}>
                      <Text style={styles.kpiLabelDark}>Pendientes</Text>
                      <Text style={styles.kpiValueDark}>
                        {selectedListItems.filter((x) => !x.checked).length}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.progressBarWrap}>
                    <View style={[styles.progressBarFill, { width: `${completionForSelected}%` }]} />
                  </View>

                  <View style={styles.detailActions}>
                    <Pressable onPress={openAddManualItem} style={({ pressed }) => [styles.primaryMiniBtn, pressed && styles.pressed]}>
                      <Ionicons name="add-outline" size={16} color="#fff" />
                      <Text style={styles.primaryMiniText}>Añadir manual</Text>
                    </Pressable>

                    <Pressable onPress={openAddFromSaved} style={({ pressed }) => [styles.secondaryMiniBtn, pressed && styles.pressed]}>
                      <Ionicons name="search-outline" size={16} color="#111827" />
                      <Text style={styles.secondaryMiniText}>Desde artículos</Text>
                    </Pressable>
                  </View>

                  <View style={[styles.todayList, { marginTop: 12 }]}>
                    <ScrollView style={{ maxHeight: 320 }}>
                      {loadingSelectedItems ? (
                        <View style={{ padding: 14, alignItems: "center" }}>
                          <ActivityIndicator />
                        </View>
                      ) : selectedListItems.length === 0 ? (
                        <View style={{ padding: 14 }}>
                          <Text style={{ color: "#6B7280", fontWeight: "800" }}>
                            No hay artículos en esta lista.
                          </Text>
                        </View>
                      ) : (
                        selectedListItems.map((item) => (
                          <View key={item.id} style={styles.todayItem}>
                            <Pressable onPress={() => toggleItemChecked(item)} style={styles.checkBtn}>
                              <Ionicons
                                name={item.checked ? "checkbox" : "square-outline"}
                                size={24}
                                color={item.checked ? "#16A34A" : "#6B7280"}
                              />
                            </Pressable>

                            <View style={{ flex: 1 }}>
                              <View style={styles.todayRowTop}>
                                <Text
                                  style={[
                                    styles.todayItemTitle,
                                    item.checked && { textDecorationLine: "line-through", opacity: 0.6 },
                                  ]}
                                >
                                  {item.name || "Artículo"}
                                </Text>
                                {!!item.price && <Text style={styles.todayTime}>{fmtCRC(item.price)}</Text>}
                              </View>

                              <Text style={styles.todayText}>
                                {item.fromSavedItem ? "Agregado desde artículos guardados" : "Agregado manualmente"}
                              </Text>

                              <View style={{ flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                                <Pressable
                                  onPress={() => openEditListItem(item)}
                                  style={({ pressed }) => [styles.editMiniBtn, pressed && { opacity: 0.7 }]}
                                >
                                  <Ionicons name="create-outline" size={14} color="#111827" />
                                  <Text style={styles.editMiniText}>Editar</Text>
                                </Pressable>

                                <Pressable
                                  onPress={() =>
                                    Alert.alert("Eliminar", "¿Deseas quitar este artículo de la lista?", [
                                      { text: "Cancelar", style: "cancel" },
                                      { text: "Eliminar", style: "destructive", onPress: () => deleteListItem(item) },
                                    ])
                                  }
                                  style={({ pressed }) => [styles.deleteMiniBtn, pressed && { opacity: 0.7 }]}
                                >
                                  <Ionicons name="trash-outline" size={14} color="#991B1B" />
                                  <Text style={styles.deleteMiniText}>Eliminar</Text>
                                </Pressable>
                              </View>
                            </View>
                          </View>
                        ))
                      )}
                    </ScrollView>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>

        {/* MODAL AGREGAR MANUAL */}
        <Modal visible={isAddManualItemOpen} animationType="fade" transparent onRequestClose={closeAddManualItem}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.modalOverlay}>
              <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ width: "100%" }}>
                <TouchableWithoutFeedback>
                  <View style={styles.modalCard}>
                    <View style={styles.modalHeader}>
                      <Text style={styles.modalTitle}>Añadir artículo</Text>
                      <Pressable onPress={closeAddManualItem} hitSlop={10} style={styles.closeBtn}>
                        <Text style={styles.closeBtnText}>✕</Text>
                      </Pressable>
                    </View>

                    <Text style={styles.modalSub}>Agrega un artículo manualmente a la lista.</Text>

                    <Text style={styles.label}>Nombre</Text>
                    <TextInput
                      value={manualItemNameInput}
                      onChangeText={setManualItemNameInput}
                      placeholder="Ej: Huevos"
                      placeholderTextColor="#9CA3AF"
                      style={styles.input}
                    />

                    <Text style={[styles.label, { marginTop: 10 }]}>Precio (opcional)</Text>
                    <View style={styles.moneyWrap}>
                      <Text style={styles.moneyPrefix}>₡</Text>
                      <TextInput
                        value={manualItemPriceInput}
                        onChangeText={(t) => setManualItemPriceInput(sanitizeAmount(t))}
                        placeholder="Ej: 1800"
                        placeholderTextColor="#9CA3AF"
                        keyboardType="number-pad"
                        style={styles.moneyInput}
                      />
                    </View>

                    <View style={{ marginTop: 14, gap: 10 }}>
                      <Pressable
                        style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed, creatingManualItem && { opacity: 0.6 }]}
                        onPress={addManualItemToList}
                        disabled={creatingManualItem}
                      >
                        <Text style={styles.primaryText}>
                          {creatingManualItem ? "Agregando..." : "Agregar a la lista"}
                        </Text>
                      </Pressable>

                      <Pressable style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]} onPress={closeAddManualItem}>
                        <Text style={styles.secondaryText}>Cancelar</Text>
                      </Pressable>
                    </View>
                  </View>
                </TouchableWithoutFeedback>
              </KeyboardAvoidingView>
            </View>
          </TouchableWithoutFeedback>
        </Modal>

        {/* MODAL AÑADIR DESDE ARTÍCULOS */}
        <Modal visible={isAddFromSavedOpen} animationType="fade" transparent onRequestClose={closeAddFromSaved}>
          <TouchableWithoutFeedback onPress={closeAddFromSaved}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback>
                <View style={styles.modalCard}>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Añadir desde artículos</Text>
                    <Pressable onPress={closeAddFromSaved} hitSlop={10} style={styles.closeBtn}>
                      <Text style={styles.closeBtnText}>✕</Text>
                    </Pressable>
                  </View>

                  <TextInput
                    value={savedSearch}
                    onChangeText={setSavedSearch}
                    placeholder="Buscar artículo guardado..."
                    placeholderTextColor="#9CA3AF"
                    style={styles.input}
                  />

                  <View style={[styles.todayList, { marginTop: 12 }]}>
                    <ScrollView style={{ maxHeight: 320 }}>
                      {filteredSavedItems.length === 0 ? (
                        <View style={{ padding: 14 }}>
                          <Text style={{ color: "#6B7280", fontWeight: "800" }}>
                            No se encontraron artículos.
                          </Text>
                        </View>
                      ) : (
                        filteredSavedItems.map((item) => (
                          <Pressable
                            key={item.id}
                            onPress={() => addSavedItemToList(item)}
                            style={({ pressed }) => [styles.savedPickerRow, pressed && styles.pressed]}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={styles.itemName}>{item.name}</Text>
                              <Text style={styles.itemMeta}>
                                {typeof item.price === "number" ? fmtCRC(item.price) : "Sin precio"}
                              </Text>
                            </View>
                            <Ionicons name="add-circle-outline" size={22} color="#111827" />
                          </Pressable>
                        ))
                      )}
                    </ScrollView>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>

        {/* MODAL EDITAR ITEM DE LISTA */}
        <Modal visible={isEditListItemOpen} animationType="fade" transparent onRequestClose={closeEditListItem}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.modalOverlay}>
              <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ width: "100%" }}>
                <TouchableWithoutFeedback>
                  <View style={styles.modalCard}>
                    <View style={styles.modalHeader}>
                      <Text style={styles.modalTitle}>Editar artículo de lista</Text>
                      <Pressable onPress={closeEditListItem} hitSlop={10} style={styles.closeBtn}>
                        <Text style={styles.closeBtnText}>✕</Text>
                      </Pressable>
                    </View>

                    <Text style={styles.label}>Nombre</Text>
                    <TextInput
                      value={editListItemNameInput}
                      onChangeText={setEditListItemNameInput}
                      placeholder="Nombre"
                      placeholderTextColor="#9CA3AF"
                      style={styles.input}
                    />

                    <Text style={[styles.label, { marginTop: 10 }]}>Precio</Text>
                    <View style={styles.moneyWrap}>
                      <Text style={styles.moneyPrefix}>₡</Text>
                      <TextInput
                        value={editListItemPriceInput}
                        onChangeText={(t) => setEditListItemPriceInput(sanitizeAmount(t))}
                        placeholder="Ej: 2500"
                        placeholderTextColor="#9CA3AF"
                        keyboardType="number-pad"
                        style={styles.moneyInput}
                      />
                    </View>

                    {selectedListItem?.fromSavedItem ? (
                      <View style={styles.switchRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.label}>Actualizar artículo guardado</Text>
                          <Text style={styles.switchSub}>
                            Si activas esto, el nuevo precio también se guardará en el artículo base.
                          </Text>
                        </View>
                        <Switch value={updateSavedToo} onValueChange={setUpdateSavedToo} />
                      </View>
                    ) : null}

                    <View style={{ marginTop: 14, gap: 10 }}>
                      <Pressable
                        style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed, savingListItemEdit && { opacity: 0.6 }]}
                        onPress={saveListItemEdit}
                        disabled={savingListItemEdit}
                      >
                        <Text style={styles.primaryText}>
                          {savingListItemEdit ? "Guardando..." : "Guardar cambios"}
                        </Text>
                      </Pressable>

                      <Pressable style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]} onPress={closeEditListItem}>
                        <Text style={styles.secondaryText}>Cancelar</Text>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1220" },
  content: { padding: 16, paddingBottom: 26 },

  loadingWrap: {
    flex: 1,
    backgroundColor: "#0B1220",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
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

  kpiBoxLight: {
    flex: 1,
    backgroundColor: "rgba(17,24,39,0.03)",
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(17,24,39,0.10)",
  },

  kpiLabelDark: { color: "#6B7280", fontWeight: "800", fontSize: 11 },
  kpiValueDark: { marginTop: 6, color: "#111827", fontWeight: "900", fontSize: 14 },

  ctaBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "#111827",
  },
  ctaText: { color: "#fff", fontWeight: "900" },

  secondaryActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "#fff",
  },
  secondaryActionText: { color: "#111827", fontWeight: "900" },

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

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
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

  pillSoft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(17,24,39,0.05)",
    borderWidth: 1,
    borderColor: "rgba(17,24,39,0.10)",
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

  emptyText: {
    flex: 1,
    color: "#111827",
    fontWeight: "800",
    opacity: 0.85,
    fontSize: 12,
    lineHeight: 16,
  },

  centerBox: { paddingVertical: 16, alignItems: "center", justifyContent: "center" },

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

  itemLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  itemDotPink: {
    width: 10,
    height: 10,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#EC4899",
  },

  itemName: { fontWeight: "900", color: "#111827", fontSize: 13 },
  itemMeta: { marginTop: 2, fontWeight: "800", color: "#6B7280", fontSize: 12 },

  listCard: {
    padding: 14,
    borderRadius: 16,
    backgroundColor: "rgba(17,24,39,0.03)",
    borderWidth: 1,
    borderColor: "rgba(17,24,39,0.10)",
  },

  listCardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  listStatsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },

  statMini: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },

  statMiniLabel: { color: "#6B7280", fontWeight: "800", fontSize: 11 },
  statMiniValue: { marginTop: 4, color: "#111827", fontWeight: "900", fontSize: 12 },

  progressLabel: { color: "#6B7280", fontWeight: "800", fontSize: 12 },

  progressBarWrapSmall: {
    marginTop: 10,
    height: 10,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "#E5E7EB",
  },

  listActionsRow: { marginTop: 10, flexDirection: "row", justifyContent: "flex-end" },

  footer: { marginTop: 6, color: "rgba(255,255,255,0.55)", textAlign: "center", fontSize: 12 },
  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },

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
  lockSub: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: "800",
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 16,
  },

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

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.60)",
    justifyContent: "center",
    padding: 18,
  },

  modalCard: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 18,
  },

  reviewCard: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 18,
  },

  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },

  modalTitle: { fontSize: 18, fontWeight: "900", color: "#111827" },
  modalSub: { fontSize: 13, opacity: 0.7, marginBottom: 14, color: "#111827" },

  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
  },

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

  moneyPrefix: {
    paddingHorizontal: 14,
    fontWeight: "900",
    color: "#111827",
    opacity: 0.9,
    fontSize: 16,
  },

  moneyInput: {
    flex: 1,
    height: 48,
    paddingHorizontal: 10,
    color: "#111827",
    fontWeight: "800",
    fontSize: 16,
  },

  primaryBtn: {
    width: "100%",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    backgroundColor: "#111827",
  },

  primaryText: { color: "#fff", fontSize: 16, fontWeight: "900" },

  secondaryBtn: {
    width: "100%",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    backgroundColor: "#F3F4F6",
  },

  secondaryText: { color: "#111827", fontSize: 16, fontWeight: "800" },

  dangerBtn: {
    width: "100%",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    backgroundColor: "rgba(239,68,68,0.10)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.22)",
  },

  dangerText: { color: "#991B1B", fontSize: 16, fontWeight: "900" },

  switchRow: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: "rgba(17,24,39,0.03)",
    borderWidth: 1,
    borderColor: "rgba(17,24,39,0.10)",
  },

  switchSub: {
    marginTop: 4,
    color: "#6B7280",
    fontWeight: "700",
    fontSize: 12,
    lineHeight: 16,
  },

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

  progressBarWrap: {
    marginTop: 12,
    height: 12,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "#E5E7EB",
  },

  progressBarFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#16A34A",
  },

  detailActions: { marginTop: 12, flexDirection: "row", gap: 10 },

  primaryMiniBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "#111827",
  },

  primaryMiniText: { color: "#fff", fontWeight: "900" },

  secondaryMiniBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "#F3F4F6",
  },

  secondaryMiniText: { color: "#111827", fontWeight: "900" },

  todayList: { borderRadius: 16, borderWidth: 1, borderColor: "#E5E7EB", overflow: "hidden" },

  todayItem: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F7",
    backgroundColor: "#FAFAFA",
  },

  todayRowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },

  todayItemTitle: { fontWeight: "900", color: "#111827" },
  todayTime: { fontWeight: "900", color: "#111827", opacity: 0.8, fontSize: 12 },
  todayText: { color: "#111827", fontWeight: "700", opacity: 0.85, fontSize: 12 },

  checkBtn: {
    width: 28,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 2,
  },

  savedPickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F7",
    backgroundColor: "#FAFAFA",
  },

  editMiniBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: "rgba(17,24,39,0.06)",
    borderWidth: 1,
    borderColor: "rgba(17,24,39,0.12)",
  },

  editMiniText: { color: "#111827", fontWeight: "900", fontSize: 12 },

  deleteMiniBtn: {
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
});