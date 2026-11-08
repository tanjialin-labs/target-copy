export function getActiveDocument(): Document {
  return window.activeDocument ?? window.document;
}

export function getActiveWindow(): Window {
  return window.activeWindow ?? window;
}
