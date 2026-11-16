"use server";

import { db } from "@/lib/db";
import { getCurrentUser, getAdminUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function executeSpinAction(wheelId: string, participantName?: string) {
  const user = (await getCurrentUser()) || (await getAdminUser());
  if (!user) return { error: "Vui lòng đăng nhập trước khi quay." };

  try {
    const result = await db.$transaction(async (tx) => {
      let remainingCredits = -1;

      // 1. Kiểm tra và trừ lượt quay nếu là thành viên thường
      if (user.role !== "admin") {
        const redemption = await tx.spinCodeRedemption.findFirst({
          where: { userId: user.id, remaining: { gt: 0 } },
          orderBy: { createdAt: "asc" },
        });

        if (!redemption) {
          return { error: "Bạn không còn lượt quay. Hãy nhập mã quay mới." };
        }

        await tx.spinCodeRedemption.update({
          where: { id: redemption.id },
          data: { remaining: { decrement: 1 } },
        });

        const totalRes = await tx.spinCodeRedemption.aggregate({
          where: { userId: user.id },
          _sum: { remaining: true },
        });
        remainingCredits = totalRes._sum.remaining ?? 0;
      }

      // 2. Lấy thông tin vòng quay
      const wheel = await tx.wheel.findUnique({
        where: { id: wheelId },
      });

      if (!wheel || wheel.isDeleted) {
        return { error: "Vòng quay không tồn tại hoặc đã bị xóa." };
      }

      let slices: Array<{ id: string; label: string; color: string; weight: number; enabled: boolean }> = [];
      try {
        slices = JSON.parse(wheel.slices);
      } catch {
        return { error: "Cấu hình vòng quay không hợp lệ." };
      }

      const activeSlices = slices.filter((s) => s.enabled);
      if (activeSlices.length === 0) {
        return { error: "Vòng quay hiện không có mục nào kích hoạt." };
      }

      // 3. Logic chọn kết quả:
      // Ưu tiên Prankmode do Admin chỉ định nếu có
      let wonSlice = null;
      if (wheel.customWinnerId && wheel.customWinnerId !== "random") {
        wonSlice = activeSlices.find((s) => s.id === wheel.customWinnerId);
      }

      // Nếu không có Prankmode hoặc ID không khớp, thực hiện bốc thăm theo trọng số
      if (!wonSlice) {
        const totalWeight = activeSlices.reduce((acc, item) => acc + (item.weight > 0 ? item.weight : 1), 0);
        let randomVal = Math.random() * totalWeight;

        for (const item of activeSlices) {
          randomVal -= (item.weight > 0 ? item.weight : 1);
          if (randomVal <= 0) {
            wonSlice = item;
            break;
          }
        }
      }

      if (!wonSlice) wonSlice = activeSlices[0];

      // 4. Lưu trực tiếp lịch sử lượt quay trên Server
      const finalParticipant = (user.role === "admin" && participantName?.trim()) 
        ? participantName.trim() 
        : user.username;

      // Encode participant name and prize into JSON string so it permanently survives page refreshes
      const resultData = JSON.stringify({
        participant: finalParticipant,
        prize: wonSlice.label,
      });

      const historyRecord = await tx.spinHistory.create({
        data: {
          wheelId,
          userId: user.id,
          resultLabel: resultData,
        },
      });

      const winningIndex = activeSlices.findIndex((s) => s.id === wonSlice.id);

      return {
        success: true,
        winningIndex: winningIndex >= 0 ? winningIndex : 0,
        wonItem: wonSlice,
        remainingCredits,
        participantName: finalParticipant,
        historyId: historyRecord.id,
        createdAt: historyRecord.createdAt.toISOString(),
      };
    });

    if ("success" in result && result.success) {
      revalidatePath(`/wheels/${wheelId}`);
      revalidatePath(`/admin/wheels/${wheelId}/view`);
      revalidatePath("/admin");
    }

    return result;
  } catch (error) {
    console.error("Execute spin failed:", error);
    return { error: "Không thể xử lý lượt quay. Vui lòng thử lại." };
  }
}

export async function clearWheelHistoryAction(wheelId: string) {
  const admin = await getAdminUser();
  if (!admin) return { error: "Chỉ quản trị viên mới có quyền xoá lịch sử." };
  try {
    await db.spinHistory.deleteMany({
      where: { wheelId },
    });
    revalidatePath(`/wheels/${wheelId}`);
    revalidatePath(`/admin/wheels/${wheelId}/view`);
    revalidatePath("/admin");
    return { success: true };
  } catch {
    return { error: "Không thể xoá lịch sử quay." };
  }
}

export async function saveSpinAction(wheelId: string, resultLabel: string) {
  const user = (await getCurrentUser()) || (await getAdminUser());
  if (!user) return { error: "Bạn cần đăng nhập và nhập mã quay để quay." };
  try {
    await db.spinHistory.create({
      data: {
        wheelId,
        userId: user ? user.id : null,
        resultLabel,
      },
    });
    // Trigger Server Component re-validation to update the spin history list instantly
    revalidatePath(`/wheels/${wheelId}`);
    return { success: true };
  } catch (e) {
    console.error("Failed to save spin history:", e);
    return { error: "Không thể lưu lịch sử quay" };
  }
}

export async function redeemSpinCodeAction(code: string) {
  const user = (await getCurrentUser()) || (await getAdminUser());
  if (!user) return { error: "Vui lòng đăng nhập trước khi nhập mã quay." };
  const normalized = code.trim().toUpperCase();
  try {
    const result = await db.$transaction(async (tx) => {
      const spinCode = await tx.spinCode.findUnique({ where: { code: normalized } });
      if (!spinCode || spinCode.status !== "unused") return { error: "Mã quay không hợp lệ hoặc đã được sử dụng." };
      await tx.spinCode.update({ where: { id: spinCode.id }, data: { status: "used" } });
      const redemption = await tx.spinCodeRedemption.create({ data: { codeId: spinCode.id, userId: user.id, remaining: spinCode.amount } });
      return { success: true, remaining: redemption.remaining };
    });
    return result;
  } catch { return { error: "Không thể sử dụng mã quay. Vui lòng thử lại." }; }
}

export async function consumeSpinCreditAction() {
  const user = (await getCurrentUser()) || (await getAdminUser());
  if (!user) return { error: "Vui lòng đăng nhập và nhập mã quay." };
  if (user.role === "admin") return { success: true, remaining: -1 };
  try {
    const redemption = await db.spinCodeRedemption.findFirst({ where: { userId: user.id, remaining: { gt: 0 } }, orderBy: { createdAt: "asc" } });
    if (!redemption) return { error: "Bạn không còn lượt quay. Hãy nhập mã quay mới." };
    const updated = await db.spinCodeRedemption.update({ where: { id: redemption.id }, data: { remaining: { decrement: 1 } } });
    return { success: true, remaining: updated.remaining };
  } catch { return { error: "Không thể xác nhận lượt quay." }; }
}
