// Canvas hit rectangles also describe the keyboard/screen-reader controls.
// Pointer input stays on the canvas; native buttons provide Enter/Space and focus.
import { VIEW } from "./balance";
import { playSound } from "./audio";
import { FONT } from "./typography";

export type ControlRect = { x: number; y: number; w: number; h: number };
type TextInput = { value: string; maxLength: number; onInput: (value: string) => void; onCommit: () => void; onCancel: () => void };
type Control = ControlRect & { id: string; label: string; action: () => void; disabled: boolean; input?: TextInput };
type ControlElement = HTMLButtonElement | HTMLInputElement;
let scene = "";
let modal = false;
let pending: Control[] = [];
let layer: HTMLDivElement | null = null;
let live: HTMLDivElement | null = null;
let mountedScene = "";
let mountedModal = false;
let keyboard = false;
const nodes = new Map<string, { button: ControlElement; control: Control; geometry: string; composing: boolean }>();

/** Start the topmost scene. Calling again discards covered controls. */
export function beginControls(name: string, containFocus = true): void {
  scene = name;
  modal = containFocus;
  pending = [];
}

export function registerControl(id: string, label: string, rect: ControlRect, action: () => void, disabled = false): void {
  const control = { id, label, ...rect, action, disabled };
  const existing = pending.findIndex((entry) => entry.id === id);
  if (existing < 0) pending.push(control);
  else pending[existing] = control;
}

/** Native editing shares geometry, modal containment, and scene cleanup with buttons. */
export function registerTextInput(id: string, label: string, rect: ControlRect, input: TextInput): void {
  pending.push({ id, label, ...rect, action: () => {}, disabled: false, input });
}

function mount(canvas: HTMLCanvasElement): void {
  const style = document.createElement("style");
  style.textContent = `
    #canvas-controls { position:fixed; z-index:20; pointer-events:none; }
    #canvas-controls button { position:absolute; box-sizing:border-box; pointer-events:none; margin:0; padding:0; border:0; border-radius:7px; background:transparent; color:transparent; font-size:0; }
    #canvas-controls input { position:absolute; box-sizing:border-box; pointer-events:auto; border:2px solid #cfad70; border-radius:6px; background:#2d2118; color:#fff0c8; padding:0 8px; font:inherit; }
    #canvas-controls button:focus-visible, #canvas-controls input:focus { outline:3px solid #fff5bb; outline-offset:3px; box-shadow:0 0 0 6px #1c150e; }
    #canvas-controls-status { position:fixed; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); }
  `;
  document.head.append(style);
  layer = document.createElement("div");
  layer.id = "canvas-controls";
  document.body.append(layer);
  live = document.createElement("div");
  live.id = "canvas-controls-status";
  live.setAttribute("role", "status");
  live.setAttribute("aria-live", "polite");
  document.body.append(live);
  // Bounds are read only after resize/scroll, never during the render loop.
  const resize = () => {
    const r = canvas.getBoundingClientRect();
    Object.assign(layer!.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, font: `500 ${18 * r.width / VIEW.w}px ${FONT}` });
  };
  new ResizeObserver(resize).observe(canvas);
  window.addEventListener("resize", resize);
  window.addEventListener("scroll", resize, true);
  resize();
  document.addEventListener("pointerdown", () => { keyboard = false; }, true);
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    keyboard = true;
    if (!modal) return;
    const enabled = pending.filter((control) => !control.disabled).map((control) => nodes.get(control.id)?.button).filter((button): button is ControlElement => !!button);
    if (!enabled.length) return;
    const index = enabled.indexOf(document.activeElement as ControlElement);
    if (index < 0 || (!event.shiftKey && index === enabled.length - 1) || (event.shiftKey && index === 0)) {
      event.preventDefault();
      enabled[event.shiftKey ? enabled.length - 1 : 0].focus({ preventScroll: true });
    }
  }, true);
  layer.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " " || event.key === "Tab") event.stopPropagation();
  });
  layer.addEventListener("keyup", (event) => {
    if (event.key === "Enter" || event.key === " ") event.stopPropagation();
  });
}

/** Reconcile active controls without recreating stable nodes or reading layout. */
export function endControls(canvas: HTMLCanvasElement): void {
  if (!layer) mount(canvas);
  const changedScene = mountedScene !== scene;
  const hadFocus = layer!.contains(document.activeElement);
  let removedInput = false;
  if (changedScene) {
    for (const { button } of nodes.values()) { if (button instanceof HTMLInputElement) removedInput = true; button.remove(); }
    nodes.clear();
    layer!.setAttribute("role", modal ? "dialog" : "group");
    layer!.setAttribute("aria-label", scene);
    mountedScene = scene;
  }
  if (changedScene || mountedModal !== modal) {
    layer!.setAttribute("role", modal ? "dialog" : "group");
    if (modal) layer!.setAttribute("aria-modal", "true");
    else layer!.removeAttribute("aria-modal");
    mountedModal = modal;
  }
  const active = new Set(pending.map((control) => control.id));
  for (const [id, entry] of nodes) {
    if (!active.has(id)) { if (entry.button instanceof HTMLInputElement) removedInput = true; entry.button.remove(); nodes.delete(id); }
  }
  let newInput: HTMLInputElement | null = null;
  for (const control of pending) {
    let entry = nodes.get(control.id);
    if (!entry) {
      const button = control.input ? document.createElement("input") : document.createElement("button");
      button.type = control.input ? "text" : "button";
      button.dataset.control = control.id;
      entry = { button, control, geometry: "", composing: false };
      const current = entry;
      if (button instanceof HTMLInputElement) {
        button.autocomplete = "off";
        button.spellcheck = false;
        button.addEventListener("input", () => current.control.input!.onInput(button.value));
        button.addEventListener("compositionstart", () => { current.composing = true; });
        button.addEventListener("compositionend", () => { current.composing = false; current.control.input!.onInput(button.value); });
        button.addEventListener("keydown", (event) => {
          event.stopPropagation();
          if (event.isComposing || current.composing) return;
          if (event.key === "Enter" || event.key === "Escape") {
            event.preventDefault();
            if (event.key === "Enter") current.control.input!.onCommit();
            else current.control.input!.onCancel();
          }
        });
        newInput = button;
      } else button.addEventListener("click", () => { if (!current.control.disabled) { playSound("ui"); current.control.action(); } });
      layer!.append(button);
      nodes.set(control.id, entry);
    }
    entry.control = control;
    if (entry.button instanceof HTMLInputElement && control.input) {
      if (entry.button.maxLength !== control.input.maxLength) entry.button.maxLength = control.input.maxLength;
      if (!entry.composing && entry.button.value !== control.input.value) entry.button.value = control.input.value;
    }
    if (entry.button.getAttribute("aria-label") !== control.label) entry.button.setAttribute("aria-label", control.label);
    if (entry.button.disabled !== control.disabled) entry.button.disabled = control.disabled;
    const geometry = `${control.x},${control.y},${control.w},${control.h}`;
    if (entry.geometry !== geometry) {
      Object.assign(entry.button.style, { left: `${control.x / VIEW.w * 100}%`, top: `${control.y / VIEW.h * 100}%`, width: `${control.w / VIEW.w * 100}%`, height: `${control.h / VIEW.h * 100}%` });
      entry.geometry = geometry;
    }
  }
  // DOM order must follow the visible order even when a new button is inserted.
  let previous: ControlElement | null = null;
  for (const control of pending) {
    const button = nodes.get(control.id)!.button;
    if (button.previousElementSibling !== previous) layer!.insertBefore(button, previous ? previous.nextElementSibling : layer!.firstElementChild);
    previous = button;
  }
  if (newInput) {
    newInput.focus({ preventScroll: true });
    newInput.select();
  } else if (keyboard && changedScene && !modal) {
    canvas.focus({ preventScroll: true });
  } else if (removedInput || (keyboard && changedScene) || (hadFocus && (!layer!.contains(document.activeElement) || (document.activeElement as ControlElement).disabled))) {
    const first = pending.find((control) => !control.disabled);
    if (first) nodes.get(first.id)?.button.focus({ preventScroll: true });
  }
}

export function announceControl(message: string): void {
  if (live) live.textContent = message;
}
