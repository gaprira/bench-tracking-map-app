"use client";

import { useRef, useState, useEffect, useCallback } from "react";

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

  useEffect(() => {
    if (mode === "camera") {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [mode, facingMode]);

  const startCamera = async () => {
    try {
      setError(null);
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      setError("Не удалось получить доступ к камере. Попробуйте загрузить файл.");
      setMode("file");
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

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

  const displayFile = capturedFile || (preview ? { name: "preview" } as File : null);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-slate-600">
        <button
          type="button"
          onClick={() => setMode("camera")}
          className={`px-2 py-1 rounded ${mode === "camera" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
        >
          Камера
        </button>
        <button
          type="button"
          onClick={() => setMode("file")}
          className={`px-2 py-1 rounded ${mode === "file" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
        >
          Файл
        </button>
        {required && <span className="text-red-500">*</span>}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {mode === "camera" && (
        <div className="relative">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="w-full max-h-64 rounded-lg bg-slate-100"
            style={{ aspectRatio: "16/9" }}
          />
          <canvas ref={canvasRef} className="hidden" />
          {stream && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-2">
              <button
                type="button"
                onClick={switchCamera}
                className="rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium shadow backdrop-blur"
              >
                🔄 Переключить
              </button>
              <button
                type="button"
                onClick={capture}
                className="rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white shadow"
              >
                📸 Сфотографировать
              </button>
            </div>
          )}
        </div>
      )}

      {mode === "file" && (
        <div className="rounded-lg border-2 border-dashed border-slate-300 p-4 text-center">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            onChange={handleFileChange}
            className="hidden"
            id={`photo-input-${label}`}
          />
          <label
            htmlFor={`photo-input-${label}`}
            className="cursor-pointer text-sm text-slate-600 hover:text-slate-800"
          >
            Нажмите или перетащите фото сюда
          </label>
          <p className="text-xs text-slate-400 mt-1">JPEG, PNG, WebP, HEIC — фото сожмётся автоматически</p>
        </div>
      )}

      {(capturedFile || preview) && (
        <div className="relative rounded-lg overflow-hidden border border-slate-200">
          {capturedFile ? (
            <img
              src={URL.createObjectURL(capturedFile)}
              alt="Превью"
              className="w-full h-auto max-h-48 object-cover"
            />
          ) : preview && (
            <img
              src={preview}
              alt="Превью"
              className="w-full h-auto max-h-48 object-cover"
            />
          )}
          <button
            type="button"
            onClick={clearPhoto}
            className="absolute top-1 right-1 rounded-full bg-red-600/90 p-1 text-white shadow hover:bg-red-700"
            title="Удалить фото"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}