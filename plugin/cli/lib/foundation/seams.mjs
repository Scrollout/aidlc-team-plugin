// Named seams the core declares and domains or extensions plug into, so a call back up a dependency or out to an
// extension needs no import (docs/design/library.md#seams).
const plugs = new Map();

// Adds `fn` to a seam; `when(profile)`, for an extension, says whether the profile enables it.
export const plug = (seam, fn, when = null) => plugs.set(seam, [...(plugs.get(seam) ?? []), { fn, when }]);

// The functions plugged into a seam that the profile enables, in the order they were plugged.
export const seam = (name, profile = {}) => (plugs.get(name) ?? []).filter((p) => !p.when || p.when(profile)).map((p) => p.fn);
