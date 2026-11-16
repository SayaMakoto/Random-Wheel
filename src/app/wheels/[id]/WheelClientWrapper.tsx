"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import LuckyWheel, { WheelItem } from "@/components/LuckyWheel";
import { executeSpinAction, redeemSpinCodeAction, clearWheelHistoryAction } from "./actions";
import { ArrowLeftIcon } from "@/components/Icons";

interface HistoryItem {
  id: string;
  participant: string;
  prize: string;
  time: string;
}

interface WheelClientWrapperProps {
  wheelId: string;
  wheelName: string;
  creatorName: string;
  slices: WheelItem[];
  currentUser: { id: string; username: string; role: string } | null;
  customWinnerId?: string;
  hideOnWin?: boolean;
  backgroundImage?: string | null;
  initialUpdatedAt: string;
  initialCredits: number;
  initialHistory: HistoryItem[];
  isAdminView: boolean;
}

export default function WheelClientWrapper({
  wheelId,
  wheelName,
  creatorName,
  slices,
  currentUser,
  customWinnerId = "random",
  hideOnWin = false,
  backgroundImage,
  initialUpdatedAt,
  initialCredits,
  initialHistory,
  isAdminView,
}: WheelClientWrapperProps) {
  const [items, setItems] = useState<WheelItem[]>(slices);
  const [wheelConfig, setWheelConfig] = useState({
    wheelName,
    customWinnerId,
    hideOnWin,
    backgroundImage,
    updatedAt: initialUpdatedAt,
  });
  const [isSpinning, setIsSpinning] = useState(false);
  const [triggerSpin, setTriggerSpin] = useState(false);
  const [targetWinningIndex, setTargetWinningIndex] = useState<number | null>(null);
  const pendingWonItemRef = useRef<WheelItem | null>(null);
  const [winner, setWinner] = useState<{ item: WheelItem; participant: string } | null>(null);
  const pendingPlayerRef = useRef<string>("");
  const winAudioContextRef = useRef<AudioContext | null>(null);
  const spinStartLockedRef = useRef(false);

  // Credits & Spin Code
  const [credits, setCredits] = useState(initialCredits);
  const [spinCode, setSpinCode] = useState("");
  const [codeMessage, setCodeMessage] = useState("");
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [isSpinStarting, setIsSpinStarting] = useState(false);
  const [showCodePrompt, setShowCodePrompt] = useState(Boolean(!isAdminView && initialCredits <= 0));

  // Participants State (Admin Only - Starts Empty)
  const [participants, setParticipants] = useState<string[]>([]);
  const [newParticipantInput, setNewParticipantInput] = useState("");
  const [spinMode, setSpinMode] = useState<"sequential" | "random">("sequential");
  const [removeOnSpin, setRemoveOnSpin] = useState(true);
  const isHydratedRef = useRef(false);

  // Restore participants and settings from localStorage for Admin View
  useEffect(() => {
    if (!isAdminView) return;
    try {
      const savedParticipants = localStorage.getItem(`wheel_participants_${wheelId}`);
      if (savedParticipants) {
        const parsed = JSON.parse(savedParticipants);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setParticipants(parsed);
        }
      }

      const savedMode = localStorage.getItem(`wheel_spin_mode_${wheelId}`);
      if (savedMode === "sequential" || savedMode === "random") {
        setSpinMode(savedMode);
      }

      const savedRemove = localStorage.getItem(`wheel_remove_on_spin_${wheelId}`);
      if (savedRemove !== null) {
        setRemoveOnSpin(savedRemove === "true");
      }
    } catch {
      // Ignore localStorage errors
    } finally {
      isHydratedRef.current = true;
    }
  }, [wheelId, isAdminView]);

  // Persist participants list changes to localStorage
  useEffect(() => {
    if (!isAdminView || !isHydratedRef.current) return;
    try {
      localStorage.setItem(`wheel_participants_${wheelId}`, JSON.stringify(participants));
    } catch {}
  }, [participants, wheelId, isAdminView]);

  // Persist spinMode changes to localStorage
  useEffect(() => {
    if (!isAdminView || !isHydratedRef.current) return;
    try {
      localStorage.setItem(`wheel_spin_mode_${wheelId}`, spinMode);
    } catch {}
  }, [spinMode, wheelId, isAdminView]);

  // Persist removeOnSpin changes to localStorage
  useEffect(() => {
    if (!isAdminView || !isHydratedRef.current) return;
    try {
      localStorage.setItem(`wheel_remove_on_spin_${wheelId}`, String(removeOnSpin));
    } catch {}
  }, [removeOnSpin, wheelId, isAdminView]);

  // Spin History state (At most 20 rows)
  const [historyList, setHistoryList] = useState<HistoryItem[]>(initialHistory.slice(0, 20));
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Current active player display
  const currentParticipant = isAdminView
    ? participants.length > 0
      ? spinMode === "sequential"
        ? participants[0]
        : "Người ngẫu nhiên"
      : "(Chưa có người quay)"
    : currentUser?.username || "Khách";

  // Sync slices prop updates
  useEffect(() => {
    setItems(slices);
  }, [slices]);

  // Toast notification helper
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Poll configuration changes from admin with ETag / 304 conditional request
  useEffect(() => {
    let cancelled = false;
    const syncWheelConfig = async () => {
      if (document.visibilityState !== "visible" || isSpinning || isSpinStarting) return;
      try {
        const response = await fetch(`/api/wheels/${wheelId}`, {
          cache: "no-store",
          headers: { "If-None-Match": wheelConfig.updatedAt },
        });
        if (response.status === 304 || !response.ok) return;
        const next = (await response.json()) as {
          name: string;
          slices: string;
          hideOnWin: boolean;
          backgroundImage: string | null;
          updatedAt: string;
        };
        if (cancelled || next.updatedAt === wheelConfig.updatedAt) return;
        const nextSlices = JSON.parse(next.slices) as WheelItem[];
        if (!Array.isArray(nextSlices)) return;
        setItems(nextSlices);
        setWheelConfig((prev) => ({
          ...prev,
          wheelName: next.name,
          hideOnWin: next.hideOnWin,
          backgroundImage: next.backgroundImage,
          updatedAt: next.updatedAt,
        }));
      } catch {
        // Keep the last known configuration
      }
    };
    const timer = window.setInterval(syncWheelConfig, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [wheelId, wheelConfig.updatedAt, isSpinning, isSpinStarting]);

  const activeItems = items.filter((item) => item.enabled);

  // Add single participant
  const handleAddParticipant = () => {
    const trimmed = newParticipantInput.trim();
    if (!trimmed) return;
    setParticipants((prev) => [...prev, trimmed]);
    setNewParticipantInput("");
  };

  // Remove single participant
  const handleRemoveParticipant = (indexToRemove: number) => {
    setParticipants((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  // Clear all participants
  const handleClearAllParticipants = () => {
    if (participants.length === 0) return;
    setParticipants([]);
  };

  // Start spin flow
  const handleSpinStartClick = async () => {
    if (activeItems.length === 0 || isSpinning || isSpinStarting || spinStartLockedRef.current) return;

    if (!currentUser && !isAdminView) {
      setCodeMessage("Vui lòng đăng nhập và nhập mã quay trước khi quay.");
      setShowCodePrompt(true);
      return;
    }

    if (!isAdminView && credits <= 0) {
      setCodeMessage("Bạn chưa có lượt quay. Hãy nhập mã quay mới.");
      setShowCodePrompt(true);
      return;
    }

    // Determine current participant for this spin
    let selectedPlayer = currentUser?.username || "Khách";
    if (isAdminView) {
      if (participants.length === 0) {
        showToast("Vui lòng thêm người tham gia vào danh sách trước khi quay.");
        return;
      }
      if (spinMode === "random") {
        const randIdx = Math.floor(Math.random() * participants.length);
        selectedPlayer = participants[randIdx];
      } else {
        selectedPlayer = participants[0];
      }
    }

    spinStartLockedRef.current = true;
    setIsSpinStarting(true);
    setWinner(null);
    setCodeMessage("");
    pendingPlayerRef.current = selectedPlayer;

    try {
      const result = await executeSpinAction(wheelId, selectedPlayer);
      if ("error" in result) {
        spinStartLockedRef.current = false;
        setIsSpinStarting(false);
        setCodeMessage(result.error || "Không thể thực hiện lượt quay.");
        setShowCodePrompt(true);
        return;
      }

      if (!isAdminView && typeof result.remainingCredits === "number" && result.remainingCredits >= 0) {
        setCredits(result.remainingCredits);
      }

      prepareWinningSound();
      pendingWonItemRef.current = result.wonItem;
      setTargetWinningIndex(result.winningIndex);
      setIsSpinStarting(false);
      setTriggerSpin(true);

      // Record to history list (limited to 20 newest rows)
      const newHistoryItem: HistoryItem = {
        id: result.historyId || String(Date.now()),
        participant: selectedPlayer,
        prize: result.wonItem.label,
        time: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) + " " + new Date().toLocaleDateString("vi-VN"),
      };
      setHistoryList((prev) => [newHistoryItem, ...prev].slice(0, 20));
    } catch {
      spinStartLockedRef.current = false;
      setIsSpinStarting(false);
      setCodeMessage("Lỗi kết nối máy chủ khi quay. Vui lòng thử lại.");
    }
  };

  const redeemCode = async () => {
    setIsRedeeming(true);
    setCodeMessage("");
    const result = await redeemSpinCodeAction(spinCode);
    setIsRedeeming(false);
    if ("success" in result && result.success) {
      setCredits(result.remaining || 0);
      setSpinCode("");
      setCodeMessage("Đã thêm lượt quay vào tài khoản.");
      setShowCodePrompt(false);
    } else {
      setCodeMessage(result.error || "Không thể dùng mã.");
    }
  };

  const handleSpinStart = () => {
    setIsSpinning(true);
  };

  const prepareWinningSound = () => {
    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return null;

      if (!winAudioContextRef.current) winAudioContextRef.current = new AudioContextClass();
      const context = winAudioContextRef.current;
      if (context.state === "suspended") void context.resume();
      return context;
    } catch {
      return null;
    }
  };

  const playWinningSound = () => {
    try {
      const context = prepareWinningSound();
      if (!context) return;
      [523.25, 659.25, 783.99].forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const startAt = context.currentTime + index * 0.14;
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, startAt);
        gain.gain.setValueAtTime(0.0001, startAt);
        gain.gain.exponentialRampToValueAtTime(0.16, startAt + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.3);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(startAt);
        oscillator.stop(startAt + 0.32);
      });
    } catch {
      // Audio enhancement
    }
  };

  const handleSpinComplete = (wonItem: WheelItem) => {
    spinStartLockedRef.current = false;
    setIsSpinning(false);
    setTriggerSpin(false);
    setTargetWinningIndex(null);

    const actualWinner = pendingWonItemRef.current || wonItem;
    const spinningPlayer = pendingPlayerRef.current || currentParticipant;

    setWinner({
      item: actualWinner,
      participant: spinningPlayer,
    });
    playWinningSound();

    // If admin configured to remove player from list, remove them now upon spin completion
    if (isAdminView && removeOnSpin && spinningPlayer) {
      setParticipants((prev) => prev.filter((name) => name !== spinningPlayer));
    }

    if (wheelConfig.hideOnWin) {
      setTimeout(() => {
        setItems((prevItems) =>
          prevItems.map((item) =>
            item.id === actualWinner.id ? { ...item, enabled: false } : item
          )
        );
      }, 1000);
    }
  };

  // Copy table results as formatted text
  const handleCopyHistory = () => {
    if (historyList.length === 0) {
      showToast("Chưa có kết quả quay để sao chép!");
      return;
    }
    const textLines = [
      "=== KẾT QUẢ VÒNG QUAY MAY MẮN ===",
      ...historyList.map(
        (h, idx) => `${idx + 1}. ${h.participant} - Trúng: ${h.prize} (${h.time})`
      ),
    ].join("\n");

    navigator.clipboard.writeText(textLines).then(() => {
      showToast("Đã sao chép kết quả quay vào clipboard!");
    });
  };

  // Clear spin history
  const handleClearHistory = async () => {
    if (historyList.length === 0) return;
    if (!confirm("Bạn có chắc chắn muốn xoá toàn bộ lịch sử quay của vòng này?")) return;
    if (isAdminView) {
      await clearWheelHistoryAction(wheelId);
    }
    setHistoryList([]);
    showToast("Đã xoá lịch sử quay!");
  };

  return (
    <div className="festive-wheel-page">
      {/* Toast Notification */}
      {toastMessage && <div className="festive-toast">{toastMessage}</div>}

      

      {/* Main Header Banner */}
      <div className="festive-header-banner">
        <h1 className="festive-main-title">
          <span className="title-red">VÒNG QUAY</span>{" "}
          <span className="title-green">MAY MẮN</span>
        </h1>
        {wheelConfig.wheelName && (
          <div className="festive-sub-title">{wheelConfig.wheelName}</div>
        )}
      </div>

      {/* Main Stage: 3 columns in Admin, centered single-column in User */}
      <div className={`festive-stage-grid ${isAdminView ? "three-columns" : "single-column"}`}>
        {/* COLUMN 1: DANH SÁCH THAM GIA (ADMIN ONLY) */}
        {isAdminView && (
          <div className="festive-card participant-card">
            <div className="card-header-red">
              <span className="header-title">
                👥 Danh sách tham gia
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span className="header-badge">{participants.length} người</span>
                {participants.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm("Bạn có chắc muốn xoá toàn bộ danh sách người tham gia?")) {
                        setParticipants([]);
                      }
                    }}
                    style={{
                      background: "rgba(255, 255, 255, 0.2)",
                      border: "1px solid rgba(255, 255, 255, 0.4)",
                      color: "#ffffff",
                      fontSize: "0.75rem",
                      padding: "0.15rem 0.5rem",
                      borderRadius: "4px",
                      cursor: "pointer",
                      fontWeight: "700",
                    }}
                    title="Xoá toàn bộ danh sách"
                  >
                    Xoá hết
                  </button>
                )}
              </div>
            </div>
            <div className="card-body">
              <p className="card-instruction">
                Nhập tên người tham gia vào danh sách bên dưới.
              </p>

              {/* Add Single Participant Input */}
              <div className="participant-add-box">
                <input
                  type="text"
                  placeholder="Nhập tên người tham gia..."
                  value={newParticipantInput}
                  onChange={(e) => setNewParticipantInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddParticipant();
                    }
                  }}
                />
                <button type="button" className="btn-add-red" onClick={handleAddParticipant}>
                  + Thêm
                </button>
              </div>

              {/* Clean Scrollable Participant List */}
              <div className="participant-items-list">
                {participants.length > 0 ? (
                  participants.map((name, index) => (
                    <div key={index} className="participant-item-row">
                      <span className="participant-index">{index + 1}</span>
                      <span className="participant-name-text">{name}</span>
                      <button
                        type="button"
                        className="btn-remove-participant"
                        onClick={() => handleRemoveParticipant(index)}
                        title="Xoá người này"
                      >
                        ×
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="participant-empty-state">
                    Chưa có người tham gia. Hãy nhập tên ở trên và bấm Thêm.
                  </div>
                )}
              </div>

              {/* Mode Options */}
              <div className="participant-options">
                <label className="radio-label">
                  <input
                    type="radio"
                    name="spinMode"
                    value="sequential"
                    checked={spinMode === "sequential"}
                    onChange={() => setSpinMode("sequential")}
                  />
                  <span>Quay lần lượt theo danh sách</span>
                </label>
                <label className="radio-label">
                  <input
                    type="radio"
                    name="spinMode"
                    value="random"
                    checked={spinMode === "random"}
                    onChange={() => setSpinMode("random")}
                  />
                  <span>Chọn người ngẫu nhiên</span>
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={removeOnSpin}
                    onChange={(e) => setRemoveOnSpin(e.target.checked)}
                  />
                  <span>Bỏ người đã quay khỏi danh sách</span>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* COLUMN 2: CENTER WHEEL & QUAY NGAY BUTTON */}
        <div className="festive-center-stage">
          {/* Active Player Display Above Wheel */}
          <div className="active-player-box">
            <span className="player-label">NGƯỜI QUAY</span>
            <span className="player-name">
              {isSpinning && pendingPlayerRef.current
                ? pendingPlayerRef.current
                : currentParticipant}
            </span>
          </div>

          {/* The Lucky Wheel */}
          <div className="wheel-canvas-wrapper">
            <LuckyWheel
              items={items}
              isSpinning={isSpinning}
              onSpinComplete={handleSpinComplete}
              onSpinStart={handleSpinStart}
              triggerSpinSignal={triggerSpin}
              setTriggerSpinSignal={setTriggerSpin}
              customWinningIndex={targetWinningIndex}
              large
              canSpin={!isSpinStarting && (isAdminView || Boolean(currentUser && credits > 0))}
              onSpinRequest={handleSpinStartClick}
            />
          </div>

          {/* Golden 3D QUAY NGAY Button */}
          <div className="spin-button-area">
            <button
              type="button"
              className="btn-golden-spin"
              onClick={handleSpinStartClick}
              disabled={
                isSpinning ||
                isSpinStarting ||
                activeItems.length === 0 ||
                (!isAdminView && (!currentUser || credits <= 0))
              }
            >
              <span className="spin-icon">🎯</span>
              <span>
                {isSpinStarting ? "Đang xác thực..." : isSpinning ? "Đang quay..." : "QUAY NGAY"}
              </span>
            </button>
          </div>

          {/* Spin Code Entry for Members */}
          {!isAdminView && (
            <div className="spin-code-card">
              <div className="code-info">
                <strong>🔑 Lượt quay của bạn</strong>
                <p>
                  {currentUser
                    ? `Lượt còn lại: ${credits} lượt`
                    : "Đăng nhập để nhận lượt quay và bắt đầu chơi."}
                </p>
              </div>
              <div className="code-input-group">
                <input
                  maxLength={10}
                  placeholder="NHẬP MÃ QUAY"
                  value={spinCode}
                  onChange={(e) => setSpinCode(e.target.value.toUpperCase())}
                  disabled={!currentUser}
                />
                <button
                  type="button"
                  className="btn-code-submit"
                  onClick={redeemCode}
                  disabled={!currentUser || !spinCode || isRedeeming}
                >
                  {isRedeeming ? "Kiểm tra..." : "Xác nhận"}
                </button>
              </div>
              {codeMessage && <div className="code-message">{codeMessage}</div>}
            </div>
          )}
        </div>

        {/* COLUMN 3: GIẢI THƯỞNG (RIGHT PANEL - ADMIN ONLY) */}
        {isAdminView && (
          <div className="festive-card prize-card">
            <div className="card-header-red">
              <span className="header-title">
                🏆 Giải thưởng
              </span>
              <span className="header-badge">{activeItems.length} ô</span>
            </div>
            <div className="card-body">
              <p className="card-instruction">
                Danh sách các ô quà đang có trên vòng quay.
              </p>

              {/* List of Real Wheel Prize Items from Database */}
              <div className="prize-items-list">
                {activeItems.map((item, index) => (
                  <div key={item.id || index} className="prize-item-row">
                    <span className="prize-index">{index + 1}</span>
                    <span className="prize-label">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* BOTTOM PANEL: KẾT QUẢ QUAY (LẤY 20 DÒNG MỚI NHẤT) */}
      <div className={`festive-history-panel ${!isAdminView ? "user-view" : ""}`}>
        <div className="history-header-red">
          <span className="header-title">
            📋 Kết quả quay (20 lượt gần nhất)
          </span>
          <div className="history-actions">
            <button
              type="button"
              className="btn-history-pill"
              onClick={handleCopyHistory}
              title="Sao chép toàn bộ kết quả"
            >
              Sao chép
            </button>
            {isAdminView && (
              <button
                type="button"
                className="btn-history-pill"
                onClick={handleClearHistory}
                title="Xoá lịch sử quay"
              >
                Xoá lịch sử
              </button>
            )}
          </div>
        </div>

        <div className="history-table-container">
          <table className="history-table">
            <thead>
              <tr>
                <th style={{ width: "60px", textAlign: "center" }}>#</th>
                <th>NGƯỜI THAM GIA</th>
                <th>GIẢI THƯỞNG</th>
                <th style={{ width: "220px", textAlign: "right" }}>THỜI GIAN</th>
              </tr>
            </thead>
            <tbody>
              {historyList.length > 0 ? (
                historyList.map((item, idx) => (
                  <tr key={item.id || idx}>
                    <td style={{ textAlign: "center", fontWeight: "700", color: "#6b7280" }}>
                      {idx + 1}
                    </td>
                    <td style={{ fontWeight: "700", color: "#dc2626" }}>
                      {item.participant}
                    </td>
                    <td>
                      <span className="prize-badge">{item.prize}</span>
                    </td>
                    <td style={{ textAlign: "right", color: "#6b7280", fontSize: "0.85rem" }}>
                      {item.time}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} style={{ textAlign: "center", padding: "2.5rem 1rem", color: "#9ca3af" }}>
                    Chưa có lượt quay nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Winner Reveal Modal Popup */}
      {winner && (
        <div
          className="wheel-result-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) setWinner(null);
          }}
          role="presentation"
        >
          <div className="wheel-result-popup festive-winner-popup" role="dialog" aria-modal="true" aria-label="Kết quả vòng quay">
            <button
              type="button"
              className="wheel-result-close"
              onClick={() => setWinner(null)}
              aria-label="Đóng thông báo"
            >
              ×
            </button>
            <span className="wheel-result-sparkle">🎉</span>
            <span className="wheel-result-title">CHÚC MỪNG CHIẾN THẮNG!</span>
            <div className="winner-participant-name">
              Người quay: <strong>{winner.participant}</strong>
            </div>
            <strong className="winner-prize-name">{winner.item.label}</strong>
            <small>Bấm bên ngoài thông báo hoặc nút × để đóng</small>
          </div>
        </div>
      )}

      {/* No Credits Prompt Modal */}
      {showCodePrompt && (
        <button
          type="button"
          className="wheel-result-backdrop"
          onClick={() => setShowCodePrompt(false)}
          aria-label="Đóng thông báo mã quay"
        >
          <span className="wheel-result-popup wheel-code-popup">
            <span className="wheel-result-sparkle">🔑</span>
            <span className="wheel-result-title">CHƯA CÓ LƯỢT QUAY</span>
            <strong>{currentUser ? "Hãy nhập mã quay để bắt đầu" : "Hãy đăng nhập và nhập mã quay"}</strong>
            <small>
              {currentUser
                ? "Nhập mã ở khung phía dưới vòng quay, sau đó bấm Xác nhận."
                : "Đăng nhập để sử dụng mã quay và bắt đầu."}
            </small>
          </span>
        </button>
      )}
    </div>
  );
}
