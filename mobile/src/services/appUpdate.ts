import * as Application from "expo-application";
import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import NetInfo from "@react-native-community/netinfo";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { getAppInfo, type AppInfo } from "../api/client";
import { getServerUrl } from "../utils/storage";

const APK_CACHE_KEY = "flowforge.apk.cache";

export type CachedApk = {
  path: string;
  version: string;
  versionCode: number;
};

export function getInstalledInfo(): { version: string; versionCode: number } {
  return {
    version: Application.nativeApplicationVersion || "3.0.9",
    versionCode: Number(Application.nativeBuildVersion || "30009"),
  };
}

export async function readCachedApk(): Promise<CachedApk | null> {
  const raw = await AsyncStorage.getItem(APK_CACHE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as CachedApk;
    const info = await FileSystem.getInfoAsync(parsed.path);
    if (info.exists) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveCachedApk(meta: CachedApk): Promise<void> {
  await AsyncStorage.setItem(APK_CACHE_KEY, JSON.stringify(meta));
}

export async function isOnWifi(): Promise<boolean> {
  try {
    const state = await NetInfo.fetch();
    return state.type === "wifi";
  } catch {
    return false;
  }
}

export async function checkServerUpdate(): Promise<{
  info: AppInfo | null;
  installed: { version: string; versionCode: number };
  updateAvailable: boolean;
  cached: CachedApk | null;
  readyToInstall: boolean;
  onWifi: boolean;
}> {
  const installed = getInstalledInfo();
  const cached = await readCachedApk();
  const onWifi = await isOnWifi();
  try {
    const info = await getAppInfo();
    const serverCode = Number(info.version_code || 0);
    const updateAvailable = info.apk_available && serverCode > installed.versionCode;
    const readyToInstall =
      cached !== null &&
      cached.versionCode >= serverCode;
    return { info, installed, updateAvailable, cached, readyToInstall, onWifi };
  } catch {
    return {
      info: null,
      installed,
      updateAvailable: false,
      cached,
      readyToInstall: cached !== null,
      onWifi,
    };
  }
}

export async function downloadApkUpdate(
  info: AppInfo,
  force = false,
  onProgress?: (progress: number) => void,
): Promise<CachedApk> {
  if (!info.apk_available || !info.apk_url) {
    throw new Error("No APK published on the server.");
  }
  if (!force && !(await isOnWifi())) {
    throw new Error("Connect to Wi-Fi to download updates automatically, or tap Download Now.");
  }
  const serverUrl = await getServerUrl();
  const filename = info.apk_filename || `FlowForge-${info.version}.apk`;
  const dest = `${FileSystem.cacheDirectory}${filename}`;
  const url = info.apk_download_url || `${serverUrl.replace(/\/$/, "")}${info.apk_url}`;

  if (onProgress) {
    const downloadResumable = FileSystem.createDownloadResumable(
      url,
      dest,
      {},
      (downloadProgress) => {
        if (downloadProgress.totalBytesExpectedToWrite > 0) {
          const progress =
            downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
          onProgress(progress);
        }
      },
    );
    const result = await downloadResumable.downloadAsync();
    if (!result || !result.uri) {
      throw new Error("APK download failed to complete.");
    }
    const cached: CachedApk = {
      path: result.uri,
      version: info.version,
      versionCode: Number(info.version_code),
    };
    await saveCachedApk(cached);
    return cached;
  } else {
    const result = await FileSystem.downloadAsync(url, dest);
    const cached: CachedApk = {
      path: result.uri,
      version: info.version,
      versionCode: Number(info.version_code),
    };
    await saveCachedApk(cached);
    return cached;
  }
}

export async function installCachedApk(fileUri: string): Promise<void> {
  const fileInfo = await FileSystem.getInfoAsync(fileUri);
  if (!fileInfo.exists) {
    throw new Error("Downloaded APK file not found. Please re-download.");
  }
  const contentUri = await FileSystem.getContentUriAsync(fileUri);
  // FLAG_GRANT_READ_URI_PERMISSION (1) | FLAG_ACTIVITY_NEW_TASK (0x10000000 = 268435456)
  await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
    data: contentUri,
    flags: 1 | 0x10000000,
    type: "application/vnd.android.package-archive",
  });
}

export async function downloadAndInstallNow(
  info: AppInfo,
  onProgress?: (progress: number) => void,
): Promise<void> {
  const cached = await downloadApkUpdate(info, true, onProgress);
  await installCachedApk(cached.path);
}

export async function maybeAutoDownloadOnWifi(): Promise<CachedApk | null> {
  try {
    const snapshot = await checkServerUpdate();
    if (!snapshot.info || !snapshot.updateAvailable) {
      return snapshot.cached;
    }
    if (!snapshot.onWifi) {
      return snapshot.cached;
    }
    if (snapshot.cached && snapshot.cached.versionCode >= Number(snapshot.info.version_code)) {
      return snapshot.cached;
    }
    return await downloadApkUpdate(snapshot.info, false);
  } catch {
    return null;
  }
}
