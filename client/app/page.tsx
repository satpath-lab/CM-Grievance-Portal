"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/api";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const user = getStoredUser();
    if (!user) {
      router.replace("/citizen");
    } else if (user.role === "cm") {
      router.replace("/cm");
    } else if (user.role === "field_officer") {
      router.replace("/officer");
    } else {
      router.replace("/admin");
    }
  }, [router]);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: "#9e9e9e", fontSize: 14 }}>
      Loading…
    </div>
  );
}
