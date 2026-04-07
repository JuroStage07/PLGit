import React from "react";
import { View, StyleSheet } from "react-native";

/** Marca de colores al estilo Google (azul, rojo, amarillo, verde). */
export default function GoogleLogoMark({ size = 22 }) {
  const h = size;
  const w = Math.round(size * 0.92);
  return (
    <View style={[styles.wrap, { width: w, height: h, borderRadius: h * 0.12 }]}>
      <View style={[styles.col, { backgroundColor: "#4285F4" }]} />
      <View style={[styles.col, { backgroundColor: "#EA4335" }]} />
      <View style={[styles.col, { backgroundColor: "#FBBC05" }]} />
      <View style={[styles.col, { backgroundColor: "#34A853" }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    overflow: "hidden",
  },
  col: {
    flex: 1,
    height: "100%",
  },
});
