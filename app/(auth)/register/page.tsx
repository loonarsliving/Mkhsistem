import type { Metadata } from "next";

import { RegisterForm } from "@/features/registration/components/register-form";

export const metadata: Metadata = { title: "Daftar" };

export default function RegisterPage() {
  return <RegisterForm />;
}
