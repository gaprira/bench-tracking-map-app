"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { BenchDetails, BenchSummary } from "@/lib/types";
import Stars from "./Stars";
import PhotoCapture from "./PhotoCapture";

const BenchMap = dynamic(() => import("./BenchMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-slate-200 text-slate-500">
      Загружаем карту…
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

  useEffect(() => {
    const saved = window.localStorage.getItem("bench-author");
    if (saved) setAuthor(saved);
  }, []);
  useEffect(() => {
    window.localStorage.setItem("bench-author", author);
  }, [author]);

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

  const handleDelete = async (id: number) => {
    if (!window.confirm("Удалить эту скамейку вместе с рецензиями?")) return;
    const res = await fetch(`/api/benches/${id}`, { method: "DELETE" });
    if (res.ok) {
      setBenches((prev) => prev.filter((b) => b.id !== id));
      setSelectedId(null);
    } else {
      setError("Не удалось удалить скамейку");
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
    <div className="flex h-dvh flex-col bg-slate-50">
      {/* Header */}
      <header className="z-20 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-xl shadow">
            🪑
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight text-slate-900">
              Скамейки
            </h1>
            <p className="text-xs text-slate-500">
              {stats.total} на карте · {pluralReviews(stats.reviewsTotal)}
              {stats.avg !== null && ` · средняя ★ ${stats.avg.toFixed(1)}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="Ваше имя"
            maxLength={80}
            className="hidden w-36 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-emerald-500 sm:block"
          />
          <button
            onClick={locateMe}
            title="Моё местоположение"
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100"
          >
            📍
          </button>
          <button
            onClick={() => {
              setAddMode((v) => !v);
              setDraft(null);
              setSelectedId(null);
              setMobileTab("map");
            }}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold text-white shadow transition ${
              addMode
                ? "bg-amber-500 hover:bg-amber-600"
                : "bg-emerald-600 hover:bg-emerald-700"
            }`}
          >
            {addMode ? "Отмена" : "+ Добавить"}
          </button>
        </div>
      </header>

      {/* Mobile tabs */}
      <div className="flex border-b border-slate-200 bg-white md:hidden">
        {(["map", "list"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setMobileTab(t)}
            className={`flex-1 py-2 text-sm font-medium ${
              mobileTab === t
                ? "border-b-2 border-emerald-600 text-emerald-700"
                : "text-slate-500"
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
          } w-full flex-col border-r border-slate-200 bg-white md:flex md:w-[400px] lg:w-[440px]`}
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
          } relative min-h-0 flex-1 md:block`}
        >
          <BenchMap
            benches={benches}
            selectedId={selectedId}
            draft={draft}
            focus={focus}
            onSelect={handleSelect}
            onMapClick={handleMapClick}
          />
          {addMode && !draft && (
            <div className="pointer-events-none absolute left-1/2 top-4 z-[1000] -translate-x-1/2 rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-lg">
              Нажмите на карту, чтобы отметить скамейку
            </div>
          )}
          <div className="absolute bottom-4 left-4 z-[1000] hidden rounded-lg bg-white/90 p-2 text-xs shadow backdrop-blur sm:block">
            <div className="mb-1 font-semibold text-slate-700">Легенда</div>
            <Legend color="#16a34a" label="4.5+ отличная" />
            <Legend color="#65a30d" label="3.5–4.4 хорошая" />
            <Legend color="#f59e0b" label="2.5–3.4 так себе" />
            <Legend color="#dc2626" label="< 2.5 плохая" />
            <Legend color="#64748b" label="без оценок" />
          </div>
        </main>

        {error && (
          <div className="absolute bottom-4 left-1/2 z-[2000] -translate-x-1/2 rounded-lg bg-red-600 px-4 py-2 text-sm text-white shadow-lg">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2 text-slate-600">
      <span
        className="inline-block h-3 w-3 rounded-full border border-white"
        style={{ background: color }}
      />
      {label}
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
      <div className="space-y-2 border-b border-slate-200 p-3">
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Поиск по названию или описанию…"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
        />
        <div className="flex gap-1 text-xs">
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
              className={`rounded-full px-3 py-1 ${
                sort === key
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-6 text-center text-sm text-slate-500">Загрузка…</div>
        ) : benches.length === 0 ? (
          <div className="p-8 text-center">
            <div className="mb-2 text-4xl">🪑</div>
            <p className="text-sm text-slate-600">
              {search ? "Ничего не найдено" : "Скамеек пока нет"}
            </p>
            {!search && (
              <button
                onClick={onStartAdd}
                className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                Отметить первую
              </button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {benches.map((b) => (
              <li key={b.id}>
                <button
                  onClick={() => onSelect(b.id)}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-emerald-50"
                >
                  <div className="mt-0.5 text-2xl">🪑</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-slate-900">
                      {b.title}
                    </div>
                    {b.description && (
                      <p className="line-clamp-2 text-xs text-slate-500">
                        {b.description}
                      </p>
                    )}
                    <div className="mt-1 flex items-center gap-2 text-xs text-slate-600">
                      {b.avgRating !== null ? (
                        <>
                          <Stars value={b.avgRating} size="sm" />
                          <span className="font-medium">{b.avgRating.toFixed(1)}</span>
                        </>
                      ) : (
                        <span className="text-slate-400">без оценок</span>
                      )}
                      <span>· {pluralReviews(b.reviewCount)}</span>
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
      <div className="flex items-center gap-2 border-b border-slate-200 p-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
        >
          ← Назад
        </button>
        <h2 className="font-semibold text-slate-900">Новая скамейка</h2>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
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
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
        </Field>
        <Field label="Описание">
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Вид, тень, спинка, рядом ли урна…"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
        </Field>
        <Field label="Ваше имя">
          <input
            maxLength={80}
            value={author}
            onChange={(e) => onAuthorChange(e.target.value)}
            placeholder="Аноним"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
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

        <div className="rounded-xl border border-slate-200 p-3">
          <div className="mb-2 text-sm font-semibold text-slate-800">
            Первая рецензия (необязательно)
          </div>
          <div className="mb-2 flex items-center gap-2">
            <Stars value={rating} onChange={setRating} size="lg" />
            {rating > 0 && (
              <button
                type="button"
                onClick={() => setRating(0)}
                className="text-xs text-slate-400 hover:text-slate-600"
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
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
          {(rating > 0) !== Boolean(reviewText.trim()) && (
            <p className="mt-1 text-xs text-amber-600">
              Для рецензии нужны и оценка, и текст
            </p>
          )}
        </div>
      </div>
      <div className="border-t border-slate-200 p-3">
        <button
          type="submit"
          disabled={saving || !title.trim() || !benchPhoto || !viewPhoto}
          className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white shadow hover:bg-emerald-700 disabled:opacity-50"
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
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
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
}: {
  details: BenchDetails | null;
  loading: boolean;
  author: string;
  onAuthorChange: (v: string) => void;
  onBack: () => void;
  onDelete: () => void;
  onReviewAdded: () => Promise<void>;
  onError: (msg: string) => void;
}) {
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

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
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 p-3">
        <button
          onClick={onBack}
          className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
        >
          ← Все скамейки
        </button>
        <button
          onClick={onDelete}
          className="rounded-lg px-2 py-1 text-xs text-red-500 hover:bg-red-50"
        >
          Удалить
        </button>
      </div>

      {loading && !details ? (
        <div className="p-6 text-center text-sm text-slate-500">Загрузка…</div>
      ) : !details ? (
        <div className="p-6 text-center text-sm text-slate-500">Скамейка не найдена</div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="border-b border-slate-100 p-4">
            <h2 className="text-xl font-bold text-slate-900">{details.title}</h2>
            {details.description && (
              <p className="mt-1 text-sm text-slate-600">{details.description}</p>
            )}
            <p className="mt-2 text-xs text-slate-400">
              Добавил(а) {details.createdBy} · {formatDate(details.createdAt)} ·{" "}
              {details.lat.toFixed(4)}, {details.lng.toFixed(4)}
            </p>

            {(details.benchPhoto || details.viewPhoto) && (
              <div className="mt-4 grid grid-cols-2 gap-3">
                {details.benchPhoto && (
                  <div className="rounded-lg overflow-hidden border border-slate-200">
                    <img
                      src={details.benchPhoto}
                      alt="Фото скамейки"
                      className="w-full h-40 object-cover"
                    />
                    <div className="px-2 py-1 text-xs text-slate-500 bg-slate-50 border-t border-slate-100">
                      Фото скамейки
                    </div>
                  </div>
                )}
                {details.viewPhoto && (
                  <div className="rounded-lg overflow-hidden border border-slate-200">
                    <img
                      src={details.viewPhoto}
                      alt="Вид со скамейки"
                      className="w-full h-40 object-cover"
                    />
                    <div className="px-2 py-1 text-xs text-slate-500 bg-slate-50 border-t border-slate-100">
                      Вид со скамейки
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="mt-4 flex items-center gap-4 rounded-xl bg-slate-50 p-3">
              <div className="text-center">
                <div className="text-3xl font-bold text-slate-900">
                  {details.avgRating !== null ? details.avgRating.toFixed(1) : "—"}
                </div>
                <Stars value={details.avgRating ?? 0} size="sm" />
                <div className="text-xs text-slate-500">
                  {pluralReviews(details.reviewCount)}
                </div>
              </div>
              <div className="flex-1 space-y-1">
                {[5, 4, 3, 2, 1].map((n) => {
                  const c = distribution[n - 1];
                  const pct = details.reviewCount ? (c / details.reviewCount) * 100 : 0;
                  return (
                    <div key={n} className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="w-3">{n}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded bg-slate-200">
                        <div
                          className="h-full bg-amber-400"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-4 text-right">{c}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <form onSubmit={submit} className="border-b border-slate-100 p-4">
            <div className="mb-2 text-sm font-semibold text-slate-800">
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
              className="mb-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
            />
            <div className="flex gap-2">
              <input
                maxLength={80}
                value={author}
                onChange={(e) => onAuthorChange(e.target.value)}
                placeholder="Ваше имя"
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
              />
              <button
                type="submit"
                disabled={saving || rating === 0 || !text.trim()}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? "…" : "Отправить"}
              </button>
            </div>
          </form>

          <div className="p-4">
            <div className="mb-3 text-sm font-semibold text-slate-800">
              Рецензии ({details.reviewCount})
            </div>
            {details.reviews.length === 0 ? (
              <p className="text-sm text-slate-500">
                Пока никто не написал. Будьте первым!
              </p>
            ) : (
              <ul className="space-y-3">
                {details.reviews.map((r) => (
                  <li key={r.id} className="rounded-xl border border-slate-200 p-3">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-800">
                        {r.author}
                      </span>
                      <span className="text-xs text-slate-400">
                        {formatDate(r.createdAt)}
                      </span>
                    </div>
                    <Stars value={r.rating} size="sm" />
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                      {r.text}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
