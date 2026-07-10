"use client";

import * as React from "react";
import { Fingerprint, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  disableBiometricLogin,
  isBiometricAvailable,
  isBiometricEnabled,
} from "@/lib/native/biometric";
import { isNativePlatform } from "@/lib/native/platform";

/**
 * Rendered only inside the Android app. Enabling biometric login happens
 * right after a successful password login (features/auth/components/
 * login-form.tsx) since that's the only place the plaintext password is
 * ever available to store — this panel can only show status and let the
 * user turn it back off.
 */
export function BiometricSettings() {
  const [supported, setSupported] = React.useState(false);
  const [enabled, setEnabled] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!isNativePlatform()) {
      setLoading(false);
      return;
    }
    Promise.all([isBiometricAvailable(), isBiometricEnabled()]).then(([available, isEnabled]) => {
      setSupported(available);
      setEnabled(isEnabled);
      setLoading(false);
    });
  }, []);

  if (!isNativePlatform() || loading) return null;

  if (!supported) {
    return <p className="text-sm text-muted-foreground">Perangkat ini tidak mendukung login sidik jari.</p>;
  }

  async function handleDisable() {
    setBusy(true);
    await disableBiometricLogin();
    setEnabled(false);
    setBusy(false);
    toast.success("Login sidik jari dinonaktifkan");
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <Fingerprint className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">Login Sidik Jari</p>
          <p className="text-sm text-muted-foreground">
            {enabled ? "Aktif untuk perangkat ini." : "Masuk ulang dengan password untuk mengaktifkan."}
          </p>
        </div>
      </div>
      {enabled && (
        <Button variant="outline" size="sm" onClick={handleDisable} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Nonaktifkan"}
        </Button>
      )}
    </div>
  );
}
