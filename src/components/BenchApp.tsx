"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { BenchDetails, BenchSummary } from "@/lib/types";
import Stars from "./Stars";
import PhotoCapture from "./PhotoCapture";

const BenchMap = dynamic(() => import("./BenchMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-slate-100 to-emerald-50 text-slate-400">
      <span className="animate-pulse-soft text-5xl">🗺️</span>
      <span className="text-sm font-medium">Загружаем карту…</span>
    </div>
  ),
});

type Draft = { lat: number; lng: number };
type Focus = { lat: number; lng: number; zoom?: number } | null;
type Sort = "new" | "rating" | "reviews";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function pluralReviews(n: number) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} рецензия`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${n} рецензии`;
  return `${n} рецензий`;
}

const AVATAR_GRADIENTS = [
  "from-emerald-400 to-teal-500",
  "from-amber-400 to-orange-500",
  "from-sky-400 to-blue-500",
  "from-rose-400 to-pink-500",
  "from-violet-400 to-purple-500",
];

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/15";

export default function BenchApp() {
  const [benches, setBenches] = useState<BenchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [details, setDetails] = useState<BenchDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [addMode, setAddMode] = useState(false);
  const [focus, setFocus] = useState<Focus>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("new");
  const [error, setError] = useState<string | null>(null);
  const [author, setAuthor] = useState("");
  const [mobileTab, setMobileTab] = useState<"map" | "list">("map");
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [adminKey, setAdminKey] = useState("");
  const [showAdminLogin, setShowAdminLogin] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("bench-author");
    if (saved) setAuthor(saved);
  }, []);
  useEffect(() => {
    window.localStorage.setItem("bench-author", author);
  }, [author]);

  useEffect(() => {
    const savedAdmin = window.localStorage.getItem("bench-admin-key");
    if (savedAdmin) setAdminKey(savedAdmin);
  }, []);
  useEffect(() => {
    if (adminKey) window.localStorage.setItem("bench-admin-key", adminKey);
    else window.localStorage.removeItem("bench-admin-key");
  }, [adminKey]);

  const loadBenches = useCallback(async () => {
    try {
      const res = await fetch("/api/benches", { cache: "no-store" });
      if (!res.ok) throw new Error();
      setBenches(await res.json());
    } catch {
      setError("Не удалось загрузить скамейки");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetails = useCallback(async (id: number) => {
    setDetailsLoading(true);
    try {
      const res = await fetch(`/api/benches/${id}`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      setDetails(await res.json());
    } catch {
      setError("Не удалось загрузить скамейку");
      setDetails(null);
    } finally {
      setDetailsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBenches();
  }, [loadBenches]);

  useEffect(() => {
    if (selectedId !== null) loadDetails(selectedId);
    else setDetails(null);
  }, [selectedId, loadDetails]);

  const handleSelect = (id: number) => {
    setDraft(null);
    setAddMode(false);
    setSelectedId(id);
    const b = benches.find((x) => x.id === id);
    if (b) setFocus({ lat: b.lat, lng: b.lng });
    setMobileTab("list");
  };

  const handleMapClick = (lat: number, lng: number) => {
    if (!addMode) return;
    setDraft({ lat, lng });
    setSelectedId(null);
    setMobileTab("list");
  };

  const handleCreated = (bench: BenchSummary) => {
    setBenches((prev) => [bench, ...prev]);
    setDraft(null);
    setAddMode(false);
    setSelectedId(bench.id);
    setFocus({ lat: bench.lat, lng: bench.lng });
  };

  const handleReviewAdded = async () => {
    if (selectedId !== null) {
      await Promise.all([loadDetails(selectedId), loadBenches()]);
    }
  };

  // Открыть внутреннее подтверждение удаления (window.confirm блокируется
  // во встроенных окнах предпросмотра и iframe, поэтому делаем свою модалку)
  const handleDelete = (id: number) => {
    setDeleteTarget(id);
  };

  const handleDeleteConfirmed = async () => {
    if (deleteTarget === null) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/benches/${deleteTarget}`, {
        method: "DELETE",
        headers: { "x-admin-key": adminKey },
      });
      if (res.ok) {
        setBenches((prev) => prev.filter((b) => b.id !== deleteTarget));
        setSelectedId(null);
      } else {
        setError("Не удалось удалить скамейку");
      }
    } catch {
      setError("Не удалось удалить скамейку");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const locateMe = () => {
    if (!navigator.geolocation) {
      setError("Геолокация недоступна в этом браузере");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setFocus({ lat: pos.coords.latitude, lng: pos.coords.longitude, zoom: 16 }),
      () => setError("Не удалось определить местоположение"),
    );
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? benches.filter(
          (b) =>
            b.title.toLowerCase().includes(q) ||
            (b.description ?? "").toLowerCase().includes(q),
        )
      : [...benches];
    list.sort((a, b) => {
      if (sort === "rating") return (b.avgRating ?? 0) - (a.avgRating ?? 0);
      if (sort === "reviews") return b.reviewCount - a.reviewCount;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return list;
  }, [benches, search, sort]);

  const stats = useMemo(() => {
    const total = benches.length;
    const reviewsTotal = benches.reduce((s, b) => s + b.reviewCount, 0);
    const rated = benches.filter((b) => b.avgRating !== null);
    const avg =
      rated.length === 0
        ? null
        : rated.reduce((s, b) => s + (b.avgRating ?? 0), 0) / rated.length;
    return { total, reviewsTotal, avg };
  }, [benches]);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(t);
  }, [error]);

  return (
    <div className="flex h-dvh flex-col bg-slate-100">
      {/* Header */}
      <header className="relative z-20 overflow-hidden bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-600 shadow-lg shadow-emerald-900/20">
        <div className="bg-dots-emerald absolute inset-0" aria-hidden />
        <div className="relative flex items-center flex-wrap justify-center gap-3 px-3 py-3 md:justify-between md:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-2xl shadow-lg ring-4 ring-white/20">
              🪑
            </div>
            <div>
              <h1 className="text-xl font-extrabold leading-tight tracking-tight text-white drop-shadow-sm">
                Скамейки
              </h1>
              <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-emerald-100">
                <span className="rounded-full bg-white/15 px-2 py-0.5">
                  {stats.total} на карте
                </span>
                <span className="rounded-full bg-white/15 px-2 py-0.5">
                  {pluralReviews(stats.reviewsTotal)}
                </span>
                {stats.avg !== null && (
                  <span className="rounded-full bg-amber-400 px-2 py-0.5 font-extrabold text-amber-950">
                    ★ {stats.avg.toFixed(1)}
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Ваше имя"
              maxLength={80}
              className="hidden w-36 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-sm text-white outline-none backdrop-blur-sm transition placeholder:text-emerald-200/60 focus:border-white/40 focus:bg-white/20 sm:block"
            />
            <button
              onClick={locateMe}
              title="Моё местоположение"
              className="rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-sm backdrop-blur-sm transition hover:bg-white/20 active:scale-95"
            >
              📍
            </button>
            <button
              onClick={() => {
                if (adminKey) {
                  setAdminKey("");
                } else {
                  setShowAdminLogin(true);
                }
              }}
              title={
                adminKey
                  ? "Вы админ — нажмите, чтобы выйти из режима модерации"
                  : "Войти как администратор"
              }
              className={
                adminKey
                  ? "rounded-full bg-emerald-400/95 px-3.5 py-1.5 text-sm font-bold text-emerald-950 shadow-lg shadow-emerald-400/30 transition active:scale-95"
                  : "rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-sm backdrop-blur-sm transition hover:bg-white/20 active:scale-95"
              }
            >
              {adminKey ? "🛡 Админ" : "🛡"}
            </button>
            <button
              onClick={() => {
                setAddMode((v) => !v);
                setDraft(null);
                setSelectedId(null);
                setMobileTab("map");
              }}
              className={`rounded-full px-4 py-1.5 text-sm font-bold shadow-lg transition active:scale-95 ${
                addMode
                  ? "bg-white/15 text-white hover:bg-white/25"
                  : "bg-amber-400 text-amber-950 shadow-amber-500/30 hover:bg-amber-300"
              }`}
            >
              {addMode ? "Отмена" : "+ Добавить"}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile tabs */}
      <div className="flex bg-gradient-to-r from-emerald-800 to-teal-600 md:hidden">
        {(["map", "list"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setMobileTab(t)}
            className={`flex-1 py-2.5 text-sm font-semibold transition ${
              mobileTab === t
                ? "border-b-2 border-amber-400 bg-white/10 text-white"
                : "text-emerald-200/70"
            }`}
          >
            {t === "map" ? "Карта" : "Список"}
          </button>
        ))}
      </div>

      <div className="relative flex min-h-0 flex-1">
        {/* Sidebar */}
        <aside
          className={`${
            mobileTab === "list" ? "flex" : "hidden"
          } w-full flex-col border-r border-slate-200/80 bg-white shadow-xl p-4 md:p-6 md:flex md:w-[410px] lg:w-[450px]`}
        >
          {draft ? (
            <AddBenchForm
              draft={draft}
              author={author}
              onAuthorChange={setAuthor}
              onCancel={() => {
                setDraft(null);
              }}
              onCreated={handleCreated}
              onError={setError}
            />
          ) : selectedId !== null ? (
            <BenchDetailsPanel
              details={details}
              loading={detailsLoading}
              author={author}
              onAuthorChange={setAuthor}
              onBack={() => setSelectedId(null)}
              onDelete={() => handleDelete(selectedId)}
              onReviewAdded={handleReviewAdded}
              onError={setError}
              isAdmin={Boolean(adminKey)}
              adminKey={adminKey}
            />
          ) : (
            <BenchList
              benches={filtered}
              loading={loading}
              search={search}
              onSearch={setSearch}
              sort={sort}
              onSort={setSort}
              onSelect={handleSelect}
              onStartAdd={() => {
                setAddMode(true);
                setMobileTab("map");
              }}
            />
          )}
        </aside>

        {/* Map */}
        <main
          className={`${
            mobileTab === "map" ? "block" : "hidden"
          } bg-dots-slate relative min-h-0 flex-1 bg-gradient-to-br from-slate-100 via-slate-50 to-emerald-50 p-3 md:p-4`}
        >
          <div className="relative h-full overflow-hidden md:rounded-2xl md:shadow-2xl md:shadow-emerald-900/15 md:ring-1 md:ring-slate-900/10">
            <BenchMap
            benches={benches}
            selectedId={selectedId}
            draft={draft}
            focus={focus}
            onSelect={handleSelect}
            onMapClick={handleMapClick}
          />
          </div>
          {addMode && !draft && (
            <div className="pointer-events-none absolute left-1/2 top-4 z-[1000] -translate-x-1/2 rounded-full bg-gradient-to-r from-amber-500 to-orange-400 px-5 py-2.5 text-sm font-bold text-white shadow-xl shadow-amber-500/30">
              Нажмите на карту, чтобы отметить скамейку
            </div>
          )}
          <div className="absolute bottom-4 left-4 z-[1000] hidden rounded-xl border border-white/60 bg-white/80 p-2.5 text-xs shadow-lg backdrop-blur-md sm:block">
            <div className="mb-1.5 font-bold text-slate-700">Легенда</div>
            <Legend color="#16a34a" label="4.5+ отличная" />
            <Legend color="#65a30d" label="3.5–4.4 хорошая" />
            <Legend color="#f59e0b" label="2.5–3.4 так себе" />
            <Legend color="#dc2626" label="< 2.5 плохая" />
            <Legend color="#64748b" label="без оценок" />
          </div>
        </main>

        {error && (
          <div className="absolute bottom-4 left-1/2 z-[2000] -translate-x-1/2 animate-fade-in rounded-full border border-rose-400/30 bg-rose-600 px-5 py-2.5 text-sm font-medium text-white shadow-xl shadow-rose-600/30">
            {error}
          </div>
        )}

        {/* Модальное подтверждение удаления */}
        {deleteTarget !== null && (
          <div
            className="fixed inset-0 z-[4000] flex animate-fade-in items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
            onClick={() => !deleting && setDeleteTarget(null)}
          >
            <div
              className="w-full max-w-sm animate-zoom-in rounded-3xl bg-white p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-100 text-2xl">
                🗑️
              </div>
              <h2 className="text-center text-lg font-extrabold text-slate-900">
                Удалить скамейку?
              </h2>
              <p className="mt-2 text-center text-sm leading-relaxed text-slate-500">
                Скамейка и все её рецензии будут удалены. Действие необратимо.
              </p>
              <div className="mt-5 flex gap-2.5">
                <button
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleting}
                  className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Отмена
                </button>
                <button
                  onClick={handleDeleteConfirmed}
                  disabled={deleting}
                  className="flex-1 rounded-xl bg-gradient-to-r from-rose-500 to-red-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-rose-600/25 transition hover:shadow-xl active:scale-[0.98] disabled:opacity-50"
                >
                  {deleting ? "Удаляем…" : "Удалить"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Вход администратора */}
        {showAdminLogin && (
          <AdminLoginModal
            onClose={() => setShowAdminLogin(false)}
            onSuccess={(key) => {
              setAdminKey(key);
              setShowAdminLogin(false);
            }}
            onError={setError}
          />
        )}
      </div>
    </div>
  );
}

function AdminLoginModal({
  onClose,
  onSuccess,
  onError,
}: {
  onClose: () => void;
  onSuccess: (key: string) => void;
  onError: (msg: string) => void;
}) {
  const [key, setKey] = useState("");
  const [checking, setChecking] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = key.trim();
    if (!trimmed) return;
    setChecking(true);
    try {
      const res = await fetch("/api/admin/verify", {
        headers: { "x-admin-key": trimmed },
      });
      const data = await res.json();
      if (data.ok) {
        onSuccess(trimmed);
      } else {
        throw new Error("Неверный ключ администратора");
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось проверить ключ");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[4000] flex animate-fade-in items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        className="w-full max-w-xs animate-zoom-in rounded-3xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-2xl">
          🛡️
        </div>
        <h2 className="text-center text-lg font-extrabold text-slate-900">
          Вход администратора
        </h2>
        <p className="mt-1 text-center text-xs text-slate-400">
          Введите ключ модерации — он сохранится в этом браузере
        </p>
        <input
          type="password"
          autoFocus
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="Ключ администратора"
          className="mt-4 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/15"
        />
        <div className="mt-4 flex gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={checking || !key.trim()}
            className="flex-1 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-600/25 transition hover:shadow-xl active:scale-[0.98] disabled:opacity-40"
          >
            {checking ? "Проверяем…" : "Войти"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2 text-slate-600">
      <span
        className="inline-block h-3 w-3 rounded-full border border-white shadow-sm"
        style={{ background: color }}
      />
      {label}
    </div>
  );
}

/* ---------------- Лайтбокс для фото ---------------- */

function Lightbox({
  photos,
  index,
  onIndex,
  onClose,
}: {
  photos: { src: string; caption: string }[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
      if (e.key === "ArrowRight" && index < photos.length - 1) onIndex(index + 1);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose, onIndex, index, photos.length]);

  const photo = photos[index];
  if (!photo) return null;

  return (
    <div
      className="fixed inset-0 z-[5000] flex animate-fade-in items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative max-w-4xl animate-zoom-in"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={photo.src}
          alt={photo.caption}
          className="max-h-[80vh] w-auto max-w-full rounded-2xl bg-slate-900 object-contain shadow-2xl"
        />
        {photos.length > 1 && (
          <>
            {index > 0 && (
              <button
                onClick={() => onIndex(index - 1)}
                aria-label="Предыдущее фото"
                className="absolute -left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-2xl text-white shadow-lg backdrop-blur-sm transition hover:bg-white/30 active:scale-95"
              >
                ‹
              </button>
            )}
            {index < photos.length - 1 && (
              <button
                onClick={() => onIndex(index + 1)}
                aria-label="Следующее фото"
                className="absolute -right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-2xl text-white shadow-lg backdrop-blur-sm transition hover:bg-white/30 active:scale-95"
              >
                ›
              </button>
            )}
          </>
        )}
        <div className="mt-3 flex items-center justify-center gap-2 text-sm font-medium text-white/90">
          <span className="rounded-full bg-white/10 px-3.5 py-1.5 backdrop-blur-sm">
            {photo.caption}
            {photos.length > 1 && (
              <span className="text-white/50"> · {index + 1} / {photos.length}</span>
            )}
          </span>
          <span className="hidden text-xs text-white/50 sm:inline">
            Esc или клик по фону — закрыть
          </span>
        </div>
        <button
          onClick={onClose}
          aria-label="Закрыть"
          className="absolute -right-2 -top-2 flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-lg text-white shadow-lg backdrop-blur-sm transition hover:rotate-90 hover:bg-white/30"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

/* ---------------- List ---------------- */

function BenchList({
  benches,
  loading,
  search,
  onSearch,
  sort,
  onSort,
  onSelect,
  onStartAdd,
}: {
  benches: BenchSummary[];
  loading: boolean;
  search: string;
  onSearch: (v: string) => void;
  sort: Sort;
  onSort: (v: Sort) => void;
  onSelect: (id: number) => void;
  onStartAdd: () => void;
}) {
  return (
    <>
      <div className="space-y-3 border-b border-slate-200/80 p-3">
        <div className="relative">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
            🔍
          </span>
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Поиск по названию или описанию…"
            className="w-full rounded-full border border-slate-200 bg-slate-100/80 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-500/10"
          />
        </div>
        <div className="flex gap-1.5 text-xs">
          {(
            [
              ["new", "Новые"],
              ["rating", "По рейтингу"],
              ["reviews", "По отзывам"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => onSort(key)}
              className={`rounded-full px-3 py-1.5 font-semibold transition ${
                sort === key
                  ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-600/25"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {loading ? (
          <div className="p-6 text-center text-sm font-medium text-slate-400">
            Загрузка…
          </div>
        ) : benches.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-8 text-center">
            <div className="animate-pulse-soft mb-3 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-emerald-100 to-amber-100 text-5xl shadow-inner">
              🪑
            </div>
            <p className="text-sm font-bold text-slate-700">
              {search ? "Ничего не найдено" : "Пока ни одной скамейки"}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {search
                ? "Попробуйте изменить запрос"
                : "Отметьте первую — это займёт минуту"}
            </p>
            {!search && (
              <button
                onClick={onStartAdd}
                className="mt-4 rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2 text-sm font-bold text-white shadow-lg shadow-emerald-600/25 transition hover:shadow-xl active:scale-95"
              >
                Отметить первую
              </button>
            )}
          </div>
        ) : (
          <ul className="space-y-2.5">
            {benches.map((b) => (
              <li key={b.id}>
                <button
                  onClick={() => onSelect(b.id)}
                  className="group relative flex w-full items-stretch gap-0 overflow-hidden rounded-2xl border border-slate-200/80 bg-white text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-lg hover:shadow-emerald-600/10"
                >
                  <div className="relative h-24 w-24 shrink-0 self-stretch">
                    {b.benchPhoto ? (
                      <img
                        src={b.benchPhoto}
                        alt=""
                        loading="lazy"
                        className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-emerald-50 to-amber-50 text-3xl">
                        🪑
                      </div>
                    )}
                    {b.avgRating !== null && (
                      <span className="absolute bottom-1.5 left-1.5 rounded-full bg-slate-950/70 px-1.5 py-0.5 text-[10px] font-bold text-amber-300 backdrop-blur-sm">
                        ★ {b.avgRating.toFixed(1)}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate font-bold text-slate-800 transition group-hover:text-emerald-700">
                        {b.title}
                      </div>
                      <span className="shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-emerald-400">
                        ›
                      </span>
                    </div>
                    {b.description && (
                      <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-slate-500">
                        {b.description}
                      </p>
                    )}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                      {b.avgRating !== null ? (
                        <Stars value={b.avgRating} size="sm" />
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-400">
                          без оценок
                        </span>
                      )}
                      <span className="text-slate-400">
                        · {pluralReviews(b.reviewCount)}
                      </span>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

/* ---------------- Add form ---------------- */

function AddBenchForm({
  draft,
  author,
  onAuthorChange,
  onCancel,
  onCreated,
  onError,
}: {
  draft: Draft;
  author: string;
  onAuthorChange: (v: string) => void;
  onCancel: () => void;
  onCreated: (b: BenchSummary) => void;
  onError: (msg: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [benchPhoto, setBenchPhoto] = useState<File | null>(null);
  const [viewPhoto, setViewPhoto] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (!benchPhoto) {
      onError("Фото скамейки обязательно");
      return;
    }
    if (!viewPhoto) {
      onError("Фото вида со скамейки обязательно");
      return;
    }
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append("title", title);
      formData.append("description", description);
      formData.append("lat", String(draft.lat));
      formData.append("lng", String(draft.lng));
      formData.append("createdBy", author);
      if (rating > 0) formData.append("rating", String(rating));
      if (reviewText.trim()) formData.append("reviewText", reviewText);
      formData.append("benchPhoto", benchPhoto);
      formData.append("viewPhoto", viewPhoto);

      const res = await fetch("/api/benches", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка");
      onCreated(data);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2.5 border-b border-slate-200/80 p-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1 rounded-full bg-slate-100 px-3.5 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-200 active:scale-95"
        >
          ← Назад
        </button>
        <h2 className="text-base font-extrabold text-slate-800">
          Новая скамейка
        </h2>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <div className="rounded-xl border border-amber-100 bg-gradient-to-r from-amber-50 to-orange-50 px-3 py-2.5 text-xs font-medium text-amber-800">
          📍 {draft.lat.toFixed(5)}, {draft.lng.toFixed(5)} — можно кликнуть по
          карте ещё раз, чтобы переместить точку
        </div>
        <Field label="Название *">
          <input
            required
            maxLength={120}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Например: Скамейка у пруда"
            className={inputClass}
          />
        </Field>
        <Field label="Описание">
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Вид, тень, спинка, рядом ли урна…"
            className={`${inputClass} resize-none`}
          />
        </Field>
        <Field label="Ваше имя">
          <input
            maxLength={80}
            value={author}
            onChange={(e) => onAuthorChange(e.target.value)}
            placeholder="Аноним"
            className={inputClass}
          />
        </Field>

        <Field label="Фото скамейки *">
          <PhotoCapture
            label="Фото скамейки"
            onPhoto={setBenchPhoto}
            required={true}
          />
        </Field>
        <Field label="Вид со скамейки *">
          <PhotoCapture
            label="Вид со скамейки"
            onPhoto={setViewPhoto}
            required={true}
          />
        </Field>

        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-3.5">
          <div className="mb-2 text-sm font-bold text-emerald-900">
            Первая рецензия (необязательно)
          </div>
          <div className="mb-2 flex items-center gap-2">
            <Stars value={rating} onChange={setRating} size="lg" />
            {rating > 0 && (
              <button
                type="button"
                onClick={() => setRating(0)}
                className="text-xs text-slate-400 transition hover:text-slate-600"
              >
                сбросить
              </button>
            )}
          </div>
          <textarea
            rows={3}
            value={reviewText}
            onChange={(e) => setReviewText(e.target.value)}
            placeholder="Как вам сиделось?"
            className={`${inputClass} resize-none`}
          />
          {(rating > 0) !== Boolean(reviewText.trim()) && (
            <p className="mt-1 text-xs text-amber-600">
              Для рецензии нужны и оценка, и текст
            </p>
          )}
        </div>
      </div>
      <div className="border-t border-slate-200/80 p-3">
        <button
          type="submit"
          disabled={saving || !title.trim() || !benchPhoto || !viewPhoto}
          className="w-full rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-600/25 transition hover:shadow-xl active:scale-[0.98] disabled:opacity-40 disabled:shadow-none"
        >
          {saving ? "Сохраняем…" : "Сохранить скамейку"}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

/* ---------------- Details ---------------- */

function BenchDetailsPanel({
  details,
  loading,
  author,
  onAuthorChange,
  onBack,
  onDelete,
  onReviewAdded,
  onError,
  isAdmin,
  adminKey,
}: {
  details: BenchDetails | null;
  loading: boolean;
  author: string;
  onAuthorChange: (v: string) => void;
  onBack: () => void;
  onDelete: () => void;
  onReviewAdded: () => Promise<void>;
  onError: (msg: string) => void;
  isAdmin: boolean;
  adminKey: string;
}) {
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Все фото скамейки для лайтбокса с навигацией
  const photos = useMemo(() => {
    const arr: { src: string; caption: string }[] = [];
    if (details?.benchPhoto) arr.push({ src: details.benchPhoto, caption: "Фото скамейки" });
    if (details?.viewPhoto) arr.push({ src: details.viewPhoto, caption: "Вид со скамейки" });
    return arr;
  }, [details]);

  // Редактирование скамейки (только админ)
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [confirmDelReview, setConfirmDelReview] = useState<number | null>(null);

  useEffect(() => {
    setEditing(false);
    setConfirmDelReview(null);
  }, [details?.id]);

  const startEdit = () => {
    setEditTitle(details?.title ?? "");
    setEditDesc(details?.description ?? "");
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!details || !editTitle.trim()) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/benches/${details.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": adminKey,
        },
        body: JSON.stringify({ title: editTitle, description: editDesc }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка");
      setEditing(false);
      await onReviewAdded();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setEditSaving(false);
    }
  };

  const deleteReview = async (reviewId: number) => {
    try {
      const res = await fetch(`/api/reviews/${reviewId}`, {
        method: "DELETE",
        headers: { "x-admin-key": adminKey },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Ошибка");
      }
      setConfirmDelReview(null);
      await onReviewAdded();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось удалить рецензию");
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!details || rating === 0 || !text.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/benches/${details.id}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ author, rating, text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка");
      setRating(0);
      setText("");
      await onReviewAdded();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось сохранить рецензию");
    } finally {
      setSaving(false);
    }
  };

  const distribution = useMemo(() => {
    const d = [0, 0, 0, 0, 0];
    details?.reviews.forEach((r) => d[r.rating - 1]++);
    return d;
  }, [details]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200/80 p-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1 rounded-full bg-slate-100 px-3.5 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-200 active:scale-95"
        >
          ← Все скамейки
        </button>
        {isAdmin && (
          <div className="flex items-center gap-1">
            <button
              onClick={startEdit}
              className="rounded-full px-3.5 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 active:scale-95"
            >
              ✏️ Изменить
            </button>
            <button
              onClick={onDelete}
              className="rounded-full px-3.5 py-1.5 text-xs font-semibold text-rose-500 transition hover:bg-rose-50 hover:text-rose-600 active:scale-95"
            >
              🗑 Удалить
            </button>
          </div>
        )}
      </div>

      {loading && !details ? (
        <div className="p-6 text-center text-sm font-medium text-slate-400">
          Загрузка…
        </div>
      ) : !details ? (
        <div className="p-6 text-center text-sm font-medium text-slate-400">
          Скамейка не найдена
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="border-b border-slate-100 p-4 pb-5">
            {editing ? (
              <div className="mt-1 space-y-2">
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  maxLength={120}
                  placeholder="Название скамейки"
                  className={inputClass}
                />
                <textarea
                  rows={3}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  maxLength={2000}
                  placeholder="Описание (можно оставить пустым)"
                  className={`${inputClass} resize-none`}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditing(false)}
                    className="rounded-full border border-slate-200 px-4 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={saveEdit}
                    disabled={editSaving || !editTitle.trim()}
                    className="rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-1.5 text-xs font-bold text-white shadow-lg shadow-emerald-600/25 transition hover:shadow-xl active:scale-[0.98] disabled:opacity-40"
                  >
                    {editSaving ? "Сохраняем…" : "Сохранить"}
                  </button>
                </div>
              </div>
            ) : photos.length === 0 ? (
              <>
                <h2 className="text-2xl font-extrabold leading-tight text-slate-900">
                  {details.title}
                </h2>
                {details.description && (
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
                    {details.description}
                  </p>
                )}
              </>
            ) : null}

            {/* Hero-фото: вид со скамейки с названием поверх */}
            {!editing && photos.length > 0 && (
              <button
                type="button"
                onClick={() => setLightboxIndex(photos.length > 1 ? 1 : 0)}
                className="group relative mt-1 block w-full overflow-hidden rounded-2xl shadow-md ring-1 ring-slate-900/5 transition duration-300 hover:shadow-2xl"
                title="Открыть фото"
              >
                <img
                  src={(photos.length > 1 ? photos[1] : photos[0]).src}
                  alt={details.title}
                  className="h-56 w-full object-cover transition duration-700 group-hover:scale-105"
                />
                <span className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/25 to-transparent" />
                <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4">
                  <span className="min-w-0">
                    <span className="block truncate text-left text-xl font-extrabold leading-tight text-white drop-shadow-md">
                      {details.title}
                    </span>
                    <span className="mt-0.5 block text-left text-[11px] font-medium text-white/75">
                      {(photos.length > 1 ? photos[1] : photos[0]).caption} · нажмите, чтобы увеличить
                    </span>
                  </span>
                  {details.avgRating !== null && (
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-slate-950/60 px-2.5 py-1 text-sm font-extrabold text-amber-300 backdrop-blur-sm">
                      ★ {details.avgRating.toFixed(1)}
                    </span>
                  )}
                </span>
                <span className="absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-white/25 text-sm text-white opacity-0 backdrop-blur-sm transition duration-300 group-hover:opacity-100">
                  🔍
                </span>
              </button>
            )}

            {/* Второе фото миниатюрой */}
            {!editing && photos.length > 1 && (
              <button
                type="button"
                onClick={() => setLightboxIndex(0)}
                className="group relative mt-3 block overflow-hidden rounded-xl shadow-sm transition duration-300 hover:shadow-lg"
                title={`Открыть: ${photos[0].caption}`}
              >
                <img
                  src={photos[0].src}
                  alt={photos[0].caption}
                  className="h-24 w-40 object-cover transition duration-500 group-hover:scale-105"
                />
                <span className="absolute inset-0 flex items-end bg-gradient-to-t from-slate-950/70 via-transparent p-2">
                  <span className="text-[11px] font-semibold text-white drop-shadow">
                    {photos[0].caption}
                  </span>
                </span>
              </button>
            )}

            {/* Описание под hero-фото */}
            {!editing && photos.length > 0 && details.description && (
              <p className="mt-2.5 text-sm leading-relaxed text-slate-500">
                {details.description}
              </p>
            )}

            <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium">
                👤 {details.createdBy}
              </span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1">
                {formatDate(details.createdAt)}
              </span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 font-mono">
                📍 {details.lat.toFixed(4)}, {details.lng.toFixed(4)}
              </span>
            </div>

            <div className="mt-4 flex items-center gap-4 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-600 p-4 text-white shadow-lg shadow-emerald-700/25">
              <div className="shrink-0 text-center">
                <div className="text-3xl font-extrabold leading-none">
                  {details.avgRating !== null ? details.avgRating.toFixed(1) : "—"}
                </div>
                <div className="mt-1">
                  <Stars value={details.avgRating ?? 0} size="sm" />
                </div>
                <div className="mt-0.5 text-[11px] font-medium text-emerald-100">
                  {pluralReviews(details.reviewCount)}
                </div>
              </div>
              <div className="flex-1 space-y-1.5">
                {[5, 4, 3, 2, 1].map((n) => {
                  const c = distribution[n - 1];
                  const pct = details.reviewCount ? (c / details.reviewCount) * 100 : 0;
                  return (
                    <div
                      key={n}
                      className="flex items-center gap-2 text-[11px] font-medium text-emerald-50"
                    >
                      <span className="w-2.5">{n}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/25">
                        <div
                          className="h-full rounded-full bg-amber-300 transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-4 text-right tabular-nums">{c}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <form
            onSubmit={submit}
            className="border-b border-slate-100 bg-gradient-to-b from-emerald-50/80 to-white p-4"
          >
            <div className="mb-2 text-sm font-bold text-emerald-900">
              Оставить рецензию
            </div>
            <div className="mb-2">
              <Stars value={rating} onChange={setRating} size="lg" />
            </div>
            <textarea
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={2000}
              placeholder="Расскажите: удобно ли, чисто ли, какой вид…"
              className="mb-2 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15"
            />
            <div className="flex gap-2">
              <input
                maxLength={80}
                value={author}
                onChange={(e) => onAuthorChange(e.target.value)}
                placeholder="Ваше имя"
                className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15"
              />
              <button
                type="submit"
                disabled={saving || rating === 0 || !text.trim()}
                className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2 text-sm font-bold text-white shadow-lg shadow-emerald-600/25 transition hover:shadow-xl active:scale-[0.97] disabled:opacity-40 disabled:shadow-none"
              >
                {saving ? "…" : "Отправить"}
              </button>
            </div>
          </form>

          <div className="p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800">
              Рецензии
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
                {details.reviewCount}
              </span>
            </div>
            {details.reviews.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
                Пока никто не написал. Будьте первым! ✍️
              </div>
            ) : (
              <ul className="space-y-2.5">
                {details.reviews.map((r) => {
                  const grad =
                    AVATAR_GRADIENTS[
                      r.author.charCodeAt(0) % AVATAR_GRADIENTS.length
                    ];
                  return (
                    <li
                      key={r.id}
                      className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-sm"
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${grad} text-sm font-extrabold text-white shadow-sm`}
                        >
                          {r.author.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-bold text-slate-800">
                              {r.author}
                            </span>
                            <span className="flex shrink-0 items-center gap-1.5">
                              <span className="text-xs text-slate-400">
                                {formatDate(r.createdAt)}
                              </span>
                              {isAdmin &&
                                (confirmDelReview === r.id ? (
                                  <button
                                    onClick={() => deleteReview(r.id)}
                                    className="rounded-full bg-rose-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm transition hover:bg-rose-700"
                                    title="Нажмите ещё раз для подтверждения"
                                  >
                                    Точно удалить?
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => setConfirmDelReview(r.id)}
                                    title="Удалить рецензию (админ)"
                                    className="rounded-full p-1 text-slate-300 transition hover:bg-rose-50 hover:text-rose-500"
                                  >
                                    ✕
                                  </button>
                                ))}
                            </span>
                          </div>
                          <Stars value={r.rating} size="sm" />
                        </div>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                        {r.text}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {lightboxIndex !== null && photos[lightboxIndex] && (
        <Lightbox
          photos={photos}
          index={lightboxIndex}
          onIndex={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
}
