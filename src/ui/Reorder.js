/* ==========================================================================
   Dragging things into a different order.

   Written by hand rather than pulled in, because the usual library wants
   reanimated and gesture-handler, and this app ships to a browser as well as
   a phone — that pair is the most reliable way to break a web build, which is
   the build everybody actually uses. What is here needs nothing that is not
   already in React Native.

   Two decisions carry most of the weight:

   The gesture starts on a handle, never on the row. A drag that begins
   anywhere on a row has to fight the ScrollView it sits inside, and the fight
   is decided by timing — press and hold to drag, flick to scroll — which
   means a slow scroll sometimes picks something up instead. A grip you must
   aim at costs a few pixels of precision and removes the ambiguity entirely.

   Rows are measured rather than assumed. Every row here is a different height:
   a target with a note is three lines, one without is two, a category card
   with six targets is much taller than one with none. Dividing by an average
   row height puts the drop one place out exactly when the list is most mixed,
   so each row reports its own height and the arithmetic uses the real ones.

   What it does not do is scroll the page when you drag to the edge. The lists
   it is used on hold somewhere between two and thirteen things, so the whole
   list is on screen and there is nowhere to scroll to.
   ========================================================================== */

import { useRef, useState } from "react";
import { Animated, PanResponder, Pressable, Text, View } from "react-native";

import { C } from "./kit";

/* The slot a row has been dragged over, given how far it has moved.

   Walks outwards from where the drag started, adding up the real heights of
   the rows passed, and hands over a place once the row has travelled past the
   halfway mark of the next one — the point at which a person reading the
   screen would say it is now above rather than below. */
export function slotFor(from, dy, heights) {
  const n = heights.length;
  let to = from;

  if (dy > 0) {
    let acc = 0;
    for (let i = from + 1; i < n; i++) {
      acc += heights[i];
      if (dy > acc - heights[i] / 2) to = i;
      else break;
    }
  } else if (dy < 0) {
    let acc = 0;
    for (let i = from - 1; i >= 0; i--) {
      acc += heights[i];
      if (-dy > acc - heights[i] / 2) to = i;
      else break;
    }
  }
  return to;
}

/* How far a row that is not being dragged should shift, so the gap opens in
   the right place as the dragged one passes over it. */
export function shiftFor(index, from, to, draggedHeight) {
  if (from === to || index === from) return 0;
  if (to > from && index > from && index <= to) return -draggedHeight;
  if (to < from && index >= to && index < from) return draggedHeight;
  return 0;
}

export function Grip({ pan, active }) {
  return (
    <View
      {...pan}
      // A generous target: the glyph is small and the thing it does is fiddly.
      style={{
        width: 34, alignSelf: "stretch", minHeight: 34,
        alignItems: "center", justifyContent: "center",
      }}
    >
      <Text style={{ fontSize: 17, lineHeight: 20, color: active ? C.ink : C.ink3 }}>⠿</Text>
    </View>
  );
}

/* Renders `items` in order and lets them be dragged about by their grips.

   `children(item, index, grip)` is given a ready-made grip to place wherever
   it belongs in that row — a category puts it in its header, a target at the
   end of its own line. */
export function Reorderable({ items, onReorder, children, keyOf }) {
  const [drag, setDrag] = useState(null);        // { from, to }
  const heights = useRef([]);
  const dy = useRef(new Animated.Value(0)).current;

  /* Read through a ref inside the responder: PanResponder closes over the
     handlers it was created with, so state read directly would be whatever it
     was when the drag began. */
  const live = useRef({ items, onReorder });
  live.current = { items, onReorder };

  const makePan = (index) => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    // Claim the gesture so the surrounding ScrollView does not take it back
    // half a drag later.
    onPanResponderTerminationRequest: () => false,

    onPanResponderGrant: () => {
      dy.setValue(0);
      setDrag({ from: index, to: index });
    },

    onPanResponderMove: (_e, g) => {
      dy.setValue(g.dy);
      const to = slotFor(index, g.dy, heights.current);
      setDrag((d) => (d && d.to === to ? d : { from: index, to }));
    },

    onPanResponderRelease: (_e, g) => {
      const to = slotFor(index, g.dy, heights.current);
      dy.setValue(0);
      setDrag(null);
      if (to !== index) live.current.onReorder(index, to);
    },

    onPanResponderTerminate: () => { dy.setValue(0); setDrag(null); },
  });

  /* Built once per row and kept.

     A PanResponder accumulates its distance from the moment it was granted,
     so building a new one during the gesture throws that away and starts
     counting from zero. Creating them inline meant every state change while
     dragging — which is every few pixels, since the gap has to open in a new
     place — replaced the responder mid-drag: the distance collapsed back to
     almost nothing, the drop landed where it started, and nothing looked
     broken except that the row sprang back. Handlers read `live` instead, so
     keeping them is safe. */
  const pans = useRef([]);
  const panFor = (index) => {
    if (!pans.current[index]) pans.current[index] = makePan(index);
    return pans.current[index];
  };

  const draggedHeight = drag ? (heights.current[drag.from] || 0) : 0;

  return (
    <View>
      {items.map((item, i) => {
        const isDragging = drag && drag.from === i;
        const shift = drag ? shiftFor(i, drag.from, drag.to, draggedHeight) : 0;
        return (
          <Animated.View
            key={keyOf ? keyOf(item) : item.id}
            onLayout={(e) => { heights.current[i] = e.nativeEvent.layout.height; }}
            style={{
              transform: [{ translateY: isDragging ? dy : shift }],
              // Lifted while held, so it passes over the others rather than
              // disappearing behind them.
              zIndex: isDragging ? 2 : 1,
              elevation: isDragging ? 6 : 0,
              opacity: isDragging ? 0.96 : 1,
              shadowColor: "#000",
              shadowOpacity: isDragging ? 0.18 : 0,
              shadowRadius: isDragging ? 12 : 0,
              shadowOffset: { width: 0, height: isDragging ? 6 : 0 },
            }}
          >
            {children(item, i, <Grip pan={panFor(i).panHandlers} active={!!isDragging} />)}
          </Animated.View>
        );
      })}
    </View>
  );
}

/* Shown once, above a list that can be dragged. People do not discover a grip
   on their own — it reads as decoration until somebody says what it is. */
export function DragHint({ what }) {
  return (
    <Pressable>
      <Text style={{ fontSize: 11, color: C.ink3, marginBottom: 8 }}>
        Drag ⠿ to change the order of {what}.
      </Text>
    </Pressable>
  );
}
