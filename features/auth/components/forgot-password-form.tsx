"use client";

import * as React from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Loader2, Mail } from "lucide-react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { forgotPasswordAction } from "../actions/auth.actions";
import { forgotPasswordSchema, type ForgotPasswordInput } from "../schemas/auth.schema";

export function ForgotPasswordForm() {
  const [submitted, setSubmitted] = React.useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) });

  async function onSubmit(values: ForgotPasswordInput) {
    await forgotPasswordAction(values);
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="space-y-4 rounded-lg border border-border bg-muted/40 p-4 text-sm">
        <p>
          Jika email tersebut terdaftar, kami telah mengirimkan tautan untuk mengatur ulang password. Silakan periksa
          kotak masuk Anda.
        </p>
        <Link href="/login" className="inline-flex items-center gap-1 text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" /> Kembali ke halaman masuk
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      <p className="text-sm text-muted-foreground">
        Masukkan email akun Anda. Kami akan mengirimkan tautan untuk mengatur ulang password.
      </p>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" placeholder="nama@mahakaryahaluoleo.com" {...register("email")} />
        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
      </div>
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
        Kirim Tautan Reset
      </Button>
      <Link href="/login" className="flex items-center justify-center gap-1 text-sm text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Kembali ke halaman masuk
      </Link>
    </form>
  );
}
