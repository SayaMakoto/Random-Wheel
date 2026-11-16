"use client";

import React, { useActionState } from "react";
import { adminLoginAction } from "@/lib/auth";
import Link from "next/link";
import { HomeIcon } from "@/components/Icons";

export default function AdminLoginPage() {
  const [state, formAction, isPending] = useActionState(adminLoginAction, null);

  React.useEffect(() => {
    document.title = "Đăng nhập Quản trị viên - Lucky Wheel Hub";
  }, []);

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "80vh",
        padding: "2rem 1rem",
      }}
    >
      <div
        className="glass-panel"
        style={{
          width: "100%",
          maxWidth: "420px",
          border: "1px solid rgba(139, 92, 246, 0.3)",
          boxShadow: "0 8px 32px 0 rgba(139, 92, 246, 0.15)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              background: "rgba(139, 92, 246, 0.15)",
              border: "1px solid rgba(139, 92, 246, 0.3)",
              display: "grid",
              placeItems: "center",
              margin: "0 auto 1rem auto",
              fontSize: "1.75rem",
            }}
          >
            🛡️
          </div>
          <h2
            style={{
              fontSize: "1.6rem",
              fontWeight: "800",
              background: "linear-gradient(135deg, #a78bfa 0%, #ec4899 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Cổng Quản Trị Viên
          </h2>
        </div>

        <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "1.2rem" }}>
          <div>
            <label
              style={{
                fontSize: "0.85rem",
                color: "#c4b5fd",
                display: "block",
                marginBottom: "0.4rem",
                fontWeight: "600",
              }}
            >
              Tài khoản hoặc Email Admin
            </label>
            <input
              type="text"
              name="usernameOrEmail"
              placeholder="admin..."
              required
              style={{
                width: "100%",
                background: "rgba(0,0,0,0.3)",
                borderColor: "rgba(139, 92, 246, 0.25)",
              }}
            />
          </div>

          <div>
            <label
              style={{
                fontSize: "0.85rem",
                color: "#c4b5fd",
                display: "block",
                marginBottom: "0.4rem",
                fontWeight: "600",
              }}
            >
              Mật khẩu Admin
            </label>
            <input
              type="password"
              name="password"
              placeholder="••••••••"
              required
              style={{
                width: "100%",
                background: "rgba(0,0,0,0.3)",
                borderColor: "rgba(139, 92, 246, 0.25)",
              }}
            />
          </div>

          {state?.error && (
            <p
              style={{
                color: "#ef4444",
                fontSize: "0.85rem",
                textAlign: "center",
                fontWeight: "500",
                background: "rgba(239, 68, 68, 0.1)",
                padding: "0.5rem",
                borderRadius: "6px",
                border: "1px solid rgba(239, 68, 68, 0.2)",
              }}
            >
              ❌ {state.error}
            </p>
          )}

          <button
            className="btn btn-primary"
            type="submit"
            disabled={isPending}
            style={{
              marginTop: "0.5rem",
              width: "100%",
              background: "linear-gradient(135deg, #7c3aed 0%, #db2777 100%)",
            }}
          >
            {isPending ? "Đang xác thực..." : "Đăng nhập Admin"}
          </button>
        </form>

        <hr
          style={{
            border: "none",
            borderTop: "1px solid rgba(255,255,255,0.08)",
            margin: "1.5rem 0 1rem 0",
          }}
        />

        <div style={{ textAlign: "center" }}>
          <Link
            href="/"
            className="btn btn-secondary"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.45rem 0.9rem",
              fontSize: "0.82rem",
            }}
          >
            <HomeIcon className="w-4 h-4" /> Quay về trang chủ người dùng
          </Link>
        </div>
      </div>
    </div>
  );
}
