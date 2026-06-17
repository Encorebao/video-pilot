import { useSyncExternalStore } from "react";

const subscribe = () => () => undefined;
const getServerSnapshot = () => false;

export function useElectronCapability(
  capability: keyof NonNullable<Window["electronAPI"]>,
) {
  return useSyncExternalStore(
    subscribe,
    () => !!window.electronAPI?.[capability],
    getServerSnapshot,
  );
}
