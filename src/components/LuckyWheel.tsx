"use client";

import React, { useRef, useEffect, useState } from "react";

export interface WheelItem {
  id: string;
  label: string;
  color: string;
  weight: number;
  enabled: boolean;
}

interface LuckyWheelProps {
  items: WheelItem[];
  isSpinning: boolean;
  onSpinComplete: (item: WheelItem) => void;
  onSpinStart: () => void;
  triggerSpinSignal: boolean;
  setTriggerSpinSignal: (val: boolean) => void;
  customWinningIndex: number | null;
  large?: boolean;
  canSpin?: boolean;
  onSpinRequest?: () => void;
}

export default function LuckyWheel({
  items,
  isSpinning,
  onSpinComplete,
  onSpinStart,
  triggerSpinSignal,
  setTriggerSpinSignal,
  customWinningIndex,
  large = false,
  canSpin = true,
  onSpinRequest,
}: LuckyWheelProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Animation values
  const [angle, setAngle] = useState(0);
  const activeItems = items.filter((item) => item.enabled);

  // Play tick sound when crossing segment boundary
  const lastTickSegmentRef = useRef<number>(-1);

  const initAudio = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  };

  const playTickSound = (frequency = 800) => {
    try {
      initAudio();
      const ctx = audioCtxRef.current;
      if (!ctx || ctx.state === "suspended") return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = "triangle";
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.04);

      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);

      osc.start();
      osc.stop(ctx.currentTime + 0.04);
    } catch {
      // Audio context might be blocked or failed
    }
  };

  // Run the spin animation
  const spin = (winningIndex: number) => {
    if (activeItems.length === 0) return;

    onSpinStart();

    const duration = 5000; // 5 seconds
    const startTimestamp = performance.now();
    const startAngle = angle % 360;

    const sliceAngle = 360 / activeItems.length;

    // Target stop angle calculation
    // Pointer is at the top (270 degrees in canvas coordinates)
    const targetSliceCenter = winningIndex * sliceAngle + sliceAngle / 2;
    const extraSpins = 6 * 360;
    const targetAngle = extraSpins + (270 - targetSliceCenter);
    const totalRotation = targetAngle - startAngle;

    lastTickSegmentRef.current = -1;

    const animate = (now: number) => {
      const elapsed = now - startTimestamp;
      const progress = Math.min(elapsed / duration, 1);

      // easeOutQuart formula: 1 - (1 - progress)^4
      const easeProgress = 1 - Math.pow(1 - progress, 4);
      const currentAngle = startAngle + totalRotation * easeProgress;

      setAngle(currentAngle);

      // Calculate current slice at pointer for tick sounds
      const normalizedAngle = ((currentAngle % 360) + 360) % 360;
      const pointerAngle = (270 - normalizedAngle + 360) % 360;
      const currentSegment = Math.floor(pointerAngle / sliceAngle) % activeItems.length;

      if (currentSegment !== lastTickSegmentRef.current && progress < 0.99) {
        lastTickSegmentRef.current = currentSegment;
        const pitch = 700 + (1 - progress) * 300;
        playTickSound(pitch);
      }

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        // Spin finished
        setTriggerSpinSignal(false);
        onSpinComplete(activeItems[winningIndex]);
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);
  };

  // Trigger spin based on signal
  useEffect(() => {
    if (triggerSpinSignal && !isSpinning && activeItems.length > 0) {
      initAudio();

      let chosenIndex = 0;
      if (customWinningIndex !== null && customWinningIndex >= 0 && customWinningIndex < activeItems.length) {
        chosenIndex = customWinningIndex;
      } else {
        const totalWeight = activeItems.reduce((acc, item) => acc + item.weight, 0);
        let randomVal = Math.random() * totalWeight;

        for (let i = 0; i < activeItems.length; i++) {
          randomVal -= activeItems[i].weight;
          if (randomVal <= 0) {
            chosenIndex = i;
            break;
          }
        }
      }

      spin(chosenIndex);
    }
  }, [triggerSpinSignal]);

  // Clean up animation on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Redraw canvas when items or angle changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Handle high DPI displays (Retina)
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(centerX, centerY) - 24;

    // Clear background
    ctx.clearRect(0, 0, width, height);

    if (activeItems.length === 0) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
      ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
      ctx.font = "16px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Không có ô nào kích hoạt", centerX, centerY);
      return;
    }

    const sliceAngle = (2 * Math.PI) / activeItems.length;
    const radAngle = (angle * Math.PI) / 180;

    const rimWidth = 24;
    const innerRadius = radius - rimWidth;

    // 1. Festive outer shadow glow
    ctx.save();
    ctx.shadowBlur = 24;
    ctx.shadowColor = "rgba(220, 38, 38, 0.35)";
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.fillStyle = "#b91c1c";
    ctx.fill();
    ctx.restore();

    // 2. Draw Slices inside innerRadius (Alternating Red and White)
    activeItems.forEach((item, i) => {
      const startAngle = i * sliceAngle + radAngle;
      const endAngle = startAngle + sliceAngle;

      const isEven = i % 2 === 0;
      const sliceBg = isEven ? "#dc2626" : "#ffffff";
      const textColor = isEven ? "#ffffff" : "#b91c1c";

      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, innerRadius, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = sliceBg;
      ctx.fill();

      // Divider lines (golden yellow)
      ctx.strokeStyle = "#facc15";
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Slice Text labels (aligned radially along each spoke)
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(startAngle + sliceAngle / 2);
      ctx.fillStyle = textColor;
      if (isEven) {
        ctx.shadowBlur = 2;
        ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
      } else {
        ctx.shadowBlur = 0;
      }

      const fontSize = activeItems.length > 16 ? 11 : activeItems.length > 10 ? 13 : 15;
      ctx.font = `900 ${fontSize}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      let text = item.label;
      if (text.length > 18) {
        text = text.substring(0, 16) + "..";
      }

      ctx.fillText(text, innerRadius * 0.58, 0);
      ctx.restore();
    });

    // 3. Draw Outer Festive Rim with Golden Bulbs
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.strokeStyle = "#ca8a04";
    ctx.lineWidth = 3.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(centerX, centerY, innerRadius, 0, 2 * Math.PI);
    ctx.strokeStyle = "#ca8a04";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Golden light bulbs around the rim
    const numBulbs = 24;
    for (let b = 0; b < numBulbs; b++) {
      const bAngle = (b * 2 * Math.PI) / numBulbs;
      const bulbRadius = radius - rimWidth / 2;
      const bx = centerX + bulbRadius * Math.cos(bAngle);
      const by = centerY + bulbRadius * Math.sin(bAngle);

      ctx.save();
      ctx.beginPath();
      ctx.arc(bx, by, 3.8, 0, 2 * Math.PI);
      const isLit = b % 2 === Math.floor(angle / 10) % 2;
      ctx.fillStyle = isLit ? "#fef08a" : "#f59e0b";
      ctx.shadowBlur = isLit ? 10 : 3;
      ctx.shadowColor = "#fde047";
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 0.5;
      ctx.stroke();
      ctx.restore();
    }

    // 4. Draw Golden Center Hub with "QUAY"
    const hubRadius = 42;
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, hubRadius, 0, 2 * Math.PI);
    const hubGrad = ctx.createRadialGradient(centerX - 10, centerY - 10, 2, centerX, centerY, hubRadius);
    hubGrad.addColorStop(0, "#fef9c3");
    hubGrad.addColorStop(0.35, "#facc15");
    hubGrad.addColorStop(0.8, "#eab308");
    hubGrad.addColorStop(1, "#ca8a04");
    ctx.fillStyle = hubGrad;
    ctx.shadowBlur = 16;
    ctx.shadowColor = "rgba(202, 138, 4, 0.6)";
    ctx.fill();

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(centerX, centerY, hubRadius - 3.5, 0, 2 * Math.PI);
    ctx.strokeStyle = "#b45309";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = "#7f1d1d";
    ctx.shadowBlur = 0;
    ctx.font = "900 16px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("QUAY", centerX, centerY);
    ctx.restore();

    // 5. Draw Top Golden Teardrop Pointer Pin with Red Jewel
    ctx.save();
    const pinTipY = centerY - innerRadius + 14;
    const pinCenterY = centerY - radius - 2;

    ctx.beginPath();
    ctx.moveTo(centerX, pinTipY);
    ctx.lineTo(centerX - 14, pinCenterY);
    ctx.arc(centerX, pinCenterY, 14, Math.PI, 0, false);
    ctx.lineTo(centerX, pinTipY);
    ctx.closePath();

    const pinGrad = ctx.createLinearGradient(centerX - 14, pinCenterY - 14, centerX + 14, pinTipY);
    pinGrad.addColorStop(0, "#fef08a");
    pinGrad.addColorStop(0.5, "#eab308");
    pinGrad.addColorStop(1, "#b45309");
    ctx.fillStyle = pinGrad;
    ctx.shadowBlur = 12;
    ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
    ctx.fill();

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Red jewel in the center of the pin
    ctx.beginPath();
    ctx.arc(centerX, pinCenterY, 5, 0, 2 * Math.PI);
    ctx.fillStyle = "#dc2626";
    ctx.fill();
    ctx.strokeStyle = "#fef08a";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }, [angle, activeItems]);

  return (
    <div
      className="wheel-canvas-container"
      style={{
        position: "relative",
        width: "100%",
        maxWidth: large ? "560px" : "420px",
        aspectRatio: "1/1",
        margin: "0 auto",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          cursor: isSpinning || !canSpin ? "not-allowed" : "pointer",
          position: "relative",
          zIndex: 1,
        }}
        onClick={() => {
          if (!isSpinning && canSpin) {
            if (onSpinRequest) onSpinRequest();
            else setTriggerSpinSignal(true);
          }
        }}
      />
    </div>
  );
}
