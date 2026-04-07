import React, { useEffect, useRef } from "react";
import { StyleSheet, View, Animated, Dimensions, Easing } from "react-native";
import { PL } from "../theme/plTheme";

const { width: W, height: H } = Dimensions.get("window");

/** Burbujas neón (rosa / celeste) con movimiento suave y velocidades distintas */
const ORBS = [
  { size: 112, lx: 0.02, ty: 0.06, rose: true, duration: 16000, delay: 0, ax: 26, ay: 32 },
  { size: 76, lx: 0.78, ty: 0.1, rose: false, duration: 9500, delay: 200, ax: 20, ay: 24 },
  { size: 128, lx: 0.08, ty: 0.42, rose: false, duration: 20000, delay: 400, ax: 28, ay: 22 },
  { size: 88, lx: 0.62, ty: 0.52, rose: true, duration: 12000, delay: 100, ax: 22, ay: 30 },
  { size: 52, lx: 0.38, ty: 0.22, rose: true, duration: 7200, delay: 0, ax: 14, ay: 18 },
  { size: 96, lx: 0.52, ty: 0.68, rose: false, duration: 14000, delay: 500, ax: 24, ay: 18 },
  { size: 64, lx: 0.05, ty: 0.62, rose: false, duration: 10500, delay: 300, ax: 18, ay: 26 },
  { size: 44, lx: 0.88, ty: 0.38, rose: true, duration: 6800, delay: 150, ax: 12, ay: 14 },
  { size: 58, lx: 0.45, ty: 0.78, rose: true, duration: 8800, delay: 600, ax: 16, ay: 20 },
  { size: 72, lx: 0.22, ty: 0.88, rose: false, duration: 11000, delay: 250, ax: 20, ay: 16 },
];

function NeonOrb({ cfg }) {
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(t, {
          toValue: 1,
          duration: cfg.duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(t, {
          toValue: 0,
          duration: cfg.duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    const timer = setTimeout(() => anim.start(), cfg.delay);
    return () => {
      clearTimeout(timer);
      anim.stop();
    };
  }, [cfg.delay, cfg.duration, t]);

  const translateX = t.interpolate({
    inputRange: [0, 1],
    outputRange: [-cfg.ax, cfg.ax],
  });
  const translateY = t.interpolate({
    inputRange: [0, 1],
    outputRange: [cfg.ay, -cfg.ay],
  });
  const scale = t.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.08, 1],
  });

  const bg = cfg.rose ? PL.bubbleFillRose : PL.bubbleFillSky;
  const border = cfg.rose ? PL.bubbleStrokeRose : PL.bubbleStrokeSky;
  const glow = cfg.rose ? PL.bubbleGlowRose : PL.bubbleGlowSky;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.orb,
        {
          width: cfg.size,
          height: cfg.size,
          borderRadius: cfg.size / 2,
          left: cfg.lx * W,
          top: cfg.ty * H,
          backgroundColor: bg,
          borderColor: border,
          shadowColor: glow,
          transform: [{ translateX }, { translateY }, { scale }],
        },
      ]}
    />
  );
}

export default function LoveBubbleBackground() {
  return (
    <View style={styles.wrap} pointerEvents="none">
      {ORBS.map((cfg, i) => (
        <NeonOrb key={i} cfg={cfg} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
    zIndex: 0,
    elevation: 0,
  },
  orb: {
    position: "absolute",
    borderWidth: 2,
    shadowOpacity: 0.55,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    /** Sin elevation: en Android no compite por capa con las pantallas nativas */
    elevation: 0,
  },
});
