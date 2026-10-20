"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Check,
  Clock,
  Heart,
  Loader2,
  LocateFixed,
  Navigation,
  MapPin,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  Send,
  Share2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Star,
  Trash2,
  TrendingUp,
  User,
  X,
} from "lucide-react";
import type { BenchDetails, BenchSummary } from "@/lib/types";
import { BENCH_TAGS, tagLabel } from "@/lib/tags";
import Stars from "./Stars";
import PhotoCapture from "./PhotoCapture";

const BenchMap = dynamic(() => import("./BenchMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-sand">
      <span className="flex items-center gap-2 rounded-full bg-paper px-4 py-2 text-sm font-semibold text-ink-soft shadow">
        <span className="h-2 w-2 animate-ping rounded-full bg-tangerine" />
        Загружаем карту…
      </span>
    </div>
  ),
});

type Draft = { lat: number; lng: number };
type Focus = { lat: number; lng: number; zoom?: number } | null;
type Sort = "new" | "rating" | "reviews" | "near";
type LatLng = { lat: number; lng: number };

// Расстояние по прямой (формула гаверсинуса), метры
function distanceM(a: LatLng, b: LatLng) {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function formatDistance(m: number) {
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} м`;
  if (m < 10000) return `${(m / 1000).toFixed(1).replace(".", ",")} км`;
  return `${Math.round(m / 1000)} км`;
}

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
  "bg-ink text-paper",
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

// Сколько пикселей свёрнутой шторки видно над низом экрана
const SHEET_PEEK = 140;

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

// Строка в localStorage как внешнее хранилище: на сервере — "", в браузере —
// сохранённое значение; изменения из другой вкладки тоже подхватываются.
const LOCAL_EVENT = "bench-local-storage";
function useStoredString(key: string): [string, (v: string) => void] {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const handler = (e: Event) => {
        if (!(e instanceof StorageEvent) || e.key === key) onChange();
      };
      window.addEventListener("storage", handler);
      window.addEventListener(LOCAL_EVENT, handler);
      return () => {
        window.removeEventListener("storage", handler);
        window.removeEventListener(LOCAL_EVENT, handler);
      };
    },
    [key],
  );
  const value = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return window.localStorage.getItem(key) ?? "";
      } catch {
        return "";
      }
    },
    () => "",
  );
  const setValue = useCallback(
    (v: string) => {
      try {
        if (v) window.localStorage.setItem(key, v);
        else window.localStorage.removeItem(key);
      } catch {
        // приватный режим / хранилище запрещено — просто не запоминаем
      }
      window.dispatchEvent(new Event(LOCAL_EVENT));
    },
    [key],
  );
  return [value, setValue];
}

async function fetchJson<T>(url: string, adminKey = ""): Promise<T> {
  // С ключом админа сервер отдаёт и скамейки «на проверке»
  const res = await fetch(url, {
    cache: "no-store",
    headers: adminKey ? { "x-admin-key": adminKey } : undefined,
  });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

export default function BenchApp({ initialBenchId }: { initialBenchId?: number } = {}) {
  const [benches, setBenches] = useState<BenchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  // Открыли ссылку /bench/12 — сразу показываем эту скамейку
  const [selectedId, setSelectedId] = useState<number | null>(initialBenchId ?? null);
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [details, setDetails] = useState<BenchDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(initialBenchId !== undefined);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [addMode, setAddMode] = useState(false);
  const [focus, setFocus] = useState<Focus>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("new");
  const [error, setError] = useState<string | null>(null);
  const [author, setAuthor] = useStoredString("bench-author");
  // На телефоне: "map" — шторка свёрнута, "list" — развёрнута
  const [mobileTab, setMobileTab] = useState<"map" | "list">(initialBenchId ? "list" : "map");
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [adminKey, setAdminKey] = useStoredString("bench-admin-key");
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [userPos, setUserPos] = useState<LatLng | null>(null);

  const loadBenches = useCallback(async () => {
    try {
      setBenches(await fetchJson<BenchSummary[]>("/api/benches", adminKey));
    } catch {
      setError("Не удалось загрузить скамейки");
    } finally {
      setLoading(false);
    }
  }, [adminKey]);

  const loadDetails = useCallback(async (id: number) => {
    setDetailsLoading(true);
    try {
      setDetails(await fetchJson<BenchDetails>(`/api/benches/${id}`, adminKey));
    } catch {
      setError("Не удалось загрузить скамейку");
      setDetails(null);
    } finally {
      setDetailsLoading(false);
    }
  }, [adminKey]);

  // Загрузка списка: при открытии и при входе/выходе админа (он видит ещё
  // и скамейки «на проверке»). Состояние меняется только в колбэках промиса.
  const initialHandled = useRef(false);
  useEffect(() => {
    fetchJson<BenchSummary[]>("/api/benches", adminKey)
      .then((list) => {
        setBenches(list);
        if (initialBenchId !== undefined && !initialHandled.current) {
          initialHandled.current = true;
          const b = list.find((x) => x.id === initialBenchId);
          if (b) setFocus({ lat: b.lat, lng: b.lng, zoom: 16 });
          loadDetails(initialBenchId);
        }
      })
      .catch(() => setError("Не удалось загрузить скамейки"))
      .finally(() => setLoading(false));
  }, [initialBenchId, loadDetails, adminKey]);

  // Единая точка выбора скамейки: сразу грузим карточку, без эффекта на selectedId.
  // Адрес в строке браузера — /bench/12, чтобы ссылкой можно было поделиться.
  const selectBench = (id: number | null) => {
    setSelectedId(id);
    if (id === null) setDetails(null);
    else loadDetails(id);
    const path = id === null ? "/" : `/bench/${id}`;
    if (window.location.pathname !== path) window.history.replaceState(null, "", path);
    const title = id === null ? undefined : benches.find((b) => b.id === id)?.title;
    document.title = title ? `${title} — Скамейки` : "Скамейки — карта и рецензии";
  };

  const shareBench = async (bench: { id: number; title: string }) => {
    const url = `${window.location.origin}/bench/${bench.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: bench.title, text: `Скамейка «${bench.title}»`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setNotice("Ссылка скопирована");
    } catch (err) {
      // пользователь закрыл окно «Поделиться» — это не ошибка
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError("Не удалось поделиться ссылкой");
    }
  };

  const requestPosition = (onDone?: (p: LatLng) => void) => {
    if (!navigator.geolocation) {
      setError("Геолокация недоступна в этом браузере");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserPos(p);
        onDone?.(p);
      },
      () => setError("Не удалось определить местоположение"),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  };

  const handleSort = (next: Sort) => {
    setSort(next);
    if (next === "near" && !userPos) requestPosition();
  };

  const handleSelect = (id: number) => {
    setDraft(null);
    setAddMode(false);
    selectBench(id);
    const b = benches.find((x) => x.id === id);
    if (b) setFocus({ lat: b.lat, lng: b.lng });
    setMobileTab("list");
  };

  const handleMapClick = (lat: number, lng: number) => {
    if (!addMode) return;
    setDraft({ lat, lng });
    selectBench(null);
    setMobileTab("list");
  };

  const handleCreated = (bench: BenchSummary) => {
    setDraft(null);
    setAddMode(false);
    // Фото не похоже на скамейку — она ждёт модератора и на карте пока не видна
    if (bench.status === "pending" && !adminKey) {
      selectBench(null);
      setMobileTab("map");
      setNotice("Спасибо! Скамейку проверит модератор");
      return;
    }
    setBenches((prev) => [bench, ...prev]);
    selectBench(bench.id);
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
        selectBench(null);
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
    setMobileTab("map");
    requestPosition((p) => setFocus({ ...p, zoom: 16 }));
  };

  const toggleAddMode = () => {
    setAddMode((v) => !v);
    setDraft(null);
    selectBench(null);
    setMobileTab("map");
  };

  // Расстояние до каждой скамейки (если знаем, где пользователь)
  const distances = useMemo(() => {
    const m = new Map<number, number>();
    if (userPos) for (const b of benches) m.set(b.id, distanceM(userPos, b));
    return m;
  }, [benches, userPos]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = benches.filter(
      (b) =>
        (!q ||
          b.title.toLowerCase().includes(q) ||
          (b.description ?? "").toLowerCase().includes(q)) &&
        tagFilter.every((t) => (b.tags ?? []).includes(t)),
    );
    list.sort((a, b) => {
      if (sort === "rating") return (b.avgRating ?? 0) - (a.avgRating ?? 0);
      if (sort === "reviews") return b.reviewCount - a.reviewCount;
      if (sort === "near" && distances.size)
        return (distances.get(a.id) ?? Infinity) - (distances.get(b.id) ?? Infinity);
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return list;
  }, [benches, search, sort, tagFilter, distances]);

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
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), notice.length > 24 ? 4500 : 2500);
    return () => clearTimeout(t);
  }, [notice]);

  const sheetOpen = mobileTab === "list";

  // Смахивание шторки пальцем (только телефон). Тянуть можно за элементы с
  // data-sheet-drag; захват указателя — лишь после сдвига на 6px, чтобы обычные
  // нажатия на кнопки и чипы в шапке продолжали работать.
  const sheetRef = useRef<HTMLElement>(null);
  const drag = useRef<{ startY: number; startT: number; moved: boolean; id: number } | null>(
    null,
  );
  const [dragDy, setDragDy] = useState(0);
  const [dragging, setDragging] = useState(false);

  const onSheetPointerDown = (e: React.PointerEvent) => {
    if (window.innerWidth >= 768) return;
    const target = e.target as HTMLElement;
    if (!target.closest("[data-sheet-drag]") || target.closest("input, textarea")) return;
    drag.current = { startY: e.clientY, startT: e.timeStamp, moved: false, id: e.pointerId };
  };
  const onSheetPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dy = e.clientY - d.startY;
    if (!d.moved) {
      if (Math.abs(dy) < 6) return;
      d.moved = true;
      try {
        sheetRef.current?.setPointerCapture(e.pointerId);
      } catch {
        // указатель уже отпущен — жест доведём и без захвата
      }
      setDragging(true);
    }
    const range = (sheetRef.current?.offsetHeight ?? 600) - SHEET_PEEK;
    setDragDy(sheetOpen ? Math.min(Math.max(dy, 0), range) : Math.max(Math.min(dy, 0), -range));
  };
  const onSheetPointerEnd = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.moved) return;
    const dy = e.clientY - d.startY;
    const velocity = dy / Math.max(1, e.timeStamp - d.startT); // px/мс
    if (sheetOpen && (dy > 90 || velocity > 0.5)) setMobileTab("map");
    if (!sheetOpen && (dy < -60 || velocity < -0.5)) setMobileTab("list");
    setDragging(false);
    setDragDy(0);
  };

  return (
    <div className="relative h-dvh overflow-hidden bg-cream">
      {/* Карта на весь экран */}
      <div className="absolute inset-0 isolate">
        <BenchMap
          // на карте — те же скамейки, что в списке (с учётом поиска и фильтра)
          benches={filtered}
          selectedId={selectedId}
          draft={draft}
          focus={focus}
          userPos={userPos}
          onSelect={handleSelect}
          onMapClick={handleMapClick}
        />
      </div>

      {/* Верхняя панель */}
      <header className="pointer-events-none absolute inset-x-3 top-3 z-30 flex items-start justify-between gap-2 md:inset-x-4 md:top-4">
        <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-paper/90 py-1.5 pl-1.5 pr-1.5 min-[400px]:pr-4 shadow-[0_10px_30px_-12px_rgb(23_34_27/0.45)] ring-1 ring-ink/5 backdrop-blur-xl">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-forest text-moss">
            <BenchGlyph size={24} />
          </div>
          <div className="hidden leading-none min-[400px]:block">
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
                ? "bg-ink text-paper"
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
          <div className="flex items-center gap-2 whitespace-nowrap rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-paper shadow-xl">
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
        ref={sheetRef}
        onPointerDown={onSheetPointerDown}
        onPointerMove={onSheetPointerMove}
        onPointerUp={onSheetPointerEnd}
        onPointerCancel={onSheetPointerEnd}
        style={
          {
            "--sheet-base": sheetOpen ? "0px" : `calc(100% - ${SHEET_PEEK}px)`,
            "--sheet-drag": `${dragDy}px`,
          } as React.CSSProperties
        }
        className={`absolute inset-x-0 bottom-0 z-40 flex h-[86dvh] translate-y-[calc(var(--sheet-base)+var(--sheet-drag))] flex-col overflow-hidden rounded-t-[30px] bg-cream shadow-[0_-12px_40px_-12px_rgb(23_34_27/0.4)] md:inset-x-auto md:bottom-4 md:left-4 md:top-[84px] md:h-auto md:w-[420px] md:translate-y-0 md:rounded-[30px] md:shadow-[0_20px_60px_-20px_rgb(23_34_27/0.5)] ${
          dragging ? "" : "transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
        }`}
      >
        <button
          data-sheet-drag
          onClick={() => setMobileTab(sheetOpen ? "map" : "list")}
          aria-label={sheetOpen ? "Свернуть" : "Развернуть"}
          className="flex w-full shrink-0 touch-none justify-center pb-2 pt-3 md:hidden"
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
            key={selectedId}
            onBack={() => selectBench(null)}
            onDelete={() => handleDelete(selectedId)}
            onReviewAdded={handleReviewAdded}
            onError={setError}
            onShare={shareBench}
            distance={selectedId !== null ? distances.get(selectedId) : undefined}
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
            onSort={handleSort}
            tagFilter={tagFilter}
            onTagFilter={setTagFilter}
            distances={distances}
            onSelect={handleSelect}
            onExpand={() => setMobileTab("list")}
            onStartAdd={() => {
              setAddMode(true);
              setMobileTab("map");
            }}
          />
        )}
      </aside>

      {notice && !error && (
        <div className="absolute left-1/2 top-[72px] z-[3000] -translate-x-1/2 animate-rise md:top-[84px]">
          <div className="flex items-center gap-2 whitespace-nowrap rounded-full bg-forest px-4 py-2.5 text-sm font-semibold text-white shadow-2xl">
            <Check size={17} className="text-moss" strokeWidth={3} />
            {notice}
          </div>
        </div>
      )}

      {error && (
        <div className="absolute left-1/2 top-[72px] z-[3000] -translate-x-1/2 animate-rise md:top-[84px]">
          <div className="flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-paper shadow-2xl">
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
      className="fixed inset-0 z-[4000] flex animate-fade-in items-end justify-center bg-night/50 p-3 backdrop-blur-sm sm:items-center sm:p-4"
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
      className="fixed inset-0 z-[5000] flex animate-fade-in items-center justify-center bg-night/90 p-4 backdrop-blur-md"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div className="relative max-w-4xl animate-zoom-in" onClick={(e) => e.stopPropagation()}>
        <img
          src={photo.src}
          alt={photo.caption}
          className="max-h-[80vh] w-auto max-w-full rounded-[24px] bg-night object-contain shadow-2xl"
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
          className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-night/50 text-white backdrop-blur-md transition hover:rotate-90 hover:bg-night/70"
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
  { key: "reviews", label: "Отзывы", icon: MessageSquare },
  { key: "near", label: "Рядом", icon: Navigation },
];

/** Чипы удобств: выбор при добавлении/редактировании и фильтр списка */
function TagChips({
  value,
  onChange,
  size = "md",
}: {
  value: string[];
  onChange: (v: string[]) => void;
  size?: "sm" | "md";
}) {
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((t) => t !== id) : [...value, id]);
  return (
    <>
      {BENCH_TAGS.map((t) => {
        const on = value.includes(t.id);
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => toggle(t.id)}
            aria-pressed={on}
            className={`inline-flex shrink-0 items-center gap-1 rounded-full border font-bold transition active:scale-95 ${
              size === "sm" ? "px-3 py-1.5 text-xs" : "px-3.5 py-2 text-sm"
            } ${
              on
                ? "border-forest bg-forest text-moss"
                : "border-sand bg-paper text-ink-soft hover:border-sand-dark hover:text-ink"
            }`}
          >
            {on && <Check size={size === "sm" ? 12 : 14} strokeWidth={3} />}
            {t.label}
          </button>
        );
      })}
    </>
  );
}

function BenchList({
  benches,
  loading,
  stats,
  search,
  onSearch,
  sort,
  onSort,
  tagFilter,
  onTagFilter,
  distances,
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
  tagFilter: string[];
  onTagFilter: (v: string[]) => void;
  distances: Map<number, number>;
  onSelect: (id: number) => void;
  onExpand: () => void;
  onStartAdd: () => void;
}) {
  const filtering = Boolean(search.trim()) || tagFilter.length > 0;
  return (
    <>
      <div data-sheet-drag className="shrink-0 touch-none px-5 pb-3 pt-1 md:touch-auto md:pt-6">
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
        {/* Фильтр по удобствам: чипы переносятся на новую строку */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          <TagChips value={tagFilter} onChange={onTagFilter} size="sm" />
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
              {filtering ? "Ничего не нашли" : "Пока пусто"}
            </p>
            <p className="mt-1 text-sm text-ink-soft">
              {filtering
                ? "Попробуйте другой запрос или уберите фильтры"
                : "Отметьте первую скамейку — это займёт минуту"}
            </p>
            {tagFilter.length > 0 && (
              <button onClick={() => onTagFilter([])} className={`${ghostBtn} mt-5`}>
                Сбросить фильтры
              </button>
            )}
            {!filtering && (
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
                <BenchCard bench={b} distance={distances.get(b.id)} onSelect={onSelect} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function BenchCard({
  bench: b,
  distance,
  onSelect,
}: {
  bench: BenchSummary;
  distance?: number;
  onSelect: (id: number) => void;
}) {
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
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-forest to-night text-moss/40">
          <BenchGlyph size={96} />
        </div>
      )}
      <span className="grain absolute inset-0" />
      <span className="absolute inset-0 bg-gradient-to-t from-night/85 via-night/15 to-transparent" />

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
        {b.status === "pending" && (
          <span className="inline-flex items-center gap-1 rounded-full bg-tangerine px-2.5 py-1 text-xs font-bold text-white shadow">
            <ShieldAlert size={12} />
            на проверке
          </span>
        )}
        <span className="inline-flex items-center gap-1 rounded-full bg-night/50 px-2.5 py-1 text-xs font-bold text-white backdrop-blur-md">
          <MessageSquare size={12} />
          {b.reviewCount}
        </span>
        {distance !== undefined && (
          <span className="inline-flex items-center gap-1 rounded-full bg-night/50 px-2.5 py-1 text-xs font-bold text-white backdrop-blur-md">
            <Navigation size={11} />
            {formatDistance(distance)}
          </span>
        )}
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
  const [tags, setTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  // Подсказка «похоже ли на скамейку» — та же модель на сервере, ничего не сохраняет
  const [photoCheck, setPhotoCheck] = useState<
    { state: "idle" } | { state: "checking" } | { state: "done"; isBench: boolean } | { state: "error" }
  >({ state: "idle" });
  const checkSeq = useRef(0);

  const onBenchPhoto = (file: File | null) => {
    setBenchPhoto(file);
    const seq = ++checkSeq.current;
    if (!file) {
      setPhotoCheck({ state: "idle" });
      return;
    }
    setPhotoCheck({ state: "checking" });
    const fd = new FormData();
    fd.append("photo", file);
    fetch("/api/check-photo", { method: "POST", body: fd })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { isBench: boolean }) => {
        if (seq === checkSeq.current) setPhotoCheck({ state: "done", isBench: d.isBench });
      })
      .catch(() => {
        if (seq === checkSeq.current) setPhotoCheck({ state: "error" });
      });
  };
  const looksWrong = photoCheck.state === "done" && !photoCheck.isBench;

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
      for (const t of tags) formData.append("tags", t);

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
      <div data-sheet-drag className="flex shrink-0 touch-none items-center gap-3 px-5 pb-3 pt-2 md:touch-auto md:pt-5">
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
              placeholder="Чем запомнилось это место?"
              className={`${inputClass} resize-none`}
            />
          </Field>
          <div>
            <span className="mb-1.5 block pl-1 text-xs font-bold text-ink-soft">Удобства</span>
            <div className="flex flex-wrap gap-1.5">
              <TagChips value={tags} onChange={setTags} />
            </div>
          </div>
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
            <PhotoCapture label="Фото скамейки" onPhoto={onBenchPhoto} required={true} />
            {photoCheck.state !== "idle" && (
              <div
                className={`mt-2 flex items-start gap-2 rounded-2xl px-3.5 py-2.5 text-xs font-semibold ${
                  looksWrong
                    ? "bg-tangerine/12 text-tangerine-dark"
                    : photoCheck.state === "done"
                      ? "bg-moss/25 text-forest-light"
                      : "bg-sand/70 text-ink-soft"
                }`}
              >
                {photoCheck.state === "checking" && (
                  <>
                    <Loader2 size={15} className="shrink-0 animate-spin" />
                    Смотрим, что на фото…
                  </>
                )}
                {photoCheck.state === "done" && photoCheck.isBench && (
                  <>
                    <Check size={15} className="shrink-0" strokeWidth={3} />
                    Похоже на скамейку — отлично!
                  </>
                )}
                {looksWrong && (
                  <>
                    <ShieldAlert size={15} className="mt-px shrink-0" />
                    <span>
                      Не похоже на скамейку. Сфотографируйте её поближе — или отправьте как есть,
                      тогда скамейку сначала проверит модератор.
                    </span>
                  </>
                )}
                {photoCheck.state === "error" && (
                  <>
                    <AlertCircle size={15} className="shrink-0" />
                    Не получилось проверить фото — его посмотрят после отправки.
                  </>
                )}
              </div>
            )}
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
          {saving ? "Сохраняем…" : looksWrong ? "Отправить на проверку" : "Сохранить скамейку"}
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
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink font-display text-xs font-bold text-paper">
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
  onShare,
  distance,
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
  onShare: (bench: { id: number; title: string }) => void;
  distance?: number;
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
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  const [confirmDelReview, setConfirmDelReview] = useState<number | null>(null);

  // «Полезно»: какие рецензии этот браузер уже отметил + свежие счётчики
  const [likedRaw, setLikedRaw] = useStoredString("bench-liked-reviews");
  const liked = useMemo(() => {
    try {
      const arr = JSON.parse(likedRaw || "[]");
      return new Set<number>(Array.isArray(arr) ? arr : []);
    } catch {
      return new Set<number>();
    }
  }, [likedRaw]);
  const [likeCounts, setLikeCounts] = useState<Record<number, number>>({});
  const [reviewSort, setReviewSort] = useState<"new" | "useful">("new");

  const toggleLike = async (reviewId: number) => {
    const wasLiked = liked.has(reviewId);
    try {
      const res = await fetch(`/api/reviews/${reviewId}/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delta: wasLiked ? -1 : 1 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка");
      setLikeCounts((prev) => ({ ...prev, [reviewId]: data.likes }));
      const next = new Set(liked);
      if (wasLiked) next.delete(reviewId);
      else next.add(reviewId);
      setLikedRaw(next.size ? JSON.stringify([...next]) : "");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось отметить рецензию");
    }
  };

  const sortedReviews = useMemo(() => {
    const list = [...(details?.reviews ?? [])];
    if (reviewSort === "useful") {
      const n = (r: { id: number; likes: number }) => likeCounts[r.id] ?? r.likes ?? 0;
      list.sort((a, b) => n(b) - n(a));
    }
    return list;
  }, [details, reviewSort, likeCounts]);

  const [approving, setApproving] = useState(false);
  const approve = async () => {
    if (!details) return;
    setApproving(true);
    try {
      const res = await fetch(`/api/benches/${details.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
        body: JSON.stringify({ status: "approved" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка");
      await onReviewAdded();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось одобрить");
    } finally {
      setApproving(false);
    }
  };

  const startEdit = () => {
    setEditTitle(details?.title ?? "");
    setEditDesc(details?.description ?? "");
    setEditTags(details?.tags ?? []);
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
        body: JSON.stringify({ title: editTitle, description: editDesc, tags: editTags }),
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
      <div className="flex items-center gap-1.5">
        {details && (
          <button
            onClick={() => onShare(details)}
            aria-label="Поделиться"
            title="Поделиться ссылкой"
            className={floatingBtn}
          >
            <Share2 size={17} />
          </button>
        )}
        {isAdmin && (
          <>
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
          </>
        )}
      </div>
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
                <span className="absolute inset-0 bg-gradient-to-t from-night/70 via-transparent to-night/30" />
                <span className="absolute bottom-4 left-4 rounded-full bg-night/45 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur-md">
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
                <div className="flex flex-wrap gap-1.5">
                  <TagChips value={editTags} onChange={setEditTags} size="sm" />
                </div>
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
                {(details.tags ?? []).length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {details.tags.map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-1 rounded-full bg-moss/30 px-3 py-1.5 text-xs font-bold text-forest-light"
                      >
                        <Check size={12} strokeWidth={3} />
                        {tagLabel(t)}
                      </span>
                    ))}
                  </div>
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
              {distance !== undefined && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-sand/70 px-3 py-1.5">
                  <Navigation size={12} /> {formatDistance(distance)} от вас
                </span>
              )}
            </div>

            {details.status === "pending" && (
              <div className="mt-4 rounded-[22px] bg-tangerine/12 p-4 ring-1 ring-tangerine/25">
                <div className="flex items-center gap-2 text-sm font-extrabold text-tangerine-dark">
                  <ShieldAlert size={17} /> На проверке
                </div>
                <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                  Модель не узнала скамейку на фото
                  {typeof details.photoScore === "number"
                    ? ` (уверенность ${Math.round(details.photoScore * 100)}%)`
                    : ""}
                  . Скамейку видите только вы — одобрите или удалите её.
                </p>
                {isAdmin && (
                  <button onClick={approve} disabled={approving} className={`${primaryBtn} mt-3 w-full py-2.5`}>
                    <Check size={16} strokeWidth={3} />
                    {approving ? "Одобряем…" : "Одобрить и показать всем"}
                  </button>
                )}
              </div>
            )}

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
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-baseline gap-2">
                  <h3 className="font-display text-lg font-bold text-ink">Рецензии</h3>
                  <span className="text-sm font-bold text-ink-soft">{details.reviewCount}</span>
                </div>
                {details.reviews.length > 1 && (
                  <div className="flex gap-0.5 rounded-full bg-sand/70 p-0.5 text-[11px] font-bold">
                    {(
                      [
                        ["new", "Новые"],
                        ["useful", "Полезные"],
                      ] as const
                    ).map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => setReviewSort(key)}
                        className={`rounded-full px-2.5 py-1 transition ${
                          reviewSort === key ? "bg-paper text-ink shadow-sm" : "text-ink-soft"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {details.reviews.length === 0 ? (
                <div className="rounded-[22px] border-2 border-dashed border-sand-dark p-6 text-center text-sm font-medium text-ink-soft">
                  Пока никто не написал — будьте первым
                </div>
              ) : (
                <ul className="space-y-2.5">
                  {sortedReviews.map((r) => {
                    const color = AVATAR_COLORS[r.author.charCodeAt(0) % AVATAR_COLORS.length];
                    const likes = likeCounts[r.id] ?? r.likes ?? 0;
                    const isLiked = liked.has(r.id);
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
                        <div className="mt-3 flex justify-end">
                          <button
                            onClick={() => toggleLike(r.id)}
                            aria-pressed={isLiked}
                            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition active:scale-95 ${
                              isLiked
                                ? "bg-tangerine/15 text-tangerine-dark"
                                : "bg-sand/60 text-ink-soft hover:text-ink"
                            }`}
                          >
                            <Heart size={13} fill={isLiked ? "currentColor" : "none"} />
                            Полезно{likes > 0 ? ` · ${likes}` : ""}
                          </button>
                        </div>
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
