type Listener = () => void;

const doseListeners = new Set<Listener>();
const reminderListeners = new Set<Listener>();

export function subscribeDoseStateChanged(listener: Listener): () => void {
  doseListeners.add(listener);
  return () => { doseListeners.delete(listener); };
}

export function emitDoseStateChanged(): void {
  for (const listener of doseListeners) listener();
}

export function subscribeReminderStateChanged(listener: Listener): () => void {
  reminderListeners.add(listener);
  return () => { reminderListeners.delete(listener); };
}

export function emitReminderStateChanged(): void {
  for (const listener of reminderListeners) listener();
}
