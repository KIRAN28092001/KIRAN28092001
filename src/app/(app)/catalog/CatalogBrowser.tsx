"use client";
import { useMemo, useState, useDeferredValue } from "react";
import Link from "next/link";
import { Camera, Filter, MapPin, PackageX, Search, SlidersHorizontal, X } from "lucide-react";
import { CameraScanner } from "@/components/scanner/CameraScanner";
import { ToolImage } from "@/components/ToolImage";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { RequestToolDialog, type RequestTarget } from "@/components/tools/RequestToolDialog";
import { cn } from "@/lib/utils";
import type { CatalogItem, Category } from "@/lib/types";

type Sort = "availability" | "name" | "recent" | "popular" | "category" | "project";

export function CatalogBrowser({
  items,
  categories,
  projects,
  requestProjects,
  loanDays,
  openRequests,
  initial,
}: {
  items: CatalogItem[];
  categories: Category[];
  projects: { id: string; name: string }[];
  requestProjects: { id: string; name: string }[];
  loanDays: number;
  openRequests: Record<string, string>;
  initial: { q: string; availability: string; category: string };
}) {
  const [q, setQ] = useState(initial.q);
  const dq = useDeferredValue(q);
  const [category, setCategory] = useState(initial.category);
  const [availability, setAvailability] = useState(initial.availability);
  const [project, setProject] = useState("all");
  const [condition, setCondition] = useState("all");
  const [location, setLocation] = useState("all");
  const [sort, setSort] = useState<Sort>("availability");
  const [showFilters, setShowFilters] = useState(false);
  const [scan, setScan] = useState(false);
  const [target, setTarget] = useState<RequestTarget | null>(null);

  const locations = useMemo(() => Array.from(new Set(items.map((i) => i.storage_location).filter(Boolean))).sort() as string[], [items]);

  const filtered = useMemo(() => {
    const terms = dq.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const out = items.filter((i) => {
      if (category !== "all" && i.category_id !== category) return false;
      if (availability === "available" && i.available_units === 0) return false;
      if (availability === "unavailable" && i.available_units > 0) return false;
      if (project !== "all") {
        const pname = projects.find((p) => p.id === project)?.name;
        if (i.home_project_id !== project && !(pname && i.active_projects?.includes(pname))) return false;
      }
      if (condition !== "all" && i.overall_condition !== condition) return false;
      if (location !== "all" && i.storage_location !== location) return false;
      if (terms.length) {
        const hay = [i.name, i.brand, i.category_name, i.parent_code, i.model_number, i.unit_search, i.home_project_name, i.storage_location, ...(i.active_projects ?? [])]
          .join(" ")
          .toLowerCase();
        return terms.every((t) => hay.includes(t));
      }
      return true;
    });
    const by: Record<Sort, (a: CatalogItem, b: CatalogItem) => number> = {
      availability: (a, b) => Number(b.available_units > 0) - Number(a.available_units > 0) || b.available_units - a.available_units || a.name.localeCompare(b.name),
      name: (a, b) => a.name.localeCompare(b.name),
      recent: (a, b) => b.created_at.localeCompare(a.created_at),
      popular: (a, b) => b.times_requested - a.times_requested,
      category: (a, b) => a.category_name.localeCompare(b.category_name) || a.name.localeCompare(b.name),
      project: (a, b) => (a.home_project_name ?? "~").localeCompare(b.home_project_name ?? "~") || a.name.localeCompare(b.name),
    };
    return out.sort(by[sort]);
  }, [items, dq, category, availability, project, condition, location, sort, projects]);

  function handleScan(code: string) {
    setScan(false);
    const upper = code.toUpperCase();
    const exactUnit = items.find((i) => i.unit_search.toUpperCase().split(/\s+/).includes(upper));
    const exactParent = items.find((i) => i.parent_code.toUpperCase() === upper);
    if (exactUnit && upper !== exactUnit.parent_code.toUpperCase()) {
      setQ(upper);
      setTarget({ ...exactUnit, unit_code: upper });
    } else if (exactParent) {
      setQ(upper);
    } else {
      setQ(code);
    }
  }

  const activeFilterCount = [category, availability, project, condition, location].filter((v) => v !== "all").length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Request a tool</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Search by name, brand, category, parent code, serial or barcode — or scan a label.</p>
      </div>

      {/* Search bar */}
      <div className="sticky top-16 z-10 -mx-3 space-y-2 bg-stone-100/95 px-3 py-2 backdrop-blur dark:bg-brand-coal/95 sm:mx-0 sm:px-0">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <label htmlFor="catalog-search" className="sr-only">Search tools</label>
            <Search className="pointer-events-none absolute left-4 top-1/2 h-6 w-6 -translate-y-1/2 text-zinc-500" aria-hidden />
            <input
              id="catalog-search"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleScan(q.trim());
              }}
              placeholder="Drill, Milwaukee, MIL-DRL-101-02…"
              className="input min-h-[60px] pl-12 pr-10 text-lg"
              autoComplete="off"
            />
            {q && (
              <button className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-zinc-500 hover:text-black dark:hover:text-white" onClick={() => setQ("")} aria-label="Clear search">
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
          <button className={`btn btn-lg ${scan ? "btn-dark" : "btn-primary"}`} onClick={() => setScan((s) => !s)} aria-pressed={scan} aria-label="Scan barcode with camera">
            <Camera className="h-6 w-6" aria-hidden />
            <span className="hidden sm:inline">Scan</span>
          </button>
          <button className="btn btn-outline btn-lg relative" onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters} aria-controls="catalog-filters" aria-label="Filters and sorting">
            <SlidersHorizontal className="h-6 w-6" aria-hidden />
            <span className="hidden sm:inline">Filters</span>
            {activeFilterCount > 0 && <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-brand-yellow text-xs font-bold text-black">{activeFilterCount}</span>}
          </button>
        </div>
        {scan && <CameraScanner active={scan} onDetected={handleScan} />}

        {/* Availability quick chips */}
        <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Availability">
          {[
            ["all", "All tools"],
            ["available", "Available now"],
            ["unavailable", "Unavailable"],
          ].map(([v, l]) => (
            <button key={v} onClick={() => setAvailability(v)} aria-pressed={availability === v} className={cn("chip shrink-0", availability === v ? "border-brand-charcoal bg-brand-charcoal text-white dark:border-brand-yellow dark:bg-brand-yellow dark:text-black" : "border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-900")}>
              {l}
            </button>
          ))}
          <span className="mx-1 w-px shrink-0 bg-zinc-300 dark:bg-zinc-700" aria-hidden />
          {categories.map((c) => (
            <button key={c.id} onClick={() => setCategory(category === c.id ? "all" : c.id)} aria-pressed={category === c.id} className={cn("chip shrink-0", category === c.id ? "border-brand-yellow bg-brand-yellow text-black" : "border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-900")}>
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {showFilters && (
        <div id="catalog-filters" className="card card-pad grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label htmlFor="f-cat" className="label">Category</label>
            <select id="f-cat" className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="all">All categories</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="f-proj" className="label">Project</label>
            <select id="f-proj" className="input" value={project} onChange={(e) => setProject(e.target.value)}>
              <option value="all">All projects</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="f-cond" className="label">Condition</label>
            <select id="f-cond" className="input" value={condition} onChange={(e) => setCondition(e.target.value)}>
              <option value="all">Any condition</option>
              <option value="good">Good</option>
              <option value="fair">Some units fair</option>
              <option value="attention">Has damaged/missing units</option>
            </select>
          </div>
          <div>
            <label htmlFor="f-loc" className="label">Location</label>
            <select id="f-loc" className="input" value={location} onChange={(e) => setLocation(e.target.value)}>
              <option value="all">All locations</option>
              {locations.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="f-sort" className="label">Sort by</label>
            <select id="f-sort" className="input" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="availability">Availability</option>
              <option value="name">Name (A–Z)</option>
              <option value="recent">Recently added</option>
              <option value="popular">Most requested</option>
              <option value="category">Category</option>
              <option value="project">Project</option>
            </select>
          </div>
          {activeFilterCount > 0 && (
            <button
              className="btn btn-ghost sm:col-span-2 lg:col-span-5"
              onClick={() => {
                setCategory("all");
                setAvailability("all");
                setProject("all");
                setCondition("all");
                setLocation("all");
              }}
            >
              <Filter className="h-4 w-4" aria-hidden /> Clear filters
            </button>
          )}
        </div>
      )}

      <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-400" aria-live="polite">
        {filtered.length} of {items.length} tools
      </p>

      {filtered.length === 0 ? (
        <EmptyState icon={PackageX} title="No tools match">
          Try a different search, or clear filters. You can also scan the barcode on the tool label.
        </EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((i) => {
            const available = i.available_units > 0;
            const mine = openRequests[i.id];
            return (
              <li key={i.id} className="card flex flex-col overflow-hidden">
                <Link href={`/catalog/${i.id}`} className="flex gap-3 p-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                  <ToolImage src={i.image_url ?? i.category_image_url} alt={`${i.brand} ${i.name}`} className="h-24 w-24 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold uppercase tracking-wide text-zinc-500">{i.brand} · {i.category_name}</div>
                    <h2 className="font-extrabold leading-snug">{i.name}</h2>
                    <div className="mt-0.5 font-mono text-xs text-zinc-600 dark:text-zinc-400">{i.parent_code}</div>
                    <div className="mt-1 flex items-center gap-1 truncate text-xs text-zinc-600 dark:text-zinc-400">
                      <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                      {i.active_projects?.length ? `In use: ${i.active_projects.join(", ")}` : i.home_project_name ?? i.storage_location ?? "Tool crib"}
                    </div>
                  </div>
                </Link>
                <div className="mt-auto flex items-center justify-between gap-2 border-t border-zinc-100 px-3 py-2.5 dark:border-zinc-800">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {available ? (
                      <Badge tone="green">{i.available_units}/{i.total_units} available</Badge>
                    ) : (
                      <Badge tone="red">Unavailable · 0/{i.total_units}</Badge>
                    )}
                    {i.overall_condition !== "good" && <Badge tone={i.overall_condition === "attention" ? "orange" : "yellow"} dot={false}>{i.overall_condition === "attention" ? "Some units down" : "Fair"}</Badge>}
                  </div>
                  {mine ? (
                    <Link href="/requests" className="btn btn-outline btn-sm">Requested</Link>
                  ) : available ? (
                    <button className="btn btn-primary" onClick={() => setTarget(i)} aria-label={`Request ${i.name}`}>Request</button>
                  ) : (
                    <Link href={`/catalog/${i.id}`} className="btn btn-outline btn-sm">Who has it?</Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <RequestToolDialog target={target} projects={requestProjects} loanDays={loanDays} onClose={() => setTarget(null)} />
    </div>
  );
}
