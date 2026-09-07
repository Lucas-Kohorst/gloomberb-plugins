export type SimpleFinNativeModule = typeof import("./simplefin-native");

export function loadSimpleFinNativeModule(): Promise<SimpleFinNativeModule> {
  return import("./simplefin-native");
}
