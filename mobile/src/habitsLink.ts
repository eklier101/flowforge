import { NativeModules, Platform } from "react-native";

type HabitsLinkNative = {
  notifyComplete: (source: string) => Promise<boolean>;
  isInstalled?: () => Promise<boolean>;
};

const HabitsLink: HabitsLinkNative | undefined = NativeModules.HabitsLink;

export async function notifyHabitsComplete(source: "forge" | "bible" | "flowforge"): Promise<boolean> {
  if (Platform.OS !== "android" || !HabitsLink?.notifyComplete) {
    return false;
  }
  try {
    return await HabitsLink.notifyComplete(source);
  } catch {
    return false;
  }
}

export async function isHabitsAppInstalled(): Promise<boolean> {
  if (Platform.OS !== "android" || !HabitsLink?.isInstalled) {
    return false;
  }
  try {
    return await HabitsLink.isInstalled();
  } catch {
    return false;
  }
}
