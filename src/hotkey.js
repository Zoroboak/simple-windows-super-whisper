function validateAccelerator(value) {
  const next = String(value || '').trim();
  if (!next || next.length > 100 || /[\r\n\0]/.test(next)) throw new Error('El atajo no es válido.');
  if (!/^(F(?:[1-9]|1[0-9]|2[0-4]))$/i.test(next) && !/(Control|Ctrl|Alt|Command|Cmd|Super|Meta)/i.test(next)) {
    throw new Error('Utiliza Control, Alt o Command junto a una tecla, o una tecla F1–F24.');
  }
  return next;
}
// The registration and its persistence form one transaction.
function changeHotkey(shortcuts, previous, value, onToggle, persist) {
  const next = validateAccelerator(value);
  if (next === previous && shortcuts.isRegistered(next)) { persist(next); return next; }
  if (!shortcuts.register(next, onToggle)) throw new Error('Atajo ocupado o no autorizado. El anterior sigue activo.');
  try { persist(next); }
  catch (error) { shortcuts.unregister(next); throw error; }
  if (previous && previous !== next) shortcuts.unregister(previous);
  return next;
}
module.exports = { changeHotkey, validateAccelerator };
