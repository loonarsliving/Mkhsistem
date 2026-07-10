import { Clipboard } from "@capacitor/clipboard";

import { isNativePlatform } from "./platform";

/** Android WebViews often lack a reliable navigator.clipboard, so the native plugin is used whenever available. */
export async function copyToClipboard(text: string): Promise<void> {
  if (isNativePlatform()) {
    await Clipboard.write({ string: text });
    return;
  }
  await navigator.clipboard.writeText(text);
}
