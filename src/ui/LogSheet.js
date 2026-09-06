/* ==========================================================================
   Logging one target on one day, in a sheet.

   Shared by Today and Week so that a number can be corrected wherever you
   happen to be looking. Sending someone to another tab to type a number they
   are already looking at is a context switch with nothing to show for it.

   Handles the two cases that need more room than a cell: an amount to type,
   and a target with types to pick from. A plain tick is toggled in place and
   never gets here.
   ========================================================================== */

import { useEffect, useState } from "react";
import { Modal, Pressable, Text, TextInput, View } from "react-native";

import { C, S, Btn } from "./kit";
import * as M from "../model/targets";

const fmtDay = (k) =>
  M.parseKey(k).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

export function LogSheet({ target, dayKey, log, onChangeLog, onClose }) {
  const [text, setText] = useState("");

  // Re-seed whenever a different row or day is opened.
  useEffect(() => {
    if (!target) return;
    const v = M.valueOn(log, target.id, dayKey);
    setText(v ? String(v) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target && target.id, dayKey]);

  if (!target) return null;

  const typed = M.hasTypes(target);
  const done = typed ? M.typesOn(log, target.id, dayKey) : [];
  const planned = typed ? M.plannedOn(target, dayKey) : [];

  const quick = target.kind === "amount"
    ? [...new Set([target.step, M.round2(target.goal / 2), target.goal].filter((n) => n > 0))]
        .sort((a, b) => a - b)
    : [];

  const saveAmount = () => {
    const n = Number(text);
    const val = !text || isNaN(n) || n <= 0 ? 0 : M.round2(n);
    onChangeLog(M.setValue(log, target.id, dayKey, target.kind === "tick" ? (val ? true : 0) : val));
    onClose();
  };

  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: "rgba(20,16,12,0.44)", justifyContent: "flex-end" }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: C.paper, borderTopLeftRadius: 18, borderTopRightRadius: 18,
            padding: 18, paddingBottom: 30,
          }}
        >
          <Text style={[S.h1, { fontSize: 20, marginBottom: 3 }]}>{target.name}</Text>
          <Text style={[S.muted, { marginBottom: 16 }]}>
            {fmtDay(dayKey)}{"  ·  "}{M.describe(target)}
          </Text>

          {typed ? (
            <>
              <Text style={S.label}>Which kinds?</Text>
              <View style={[S.row, { flexWrap: "wrap", marginTop: 4 }]}>
                {target.types.map((ty) => {
                  const on = done.includes(ty.id);
                  const isPlanned = planned.includes(ty.id);
                  const tp = M.typeProgress(target, ty, dayKey, log);
                  return (
                    <Pressable
                      key={ty.id}
                      onPress={() => onChangeLog(M.toggleType(log, target, dayKey, ty.id))}
                      style={({ pressed }) => [{
                        flexDirection: "row", alignItems: "center", gap: 6,
                        borderWidth: isPlanned && !on ? 1.5 : 1,
                        borderStyle: isPlanned && !on ? "dashed" : "solid",
                        borderColor: on ? C.good : isPlanned ? C.ink2 : C.rule,
                        backgroundColor: on ? C.good : "transparent",
                        borderRadius: 999, paddingVertical: 9, paddingHorizontal: 14,
                        marginRight: 7, marginBottom: 7, opacity: pressed ? 0.6 : 1,
                      }]}
                    >
                      <Text style={{ fontSize: 14, fontWeight: "600", color: on ? "#fff" : C.ink }}>
                        {ty.name}
                      </Text>
                      {!!ty.goal && (
                        <Text style={{ fontSize: 11, color: on ? "rgba(255,255,255,0.85)" : tp.met ? C.good : C.ink3 }}>
                          {tp.total}/{ty.goal}
                        </Text>
                      )}
                    </Pressable>
                  );
                })}
              </View>
              {planned.length > 0 && (
                <Text style={[S.tiny, { marginTop: 6 }]}>Dashed outlines are what the plan asked for.</Text>
              )}
              <Btn primary label="Done" onPress={onClose} />
            </>
          ) : (
            <>
              <Text style={S.label}>Logged{target.unit ? ` (${target.unit})` : ""}</Text>
              <TextInput
                style={S.input}
                keyboardType="decimal-pad"
                value={text}
                onChangeText={setText}
                placeholder="0"
                autoFocus
                onSubmitEditing={saveAmount}
              />
              <View style={[S.row, { flexWrap: "wrap", marginTop: 10, gap: 7 }]}>
                <Btn small label="Clear" onPress={() => setText("")} />
                {quick.map((q) => (
                  <Btn key={q} small
                       label={`${M.fmtNum(q)}${target.unit ? " " + target.unit : ""}`}
                       onPress={() => setText(String(q))} />
                ))}
              </View>
              <View style={[S.row, { gap: 9, marginTop: 16 }]}>
                <Btn label="Cancel" onPress={onClose} style={{ flex: 1 }} />
                <Btn primary label="Save" onPress={saveAmount} style={{ flex: 1 }} />
              </View>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
