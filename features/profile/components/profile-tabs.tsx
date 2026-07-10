"use client";

import { useSearchParams } from "next/navigation";

import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { isNativePlatform } from "@/lib/native/platform";

import { BiometricSettings } from "./biometric-settings";
import { ChangePasswordForm } from "./change-password-form";
import { ProfileForm } from "./profile-form";
import type { UpdateProfileInput } from "../schemas/profile.schema";

export function ProfileTabs({ userId, initialValues }: { userId: string; initialValues: UpdateProfileInput }) {
  const searchParams = useSearchParams();
  const defaultTab = searchParams.get("tab") === "password" ? "password" : "profile";

  return (
    <Tabs defaultValue={defaultTab}>
      <TabsList>
        <TabsTrigger value="profile">Profil</TabsTrigger>
        <TabsTrigger value="password">Ganti Password</TabsTrigger>
        {isNativePlatform() && <TabsTrigger value="device">Perangkat</TabsTrigger>}
      </TabsList>
      <TabsContent value="profile">
        <Card>
          <CardContent className="p-6">
            <ProfileForm userId={userId} initialValues={initialValues} />
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="password">
        <Card>
          <CardContent className="p-6">
            <ChangePasswordForm />
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="device">
        <Card>
          <CardContent className="p-6">
            <BiometricSettings />
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
