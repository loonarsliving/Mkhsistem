import { Share } from "@capacitor/share";

import { isNativePlatform } from "./platform";

/** Native share sheet on Android; Web Share API where supported, otherwise silently unavailable (caller should hide the button). */
export async function shareLink(title: string, text: string, url: string): Promise<boolean> {
  if (isNativePlatform()) {
    await Share.share({ title, text, url, dialogTitle: title });
    return true;
  }
  if (typeof navigator !== "undefined" && "share" in navigator) {
    await navigator.share({ title, text, url });
    return true;
  }
  return false;
}

export function canShare(): boolean {
  return isNativePlatform() || (typeof navigator !== "undefined" && "share" in navigator);
}
