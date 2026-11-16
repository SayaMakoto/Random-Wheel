import React from "react";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getAdminUser } from "@/lib/auth";
import WheelClientWrapper from "@/app/wheels/[id]/WheelClientWrapper";
import { parseSpinResult } from "@/lib/spin-history";
import Link from "next/link";
import { ArrowLeftIcon, PencilIcon, EyeIcon } from "@/components/Icons";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  const wheel = await db.wheel.findUnique({ where: { id } });
  return {
    title: wheel ? `[Admin] Chi tiết vòng quay ${wheel.name}` : "Chi tiết vòng quay - Bảng quản trị",
  };
}

export default async function AdminWheelViewPage({ params }: PageProps) {
  const { id } = await params;
  const admin = await getAdminUser();
  if (!admin) {
    redirect("/admin/login");
  }

  const wheel = await db.wheel.findUnique({
    where: { id },
    include: {
      user: {
        select: { username: true },
      },
    },
  });

  if (!wheel || wheel.isDeleted) {
    notFound();
  }

  const spinHistory = await db.spinHistory.findMany({
    where: { wheelId: id },
    include: {
      user: { select: { username: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  let parsedSlices = [];
  try {
    parsedSlices = JSON.parse(wheel.slices);
  } catch (e) {
    console.error("Failed to parse slices JSON:", e);
  }

  const formattedHistory = spinHistory.map((s) => {
    const d = new Date(s.createdAt);
    const timeStr = `${d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} ${d.toLocaleDateString("vi-VN")}`;
    const parsed = parseSpinResult(s.resultLabel, s.user?.username || "Khách");
    return {
      id: s.id,
      participant: parsed.participant,
      prize: parsed.prize,
      time: timeStr,
    };
  });

  return (
    <div className="app-container wheel-detail-container">
      {/* Main Wheel Stage with Admin View Enabled */}
      <WheelClientWrapper
        wheelId={wheel.id}
        wheelName={wheel.name}
        creatorName={wheel.user.username}
        slices={parsedSlices}
        currentUser={admin}
        customWinnerId={wheel.customWinnerId}
        hideOnWin={wheel.hideOnWin}
        backgroundImage={wheel.backgroundImage}
        initialUpdatedAt={wheel.updatedAt.toISOString()}
        initialCredits={999}
        initialHistory={formattedHistory}
        isAdminView={true}
      />
    </div>
  );
}
