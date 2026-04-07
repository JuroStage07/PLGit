import React, { createContext, useCallback, useContext, useState } from "react";
import { Modal, View, Text, Pressable, StyleSheet } from "react-native";
import { PL } from "../theme/plTheme";

const DialogContext = createContext(null);

export function DialogProvider({ children }) {
  const [dialog, setDialog] = useState(null);

  const close = useCallback(() => setDialog(null), []);

  const info = useCallback((title, message) => {
    setDialog({ type: "info", title: String(title || ""), message: String(message || "") });
  }, []);

  const confirm = useCallback((title, message, opts = {}) => {
    const {
      onConfirm,
      onCancel,
      confirmText = "Aceptar",
      cancelText = "Cancelar",
      destructive = false,
    } = opts;
    setDialog({
      type: "confirm",
      title: String(title || ""),
      message: String(message || ""),
      confirmText,
      cancelText,
      destructive,
      onConfirm: () => {
        setDialog(null);
        onConfirm?.();
      },
      onCancel: () => {
        setDialog(null);
        onCancel?.();
      },
    });
  }, []);

  const onBackdrop = () => {
    if (dialog?.type === "confirm") {
      dialog.onCancel?.();
    } else {
      close();
    }
  };

  return (
    <DialogContext.Provider value={{ info, confirm }}>
      {children}
      <Modal visible={!!dialog} transparent animationType="fade" onRequestClose={onBackdrop}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onBackdrop} />
          {dialog ? (
            <View style={styles.card}>
              <Text style={styles.title}>{dialog.title}</Text>
              <Text style={styles.message}>{dialog.message}</Text>
              {dialog.type === "info" ? (
                <Pressable style={[styles.btnPrimary, { marginTop: 16 }]} onPress={close}>
                  <Text style={styles.btnPrimaryText}>Entendido</Text>
                </Pressable>
              ) : (
                <View style={styles.row}>
                  <Pressable style={[styles.btnGhost, { flex: 1 }]} onPress={() => dialog.onCancel?.()}>
                    <Text style={styles.btnGhostText}>{dialog.cancelText}</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.btnPrimary, { flex: 1 }, dialog.destructive && styles.btnDestructive]}
                    onPress={() => dialog.onConfirm?.()}
                  >
                    <Text style={styles.btnPrimaryText}>{dialog.confirmText}</Text>
                  </Pressable>
                </View>
              )}
            </View>
          ) : null}
        </View>
      </Modal>
    </DialogContext.Provider>
  );
}

export function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    throw new Error("useDialog debe usarse dentro de DialogProvider");
  }
  return ctx;
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 22,
  },
  card: {
    backgroundColor: PL.surface,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: PL.skyBorder,
    maxWidth: 400,
    alignSelf: "center",
    width: "100%",
    zIndex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: "900",
    color: PL.ink,
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    fontWeight: "600",
    color: PL.textMuted,
    lineHeight: 20,
  },
  row: {
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
  },
  btnPrimary: {
    backgroundColor: PL.cta,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  btnDestructive: {
    backgroundColor: PL.rose,
  },
  btnPrimaryText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 15,
  },
  btnGhost: {
    backgroundColor: PL.surfaceMuted,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: PL.borderLight,
  },
  btnGhostText: {
    color: PL.ink,
    fontWeight: "800",
    fontSize: 15,
  },
});
