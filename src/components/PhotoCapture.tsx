"use client";

import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { Camera, Check, ImagePlus, RotateCcw, SwitchCamera } from "lucide-react";

type PhotoCaptureProps = {
  label: string;
  onPhoto: (file: File | null) => void;
  required?: boolean;
  preview?: string | null;
};

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.85;

// Сжимаем фото на клиенте: у Vercel лимит ~4.5 МБ на запрос (а фото два),
// плюс сжатые фото быстрее грузятся и меньше занимают места в базе.
// Если браузер не смог декодировать файл (например, HEIC в Chrome) — отдаём как есть.
const compressImage = (file: File): Promise<File> =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(file);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file);
              return;
            }
            const baseName = file.name.replace(/\.[^.]+$/, "") || "photo";
            resolve(new File([blob], `${baseName}.jpg`, { type: "image/jpeg" }));
          },
          "image/jpeg",
          JPEG_QUALITY,
        );
      } catch {
        resolve(file);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });

export default function PhotoCapture({ label, onPhoto, required = true, preview = null }: PhotoCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<"camera" | "file">("camera");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");

  // Камера живёт ровно столько, сколько показан видоискатель: эффект сам
  // открывает поток и в cleanup гарантированно его закрывает (раньше stopCamera
  // видел устаревший stream из замыкания, и камера не выключалась).
  const cameraActive = mode === "camera" && !capturedFile && !preview;
  useEffect(() => {
    if (!cameraActive) return;
    let cancelled = false;
    let mediaStream: MediaStream | null = null;
    const video = videoRef.current;

    Promise.resolve()
      .then(() =>
        navigator.mediaDevices.getUserMedia({
          video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
        }),
      )
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        mediaStream = s;
        setStream(s);
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch(() => {
        if (cancelled) return;
        setError("Не удалось получить доступ к камере. Выберите фото из галереи.");
        setMode("file");
      });

    return () => {
      cancelled = true;
      mediaStream?.getTracks().forEach((t) => t.stop());
      if (video) video.srcObject = null;
      setStream(null);
    };
  }, [cameraActive, facingMode]);

  // Превью выбранного фото: один object URL на файл, освобождаем при смене
  const previewUrl = useMemo(
    () => (capturedFile ? URL.createObjectURL(capturedFile) : null),
    [capturedFile],
  );
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const capture = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `capture_${Date.now()}.jpg`, { type: "image/jpeg" });
        setCapturedFile(file);
        onPhoto(file);
      }
    }, "image/jpeg", 0.9);
  }, [onPhoto]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const original = e.target.files?.[0] || null;
    if (!original) return;
    const file = await compressImage(original);
    setCapturedFile(file);
    onPhoto(file);
  };

  const clearPhoto = () => {
    setCapturedFile(null);
    onPhoto(null);
  };

  const switchCamera = () => {
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  };

  const tabClass = (active: boolean) =>
    `flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold transition ${
      active ? "bg-paper text-ink shadow-sm" : "text-ink-soft hover:text-ink"
    }`;

  return (
    <div className="space-y-2.5">
      {(capturedFile || preview) ? (
        <div className="group relative overflow-hidden rounded-2xl ring-1 ring-sand">
          <img
            src={previewUrl ?? preview!}
            alt="Превью"
            className="h-44 w-full object-cover"
          />
          <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-forest/85 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur">
            <Check size={12} strokeWidth={3} /> Готово
          </span>
          <button
            type="button"
            onClick={clearPhoto}
            className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-paper/90 px-3 py-1.5 text-xs font-bold text-ink shadow backdrop-blur transition hover:bg-paper active:scale-95"
            title="Переснять"
          >
            <RotateCcw size={13} /> Переснять
          </button>
        </div>
      ) : (
        <>
          <div className="flex gap-1 rounded-full bg-sand/70 p-1">
            <button type="button" onClick={() => { setError(null); setMode("camera"); }} className={tabClass(mode === "camera")}>
              <Camera size={14} /> Камера
            </button>
            <button type="button" onClick={() => setMode("file")} className={tabClass(mode === "file")}>
              <ImagePlus size={14} /> Из галереи
            </button>
          </div>

          {error && <p className="text-xs font-medium text-tangerine-dark">{error}</p>}

          {mode === "camera" && (
            <div className="relative overflow-hidden rounded-2xl bg-night">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="max-h-64 w-full object-cover"
                style={{ aspectRatio: "4/3" }}
              />
              <canvas ref={canvasRef} className="hidden" />
              {stream && (
                <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-6">
                  <span className="h-10 w-10" />
                  <button
                    type="button"
                    onClick={capture}
                    aria-label="Сфотографировать"
                    className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white/90 bg-white/20 backdrop-blur transition active:scale-90"
                  >
                    <span className="h-11 w-11 rounded-full bg-white" />
                  </button>
                  <button
                    type="button"
                    onClick={switchCamera}
                    aria-label="Переключить камеру"
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur transition active:scale-90"
                  >
                    <SwitchCamera size={18} />
                  </button>
                </div>
              )}
            </div>
          )}

          {mode === "file" && (
            <label
              htmlFor={`photo-input-${label}`}
              className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-sand-dark bg-paper px-4 py-7 text-center transition hover:border-forest-light hover:bg-cream"
            >
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                onChange={handleFileChange}
                className="hidden"
                id={`photo-input-${label}`}
              />
              <span className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-moss/40 text-forest">
                <ImagePlus size={20} />
              </span>
              <span className="text-sm font-bold text-ink">Выбрать фото</span>
              <span className="mt-0.5 text-xs text-ink-soft">
                JPEG, PNG, WebP, HEIC — сожмём автоматически
              </span>
            </label>
          )}
        </>
      )}
    </div>
  );
}
