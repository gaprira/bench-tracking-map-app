"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  LocateFixed,
  MapPin,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  Send,
  Shield,
  ShieldCheck,
  Star,
  Trash2,
  TrendingUp,
  User,
  X,
} from "lucide-react";
import type { BenchDetails, BenchSummary } from "@/lib/types";
import Stars from "./Stars";
import PhotoCapture from "./PhotoCapture";

const BenchMap = dynamic(() => import("./BenchMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[#e9e5da]">
      <span className="flex items-center gap-2 rounded-full bg-paper px-4 py-2 text-sm font-semibold text-ink-soft shadow">
        <span className="h-2 w-2 animate-ping rounded-full bg-tangerine" />
        Загружаем карту…
      </span>
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

function pluralBenches(n: number) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} скамейка`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${n} скамейки`;
  return `${n} скамеек`;
}

const AVATAR_COLORS = [
  "bg-forest text-moss",
  "bg-tangerine text-paper",
  "bg-moss text-forest",
  "bg-sun text-ink",
  "bg-ink text-sun",
];

// Те же цвета, что у меток на карте (BenchMap грузится только в браузере,
// поэтому цвета продублированы, а не импортированы)
const LEGEND = [
  { color: "#2f9e5b", label: "4.5+" },
  { color: "#8db33a", label: "3.5+" },
  { color: "#f2a93b", label: "2.5+" },
  { color: "#e5484d", label: "ниже" },
  { color: "#a3aca5", label: "нет оценок" },
];

const inputClass =
  "w-full rounded-2xl border border-sand bg-paper px-4 py-3 text-sm text-ink outline-none transition placeholder:text-ink-soft/60 focus:border-forest-light focus:ring-4 focus:ring-moss/30";

const primaryBtn =
  "inline-flex items-center justify-center gap-2 rounded-full bg-tangerine px-5 py-3 text-sm font-bold text-white shadow-lg shadow-tangerine/30 transition hover:bg-tangerine-dark active:scale-[0.97] disabled:bg-sand-dark disabled:text-ink-soft disabled:shadow-none";

const ghostBtn =
  "inline-flex items-center justify-center gap-2 rounded-full border border-sand bg-paper px-5 py-3 text-sm font-bold text-ink transition hover:bg-cream active:scale-[0.97] disabled:opacity-50";

const iconBtn =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition active:scale-90";

/** Логотип: скамейка, как на иконке приложения */
function BenchGlyph({ size = 22, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <rect x="4.6" y="6.2" width="14.8" height="1.9" rx=".95" />
      <rect x="4.6" y="9.2" width="14.8" height="1.9" rx=".95" />
      <rect x="6.2" y="6.2" width="1.5" height="8" rx=".5" />
      <rect x="16.3" y="6.2" width="1.5" height="8" rx=".5" />
      <rect x="3.6" y="12.6" width="16.8" height="2.2" rx="1" />
      <rect x="5.4" y="14" width="1.7" height="5" rx=".6" />
      <rect x="16.9" y="14" width="1.7" height="5" rx=".6" />
    </svg>
  );
}

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
  // На телефоне: "map" — шторка свёрнута, "list" — развёрнута
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
    setMobileTab("map");
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setFocus({ lat: pos.coords.latitude, lng: pos.coords.longitude, zoom: 16 }),
      () => setError("Не удалось определить местоположение"),
    );
  };

  const toggleAddMode = () => {
    setAddMode((v) => !v);
    setDraft(null);
    setSelectedId(null);
    setMobileTab("map");
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

  const sheetOpen = mobileTab === "list";

  return (
    <div className="relative h-dvh overflow-hidden bg-cream">
      {/* Карта на весь экран */}
      <div className="absolute inset-0 isolate">
        <BenchMap
          benches={benches}
          selectedId={selectedId}
          draft={draft}
          focus={focus}
          onSelect={handleSelect}
          onMapClick={handleMapClick}
        />
      </div>

      {/* Верхняя панель */}
      <header className="pointer-events-none absolute inset-x-3 top-3 z-30 flex items-start justify-between gap-2 md:inset-x-4 md:top-4">
        <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-paper/90 py-1.5 pl-1.5 pr-4 shadow-[0_10px_30px_-12px_rgb(23_34_27/0.45)] ring-1 ring-ink/5 backdrop-blur-xl">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-forest text-moss">
            <BenchGlyph size={24} />
          </div>
          <div className="leading-none">
            <h1 className="font-display text-[17px] font-bold tracking-tight text-ink">
              скамейки
            </h1>
            <p className="mt-1 hidden text-[11px] font-semibold text-ink-soft sm:block">
              карта мест, где хорошо сидится
            </p>
          </div>
        </div>

        <div className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-paper/90 p-1.5 shadow-[0_10px_30px_-12px_rgb(23_34_27/0.45)] ring-1 ring-ink/5 backdrop-blur-xl">
          <button
            onClick={locateMe}
            title="Моё местоположение"
            aria-label="Моё местоположение"
            className={`${iconBtn} text-ink hover:bg-sand`}
          >
            <LocateFixed size={19} />
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
            aria-label="Режим администратора"
            className={`${iconBtn} ${
              adminKey ? "bg-forest text-moss" : "text-ink hover:bg-sand"
            }`}
          >
            {adminKey ? <ShieldCheck size={19} /> : <Shield size={19} />}
          </button>
          <button
            onClick={toggleAddMode}
            aria-label={addMode ? "Отмена" : "Добавить скамейку"}
            className={`flex h-10 w-10 items-center justify-center gap-1.5 rounded-full text-sm font-bold transition active:scale-95 sm:w-auto sm:px-4 ${
              addMode
                ? "bg-ink text-white"
                : "bg-tangerine text-white shadow-lg shadow-tangerine/35 hover:bg-tangerine-dark"
            }`}
          >
            {addMode ? <X size={18} strokeWidth={2.5} /> : <Plus size={19} strokeWidth={2.75} />}
            <span className="hidden sm:inline">{addMode ? "Отмена" : "Добавить"}</span>
          </button>
        </div>
      </header>

      {/* Подсказка в режиме добавления */}
      {addMode && !draft && (
        <div className="pointer-events-none absolute left-1/2 top-[72px] z-30 -translate-x-1/2 animate-rise md:top-[84px]">
          <div className="flex items-center gap-2 whitespace-nowrap rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-white shadow-xl">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inset-0 animate-ping rounded-full bg-tangerine" />
              <span className="relative h-2.5 w-2.5 rounded-full bg-tangerine" />
            </span>
            Коснитесь карты, чтобы поставить точку
          </div>
        </div>
      )}

      {/* Легенда (десктоп) */}
      <div className="absolute bottom-4 left-[452px] z-20 hidden items-center gap-3 rounded-full bg-paper/90 px-4 py-2 text-[11px] font-semibold text-ink-soft shadow-lg ring-1 ring-ink/5 backdrop-blur-xl lg:flex">
        <span className="font-bold text-ink">Оценка</span>
        {LEGEND.map((l) => (
          <span key={l.label} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: l.color }} />
            {l.label}
          </span>
        ))}
      </div>

      {/* Панель: шторка снизу на телефоне, карточка слева на десктопе */}
      <aside
        className={`absolute inset-x-0 bottom-0 z-40 flex h-[86dvh] flex-col overflow-hidden rounded-t-[30px] bg-cream shadow-[0_-12px_40px_-12px_rgb(23_34_27/0.4)] transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] md:inset-x-auto md:bottom-4 md:left-4 md:top-[84px] md:h-auto md:w-[420px] md:translate-y-0 md:rounded-[30px] md:shadow-[0_20px_60px_-20px_rgb(23_34_27/0.5)] ${
          sheetOpen ? "translate-y-0" : "translate-y-[calc(100%-140px)]"
        }`}
      >
        <button
          onClick={() => setMobileTab(sheetOpen ? "map" : "list")}
          aria-label={sheetOpen ? "Свернуть" : "Развернуть"}
          className="flex w-full shrink-0 justify-center pb-1 pt-2.5 md:hidden"
        >
          <span className="h-1.5 w-11 rounded-full bg-sand-dark" />
        </button>

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
            stats={stats}
            search={search}
            onSearch={setSearch}
            sort={sort}
            onSort={setSort}
            onSelect={handleSelect}
            onExpand={() => setMobileTab("list")}
            onStartAdd={() => {
              setAddMode(true);
              setMobileTab("map");
            }}
          />
        )}
      </aside>

      {error && (
        <div className="absolute left-1/2 top-[72px] z-[3000] -translate-x-1/2 animate-rise md:top-[84px]">
          <div className="flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-white shadow-2xl">
            <AlertCircle size={17} className="text-tangerine" />
            {error}
          </div>
        </div>
      )}

      {/* Модальное подтверждение удаления */}
      {deleteTarget !== null && (
        <Modal onClose={() => !deleting && setDeleteTarget(null)}>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-tangerine/15 text-tangerine-dark">
            <Trash2 size={24} />
          </div>
          <h2 className="text-center font-display text-lg font-bold text-ink">
            Удалить скамейку?
          </h2>
          <p className="mt-2 text-center text-sm leading-relaxed text-ink-soft">
            Скамейка и все её рецензии будут удалены. Действие необратимо.
          </p>
          <div className="mt-6 flex gap-2.5">
            <button
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
              className={`${ghostBtn} flex-1`}
            >
              Отмена
            </button>
            <button
              onClick={handleDeleteConfirmed}
              disabled={deleting}
              className={`${primaryBtn} flex-1 !bg-[#e5484d] !shadow-[#e5484d]/30`}
            >
              {deleting ? "Удаляем…" : "Удалить"}
            </button>
          </div>
        </Modal>
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
  );
}

function Modal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-[4000] flex animate-fade-in items-end justify-center bg-ink/50 p-3 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm animate-zoom-in rounded-[30px] bg-paper p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
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
    <Modal onClose={onClose}>
      <form onSubmit={submit}>
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-forest text-moss">
          <Shield size={24} />
        </div>
        <h2 className="text-center font-display text-lg font-bold text-ink">
          Вход для модератора
        </h2>
        <p className="mt-1.5 text-center text-xs text-ink-soft">
          Введите ключ — он сохранится в этом браузере
        </p>
        <input
          type="password"
          autoFocus
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="Ключ администратора"
          className={`${inputClass} mt-5`}
        />
        <div className="mt-4 flex gap-2.5">
          <button type="button" onClick={onClose} className={`${ghostBtn} flex-1`}>
            Отмена
          </button>
          <button
            type="submit"
            disabled={checking || !key.trim()}
            className={`${primaryBtn} flex-1`}
          >
            {checking ? "Проверяем…" : "Войти"}
          </button>
        </div>
      </form>
    </Modal>
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

  const navBtn =
    "absolute top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-md transition hover:bg-white/30 active:scale-90";

  return (
    <div
      className="fixed inset-0 z-[5000] flex animate-fade-in items-center justify-center bg-ink/90 p-4 backdrop-blur-md"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div className="relative max-w-4xl animate-zoom-in" onClick={(e) => e.stopPropagation()}>
        <img
          src={photo.src}
          alt={photo.caption}
          className="max-h-[80vh] w-auto max-w-full rounded-[24px] bg-ink object-contain shadow-2xl"
        />
        {index > 0 && (
          <button onClick={() => onIndex(index - 1)} aria-label="Предыдущее фото" className={`${navBtn} left-3`}>
            <ChevronLeft size={24} />
          </button>
        )}
        {index < photos.length - 1 && (
          <button onClick={() => onIndex(index + 1)} aria-label="Следующее фото" className={`${navBtn} right-3`}>
            <ChevronRight size={24} />
          </button>
        )}
        <div className="mt-4 flex justify-center">
          <span className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white/90 backdrop-blur">
            {photo.caption}
            {photos.length > 1 && (
              <span className="text-white/50"> · {index + 1} / {photos.length}</span>
            )}
          </span>
        </div>
        <button
          onClick={onClose}
          aria-label="Закрыть"
          className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-ink/50 text-white backdrop-blur-md transition hover:rotate-90 hover:bg-ink/70"
        >
          <X size={20} />
        </button>
      </div>
    </div>
  );
}

/* ---------------- List ---------------- */

const SORTS: { key: Sort; label: string; icon: typeof Clock }[] = [
  { key: "new", label: "Новые", icon: Clock },
  { key: "rating", label: "Лучшие", icon: TrendingUp },
  { key: "reviews", label: "Обсуждаемые", icon: MessageSquare },
];

function BenchList({
  benches,
  loading,
  stats,
  search,
  onSearch,
  sort,
  onSort,
  onSelect,
  onExpand,
  onStartAdd,
}: {
  benches: BenchSummary[];
  loading: boolean;
  stats: { total: number; reviewsTotal: number; avg: number | null };
  search: string;
  onSearch: (v: string) => void;
  sort: Sort;
  onSort: (v: Sort) => void;
  onSelect: (id: number) => void;
  onExpand: () => void;
  onStartAdd: () => void;
}) {
  return (
    <>
      <div className="shrink-0 px-5 pb-3 pt-2 md:pt-6">
        <button onClick={onExpand} className="block w-full text-left md:pointer-events-none">
          <h2 className="font-display text-[26px] font-bold leading-[1.05] tracking-tight text-ink">
            Где <span className="text-tangerine">присесть</span>
            <br />
            сегодня
          </h2>
        </button>
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs font-bold">
          <span className="rounded-full bg-forest px-3 py-1.5 text-moss">
            {pluralBenches(stats.total)}
          </span>
          <span className="rounded-full bg-sand px-3 py-1.5 text-ink">
            {pluralReviews(stats.reviewsTotal)}
          </span>
          {stats.avg !== null && (
            <span className="inline-flex items-center gap-1 rounded-full bg-sun px-3 py-1.5 text-ink">
              <Star size={12} fill="currentColor" strokeWidth={0} />
              {stats.avg.toFixed(1)} в среднем
            </span>
          )}
        </div>

        <div className="relative mt-4">
          <Search
            size={17}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-soft"
          />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            onFocus={onExpand}
            placeholder="Найти скамейку…"
            className="w-full rounded-full border border-sand bg-paper py-3 pl-11 pr-4 text-sm text-ink outline-none transition placeholder:text-ink-soft/70 focus:border-forest-light focus:ring-4 focus:ring-moss/30"
          />
        </div>
        <div className="mt-3 flex gap-1 rounded-full bg-sand/70 p-1">
          {SORTS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => onSort(key)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-2 text-xs font-bold transition ${
                sort === key ? "bg-paper text-ink shadow-sm" : "text-ink-soft hover:text-ink"
              }`}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-1">
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-48 animate-pulse rounded-[26px] bg-sand/80" />
            ))}
          </div>
        ) : benches.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-forest text-moss">
              <BenchGlyph size={40} />
            </div>
            <p className="font-display text-base font-bold text-ink">
              {search ? "Ничего не нашли" : "Пока пусто"}
            </p>
            <p className="mt-1 text-sm text-ink-soft">
              {search
                ? "Попробуйте другой запрос"
                : "Отметьте первую скамейку — это займёт минуту"}
            </p>
            {!search && (
              <button onClick={onStartAdd} className={`${primaryBtn} mt-5`}>
                <Plus size={17} strokeWidth={2.75} />
                Отметить первую
              </button>
            )}
          </div>
        ) : (
          <ul className="space-y-3">
            {benches.map((b, i) => (
              <li key={b.id} className="animate-rise" style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}>
                <BenchCard bench={b} onSelect={onSelect} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function BenchCard({ bench: b, onSelect }: { bench: BenchSummary; onSelect: (id: number) => void }) {
  return (
    <button
      onClick={() => onSelect(b.id)}
      className="group relative block h-48 w-full overflow-hidden rounded-[26px] bg-forest text-left shadow-[0_12px_30px_-16px_rgb(23_34_27/0.6)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_20px_40px_-18px_rgb(23_34_27/0.7)] active:scale-[0.99]"
    >
      {b.benchPhoto ? (
        <img
          src={b.benchPhoto}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-forest-light to-forest text-moss/40">
          <BenchGlyph size={96} />
        </div>
      )}
      <span className="grain absolute inset-0" />
      <span className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/15 to-transparent" />

      <span className="absolute left-3 top-3 flex gap-1.5">
        {b.avgRating !== null ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-paper/95 px-2.5 py-1 text-xs font-extrabold text-ink shadow">
            <Star size={12} className="text-sun" fill="currentColor" strokeWidth={0} />
            {b.avgRating.toFixed(1)}
          </span>
        ) : (
          <span className="rounded-full bg-paper/95 px-2.5 py-1 text-xs font-bold text-ink-soft shadow">
            новая
          </span>
        )}
        <span className="inline-flex items-center gap-1 rounded-full bg-ink/50 px-2.5 py-1 text-xs font-bold text-white backdrop-blur-md">
          <MessageSquare size={12} />
          {b.reviewCount}
        </span>
      </span>

      <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4">
        <span className="min-w-0">
          <span className="block truncate font-display text-lg font-bold leading-tight text-white">
            {b.title}
          </span>
          {b.description && (
            <span className="mt-1 block truncate text-xs font-medium text-white/75">
              {b.description}
            </span>
          )}
        </span>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-tangerine text-white transition duration-300 group-hover:-rotate-45">
          <ArrowLeft size={18} className="rotate-180" strokeWidth={2.5} />
        </span>
      </span>
    </button>
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
      <div className="flex shrink-0 items-center gap-3 px-5 pb-3 pt-2 md:pt-5">
        <button
          type="button"
          onClick={onCancel}
          aria-label="Назад"
          className={`${iconBtn} bg-paper text-ink ring-1 ring-sand hover:bg-sand`}
        >
          <ArrowLeft size={19} />
        </button>
        <h2 className="font-display text-xl font-bold tracking-tight text-ink">
          Новая скамейка
        </h2>
      </div>
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 pb-6 pt-2">
        <div className="flex items-center gap-2.5 rounded-2xl bg-forest px-4 py-3 text-xs font-semibold text-white/85">
          <MapPin size={18} className="shrink-0 text-tangerine" />
          <span>
            <span className="font-mono text-moss">
              {draft.lat.toFixed(5)}, {draft.lng.toFixed(5)}
            </span>
            <br />
            Коснитесь карты ещё раз, чтобы передвинуть точку
          </span>
        </div>

        <Section n={1} title="Что за место">
          <Field label="Название *">
            <input
              required
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Например: скамейка у пруда"
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
        </Section>

        <Section n={2} title="Фотографии">
          <Field label="Сама скамейка *">
            <PhotoCapture label="Фото скамейки" onPhoto={setBenchPhoto} required={true} />
          </Field>
          <Field label="Вид со скамейки *">
            <PhotoCapture label="Вид со скамейки" onPhoto={setViewPhoto} required={true} />
          </Field>
        </Section>

        <Section n={3} title="Первое впечатление" hint="необязательно">
          <div className="flex items-center gap-3">
            <Stars value={rating} onChange={setRating} size="lg" />
            {rating > 0 && (
              <button
                type="button"
                onClick={() => setRating(0)}
                className="text-xs font-semibold text-ink-soft underline-offset-2 hover:underline"
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
            <p className="text-xs font-semibold text-tangerine-dark">
              Для рецензии нужны и оценка, и текст
            </p>
          )}
        </Section>
      </div>
      <div className="shrink-0 border-t border-sand bg-cream/95 px-5 py-4 backdrop-blur">
        <button
          type="submit"
          disabled={saving || !title.trim() || !benchPhoto || !viewPhoto}
          className={`${primaryBtn} w-full py-3.5`}
        >
          {saving ? "Сохраняем…" : "Сохранить скамейку"}
        </button>
      </div>
    </form>
  );
}

function Section({
  n,
  title,
  hint,
  children,
}: {
  n: number;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink font-display text-xs font-bold text-white">
          {n}
        </span>
        <h3 className="font-display text-sm font-bold text-ink">{title}</h3>
        {hint && <span className="text-xs font-medium text-ink-soft">· {hint}</span>}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block pl-1 text-xs font-bold text-ink-soft">{label}</span>
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

  // Главное фото — вид со скамейки (если есть), второе — сама скамейка
  const heroIndex = photos.length > 1 ? 1 : 0;
  const hero = photos[heroIndex];

  const floatingBtn = `${iconBtn} bg-paper/90 text-ink shadow-md backdrop-blur-md hover:bg-paper`;

  const toolbar = (
    <div className="flex items-center justify-between gap-2">
      <button onClick={onBack} aria-label="Все скамейки" title="Все скамейки" className={floatingBtn}>
        <ArrowLeft size={19} />
      </button>
      {isAdmin && (
        <div className="flex items-center gap-1.5">
          <button onClick={startEdit} aria-label="Изменить" title="Изменить" className={floatingBtn}>
            <Pencil size={17} />
          </button>
          <button
            onClick={onDelete}
            aria-label="Удалить"
            title="Удалить"
            className={`${floatingBtn} !text-[#e5484d]`}
          >
            <Trash2 size={17} />
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {loading && !details ? (
        <>
          <div className="px-4 pt-2 md:pt-4">{toolbar}</div>
          <div className="space-y-3 p-5">
            <div className="h-56 animate-pulse rounded-[26px] bg-sand/80" />
            <div className="h-7 w-2/3 animate-pulse rounded-full bg-sand/80" />
            <div className="h-4 w-1/2 animate-pulse rounded-full bg-sand/80" />
          </div>
        </>
      ) : !details ? (
        <>
          <div className="px-4 pt-2 md:pt-4">{toolbar}</div>
          <div className="p-8 text-center text-sm font-semibold text-ink-soft">
            Скамейка не найдена
          </div>
        </>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* Обложка */}
          {hero && !editing ? (
            <div className="relative px-3 pt-1 md:pt-3">
              <button
                type="button"
                onClick={() => setLightboxIndex(heroIndex)}
                className="grain relative block h-64 w-full overflow-hidden rounded-[26px] bg-forest"
                title="Открыть фото"
              >
                <img src={hero.src} alt={details.title} className="h-full w-full object-cover" />
                <span className="absolute inset-0 bg-gradient-to-t from-ink/70 via-transparent to-ink/30" />
                <span className="absolute bottom-4 left-4 rounded-full bg-ink/45 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur-md">
                  {hero.caption}
                </span>
              </button>
              <div className="absolute inset-x-6 top-4 md:top-6">{toolbar}</div>
              {photos.length > 1 && (
                <button
                  type="button"
                  onClick={() => setLightboxIndex(0)}
                  title={`Открыть: ${photos[0].caption}`}
                  className="absolute -bottom-6 right-7 h-20 w-20 overflow-hidden rounded-[20px] border-4 border-cream shadow-lg transition hover:-rotate-3 hover:scale-105"
                >
                  <img src={photos[0].src} alt={photos[0].caption} className="h-full w-full object-cover" />
                </button>
              )}
            </div>
          ) : (
            <div className="px-4 pt-2 md:pt-4">{toolbar}</div>
          )}

          <div className="px-5 pb-5 pt-4">
            {editing ? (
              <div className="space-y-2.5">
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
                  <button onClick={() => setEditing(false)} className={`${ghostBtn} py-2.5`}>
                    Отмена
                  </button>
                  <button
                    onClick={saveEdit}
                    disabled={editSaving || !editTitle.trim()}
                    className={`${primaryBtn} py-2.5`}
                  >
                    {editSaving ? "Сохраняем…" : "Сохранить"}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h2 className={`font-display text-[26px] font-bold leading-[1.1] tracking-tight text-ink ${photos.length > 1 ? "pr-24" : ""}`}>
                  {details.title}
                </h2>
                {details.description && (
                  <p className="mt-2.5 text-[15px] leading-relaxed text-ink-soft">
                    {details.description}
                  </p>
                )}
              </>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-ink-soft">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-sand/70 px-3 py-1.5">
                <User size={13} /> {details.createdBy}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-sand/70 px-3 py-1.5">
                <CalendarDays size={13} /> {formatDate(details.createdAt)}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-sand/70 px-3 py-1.5 font-mono">
                <MapPin size={13} /> {details.lat.toFixed(4)}, {details.lng.toFixed(4)}
              </span>
            </div>

            {/* Сводка оценок */}
            <div className="mt-5 flex items-center gap-5 overflow-hidden rounded-[26px] bg-forest p-5 text-white">
              <div className="shrink-0">
                <div className="font-display text-5xl font-bold leading-none text-moss">
                  {details.avgRating !== null ? details.avgRating.toFixed(1) : "—"}
                </div>
                <div className="mt-2">
                  <Stars value={details.avgRating ?? 0} size="sm" tone="dark" />
                </div>
                <div className="mt-1 text-[11px] font-semibold text-white/60">
                  {pluralReviews(details.reviewCount)}
                </div>
              </div>
              <div className="flex-1 space-y-1.5">
                {[5, 4, 3, 2, 1].map((n) => {
                  const c = distribution[n - 1];
                  const pct = details.reviewCount ? (c / details.reviewCount) * 100 : 0;
                  return (
                    <div key={n} className="flex items-center gap-2 text-[11px] font-bold text-white/70">
                      <span className="w-2.5">{n}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-sun transition-all duration-700"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-4 text-right tabular-nums">{c}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Новая рецензия */}
            <form onSubmit={submit} className="mt-4 rounded-[26px] bg-paper p-5 ring-1 ring-sand">
              <h3 className="font-display text-base font-bold text-ink">Как вам сиделось?</h3>
              <div className="mt-3">
                <Stars value={rating} onChange={setRating} size="lg" />
              </div>
              <textarea
                rows={3}
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={2000}
                placeholder="Удобно ли, чисто ли, какой вид…"
                className={`${inputClass} mt-3 resize-none bg-cream`}
              />
              <div className="mt-2.5 flex gap-2">
                <input
                  maxLength={80}
                  value={author}
                  onChange={(e) => onAuthorChange(e.target.value)}
                  placeholder="Ваше имя"
                  className={`${inputClass} min-w-0 flex-1 bg-cream`}
                />
                <button
                  type="submit"
                  disabled={saving || rating === 0 || !text.trim()}
                  aria-label="Отправить"
                  className={`${primaryBtn} shrink-0 px-4`}
                >
                  {saving ? "…" : <Send size={17} />}
                </button>
              </div>
            </form>

            {/* Рецензии */}
            <div className="mt-6">
              <div className="mb-3 flex items-baseline gap-2">
                <h3 className="font-display text-lg font-bold text-ink">Рецензии</h3>
                <span className="text-sm font-bold text-ink-soft">{details.reviewCount}</span>
              </div>
              {details.reviews.length === 0 ? (
                <div className="rounded-[22px] border-2 border-dashed border-sand-dark p-6 text-center text-sm font-medium text-ink-soft">
                  Пока никто не написал — будьте первым
                </div>
              ) : (
                <ul className="space-y-2.5">
                  {details.reviews.map((r) => {
                    const color = AVATAR_COLORS[r.author.charCodeAt(0) % AVATAR_COLORS.length];
                    return (
                      <li key={r.id} className="rounded-[22px] bg-paper p-4 ring-1 ring-sand">
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-display text-sm font-bold ${color}`}
                          >
                            {r.author.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-sm font-extrabold text-ink">
                                {r.author}
                              </span>
                              <span className="flex shrink-0 items-center gap-1.5">
                                <span className="text-xs font-medium text-ink-soft">
                                  {formatDate(r.createdAt)}
                                </span>
                                {isAdmin &&
                                  (confirmDelReview === r.id ? (
                                    <button
                                      onClick={() => deleteReview(r.id)}
                                      className="rounded-full bg-[#e5484d] px-2.5 py-1 text-[11px] font-bold text-white transition hover:brightness-110"
                                      title="Нажмите ещё раз для подтверждения"
                                    >
                                      Точно удалить?
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => setConfirmDelReview(r.id)}
                                      title="Удалить рецензию (админ)"
                                      aria-label="Удалить рецензию"
                                      className="rounded-full p-1 text-ink-soft/60 transition hover:bg-[#e5484d]/10 hover:text-[#e5484d]"
                                    >
                                      <X size={14} />
                                    </button>
                                  ))}
                              </span>
                            </div>
                            <Stars value={r.rating} size="sm" />
                          </div>
                        </div>
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink">
                          {r.text}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
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
