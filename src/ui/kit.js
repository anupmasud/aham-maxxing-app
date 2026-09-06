/* ==========================================================================
   Shared look and small pieces, so the four screens stay about their own job.
   Warm paper, the same palette the web version uses.
   ========================================================================== */

import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

export const C = {
  paper: "#FBF7F0",
  card: "#FFFFFF",
  sunk: "#F2EBE0",
  ink: "#1F1A15",
  ink2: "#6B6055",
  ink3: "#9A8E80",
  rule: "#E4DACB",
  ruleSoft: "#EFE7DA",
  good: "#3F7D5B",
  goodSoft: "#E3F0E7",
  warn: "#B5761E",
  warnSoft: "#F8ECD8",
  over: "#B4443A",
  overSoft: "#F8E2DF",
  accent: "#2F6D8C",
};

export const S = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.paper },
  pad: { paddingHorizontal: 18 },
  scrollPad: { paddingBottom: 40, paddingTop: 4 },

  h1: { fontSize: 27, fontWeight: "700", color: C.ink, letterSpacing: -0.3 },
  h2: { fontSize: 17, fontWeight: "700", color: C.ink },
  body: { fontSize: 15, lineHeight: 22, color: C.ink2 },
  muted: { fontSize: 12.5, color: C.ink2, lineHeight: 18 },
  tiny: { fontSize: 11, color: C.ink3 },

  card: {
    backgroundColor: C.card, borderWidth: 1, borderColor: C.ruleSoft,
    borderRadius: 14, overflow: "hidden", marginBottom: 14,
  },
  cardPad: { padding: 14 },

  row: { flexDirection: "row", alignItems: "center" },
  rule: { height: 1, backgroundColor: C.ruleSoft },

  input: {
    backgroundColor: C.card, borderWidth: 1, borderColor: C.rule, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: C.ink,
  },
  label: { fontSize: 11.5, fontWeight: "700", color: C.ink2, marginBottom: 5 },
  error: { color: C.over, fontSize: 13, lineHeight: 19, marginTop: 12 },
  empty: { color: C.ink2, fontSize: 14, textAlign: "center", paddingVertical: 30, lineHeight: 21 },
});

/* ---------------------------------------------------------------- button -- */

export function Btn({ label, onPress, primary, danger, small, style, disabled }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        b.base,
        small && b.small,
        primary && b.primary,
        danger && b.danger,
        (pressed || disabled) && { opacity: disabled ? 0.4 : 0.7 },
        style,
      ]}
    >
      <Text style={[b.text, small && b.textSmall, primary && b.textPrimary, danger && b.textDanger]}>
        {label}
      </Text>
    </Pressable>
  );
}

const b = StyleSheet.create({
  base: {
    borderWidth: 1, borderColor: C.rule, backgroundColor: C.card, borderRadius: 10,
    paddingVertical: 12, paddingHorizontal: 16, alignItems: "center", marginTop: 9,
  },
  small: { paddingVertical: 8, paddingHorizontal: 12, marginTop: 0, borderRadius: 9 },
  primary: { backgroundColor: C.ink, borderColor: C.ink },
  danger: { borderColor: C.over, backgroundColor: "transparent" },
  text: { fontSize: 15, fontWeight: "600", color: C.ink },
  textSmall: { fontSize: 13 },
  textPrimary: { color: C.paper },
  textDanger: { color: C.over },
});

/* A dashed "add me" chip, used for the suggestion library. */
export function Chip({ label, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [{
        borderWidth: 1, borderColor: C.rule, borderStyle: "dashed", borderRadius: 999,
        paddingVertical: 6, paddingHorizontal: 12, marginRight: 7, marginTop: 7,
        opacity: pressed ? 0.6 : 1,
      }]}
    >
      <Text style={{ fontSize: 12.5, color: C.ink2, fontWeight: "500" }}>{label}</Text>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ ring -- */

export function Ring({ pct, size = 92, stroke = 10, color = C.good, children }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={C.ruleSoft} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2} cy={size / 2} r={r}
          stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={`${circ} ${circ}`}
          strokeDashoffset={circ * (1 - Math.max(0, Math.min(1, pct)))}
        />
      </Svg>
      <View style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center",
                     width: size, height: size }}>
        {children}
      </View>
    </View>
  );
}

/* A horizontal progress bar. Ceilings turn amber as they approach and red past. */
export function Bar({ ratio, over, warn }) {
  const pct = Math.max(0, Math.min(1, ratio));
  return (
    <View style={{ height: 5, borderRadius: 3, backgroundColor: C.ruleSoft, marginTop: 6, overflow: "hidden" }}>
      <View style={{
        height: "100%", borderRadius: 3, width: `${pct * 100}%`,
        backgroundColor: over ? C.over : warn ? C.warn : C.good,
      }} />
    </View>
  );
}

/* --------------------------------------------------------------- stepper -- */

export function Stepper({ value, onLess, onMore, onPress, label }) {
  return (
    <View style={[S.row, { gap: 3 }]}>
      <StepBtn glyph="−" onPress={onLess} />
      <Pressable onPress={onPress} hitSlop={6} style={{ minWidth: 48, paddingVertical: 4 }}>
        <Text style={{ textAlign: "center", fontSize: 14, fontWeight: "600", color: C.ink }}>
          {label != null ? label : value}
        </Text>
      </Pressable>
      <StepBtn glyph="+" onPress={onMore} />
    </View>
  );
}

function StepBtn({ glyph, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [{
        width: 30, height: 30, borderRadius: 8, borderWidth: 1, borderColor: C.rule,
        backgroundColor: C.paper, alignItems: "center", justifyContent: "center",
        opacity: pressed ? 0.6 : 1,
      }]}
    >
      <Text style={{ fontSize: 17, lineHeight: 20, color: C.ink }}>{glyph}</Text>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ tick -- */

/* The circle on a target row. A control for floors, a status light for
   ceilings — you cannot "tick" a limit, you can only stay under it. */
export function Tick({ on, over, onPress, disabled }) {
  const bg = over ? C.over : on ? C.good : "transparent";
  const border = over ? C.over : on ? C.good : C.rule;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      style={({ pressed }) => [{
        width: 27, height: 27, borderRadius: 14, borderWidth: 2,
        borderColor: border, backgroundColor: bg,
        alignItems: "center", justifyContent: "center",
        opacity: pressed && !disabled ? 0.6 : 1,
      }]}
    >
      <Text style={{ color: on || over ? "#fff" : "transparent", fontSize: 13, fontWeight: "700" }}>
        {over ? "!" : "✓"}
      </Text>
    </Pressable>
  );
}

/* ---------------------------------------------------------------- select --
   Expands in place rather than opening a modal.

   The first attempt was a Modal, which broke: this control lives inside the
   target editor, which is itself a Modal, and a modal inside a modal loses its
   layout on the web build — the option list drew over the form instead of
   sliding up beneath it. Expanding inline sidesteps nesting altogether and
   behaves identically on the phone and in a browser.

   The list is not separately scrollable on purpose. A scroll view inside the
   editor's scroll view fights for the same gesture; letting the sheet grow and
   scroll as one is both simpler and easier to use.                          */

export function Select({ value, options, onChange, placeholder = "Choose…" }) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);

  return (
    <View>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={({ pressed }) => [S.input, {
          flexDirection: "row", alignItems: "center", justifyContent: "space-between",
          opacity: pressed ? 0.7 : 1,
          borderColor: open ? C.ink : C.rule,
          borderBottomLeftRadius: open ? 0 : 10,
          borderBottomRightRadius: open ? 0 : 10,
        }]}
      >
        <Text style={{ fontSize: 15, color: current ? C.ink : C.ink3 }} numberOfLines={1}>
          {current ? current.label : placeholder}
        </Text>
        <Text style={{ fontSize: 10, color: C.ink3, marginLeft: 8 }}>{open ? "▲" : "▼"}</Text>
      </Pressable>

      {open && (
        <View style={{
          borderWidth: 1, borderTopWidth: 0, borderColor: C.ink,
          borderBottomLeftRadius: 10, borderBottomRightRadius: 10,
          backgroundColor: C.card, overflow: "hidden",
        }}>
          {options.map((o, i) => {
            const on = o.value === value;
            return (
              <Pressable
                key={String(o.value)}
                onPress={() => { onChange(o.value); setOpen(false); }}
                style={({ pressed }) => [{
                  flexDirection: "row", alignItems: "center", gap: 10,
                  paddingVertical: 11, paddingHorizontal: 12,
                  borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.ruleSoft,
                  backgroundColor: pressed ? C.sunk : on ? C.goodSoft : "transparent",
                }]}
              >
                <Text style={{ flex: 1, fontSize: 14.5, color: C.ink, fontWeight: on ? "700" : "400" }}>
                  {o.label}
                </Text>
                {on && <Text style={{ color: C.good, fontSize: 14, fontWeight: "700" }}>✓</Text>}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

/* --------------------------------------------------------------- heading -- */

export function CatHeader({ cat, right }) {
  return (
    <View style={[S.row, { paddingVertical: 11, paddingHorizontal: 13, backgroundColor: C.sunk, gap: 9 }]}>
      <View style={{ width: 4, alignSelf: "stretch", borderRadius: 2, backgroundColor: cat.color }} />
      <Text style={{ fontSize: 15 }}>{cat.emoji}</Text>
      <Text style={[S.h2, { flex: 1, fontSize: 15 }]} numberOfLines={1}>{cat.name}</Text>
      {right}
    </View>
  );
}
