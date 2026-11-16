import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser, getAdminUser } from "@/lib/auth";
import WheelClientWrapper from "./WheelClientWrapper";
import Header from "@/components/Header";
import { parseSpinResult } from "@/lib/spin-history";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  const wheel = await db.wheel.findUnique({ where: { id } });
  return {
    title: wheel ? `Vòng quay ${wheel.name} - Lucky Wheel Hub` : "Vòng quay - Lucky Wheel Hub",
  };
}

export default async function WheelDetailPage({ params }: PageProps) {
  const { id } = await params;
  const admin = await getAdminUser();
  const user = await getCurrentUser();

  // Fetch wheel config
  const wheel = await db.wheel.findUnique({
    where: { id },
    include: {
      user: {
        select: { username: true },
      },
    },
  });

  // If wheel doesn't exist or is soft-deleted, return 404
  if (!wheel || wheel.isDeleted) {
    notFound();
  }

  const [credit, spinHistory] = await Promise.all([
    user
      ? db.spinCodeRedemption.aggregate({
          where: { userId: user.id },
          _sum: { remaining: true },
        })
      : null,
    db.spinHistory.findMany({
      where: { wheelId: id },
      include: {
        user: { select: { username: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

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
      {/* Header breadcrumb */}
      <Header user={user || admin} />

      {/* Main Wheel Client Container - strictly user view */}
      <WheelClientWrapper
        wheelId={wheel.id}
        wheelName={wheel.name}
        creatorName={wheel.user.username}
        slices={parsedSlices}
        currentUser={user}
        customWinnerId="random"
        hideOnWin={wheel.hideOnWin}
        backgroundImage={wheel.backgroundImage}
        initialUpdatedAt={wheel.updatedAt.toISOString()}
        initialCredits={credit?._sum.remaining ?? 0}
        initialHistory={formattedHistory}
        isAdminView={false}
      />
    </div>
  );
}
