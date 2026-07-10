"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Fingerprint, Loader2, LogIn } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  authenticateWithBiometric,
  enableBiometricLogin,
  isBiometricAvailable,
  isBiometricEnabled,
} from "@/lib/native/biometric";
import { isNativePlatform } from "@/lib/native/platform";

import { loginAction } from "../actions/auth.actions";
import { loginSchema, type LoginInput } from "../schemas/auth.schema";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") || "/dashboard";
  const [showPassword, setShowPassword] = React.useState(false);
  const [biometricReady, setBiometricReady] = React.useState(false);
  const [biometricBusy, setBiometricBusy] = React.useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  React.useEffect(() => {
    if (!isNativePlatform()) return;
    Promise.all([isBiometricAvailable(), isBiometricEnabled()]).then(([available, enabled]) => {
      setBiometricReady(available && enabled);
    });
  }, []);

  async function completeLogin(values: LoginInput, offerBiometric: boolean) {
    const result = await loginAction(values);
    if (!result.success) {
      toast.error(result.error ?? "Gagal masuk");
      return false;
    }

    if (offerBiometric && isNativePlatform() && !biometricReady) {
      const available = await isBiometricAvailable();
      if (available) {
        toast.success("Berhasil masuk", {
          action: {
            label: "Aktifkan sidik jari",
            onClick: () => void enableBiometricLogin(values.email, values.password),
          },
        });
        router.push(redirectTo);
        router.refresh();
        return true;
      }
    }

    toast.success("Berhasil masuk");
    router.push(redirectTo);
    router.refresh();
    return true;
  }

  async function onSubmit(values: LoginInput) {
    await completeLogin(values, true);
  }

  async function handleBiometricLogin() {
    setBiometricBusy(true);
    try {
      const credentials = await authenticateWithBiometric();
      await completeLogin(credentials, false);
    } catch {
      toast.error("Autentikasi sidik jari gagal atau dibatalkan");
    } finally {
      setBiometricBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      {biometricReady && (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={biometricBusy}
          onClick={handleBiometricLogin}
        >
          {biometricBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Fingerprint className="h-4 w-4" />}
          Masuk dengan Sidik Jari
        </Button>
      )}
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="nama@mahakaryahaluoleo.com"
          {...register("email")}
        />
        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link href="/forgot-password" className="text-sm text-primary hover:underline">
            Lupa password?
          </Link>
        </div>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="••••••••"
            {...register("password")}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
        Masuk
      </Button>
    </form>
  );
}
