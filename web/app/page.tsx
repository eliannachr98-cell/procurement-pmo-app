"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject, type SyntheticEvent } from "react";
import "leaflet/dist/leaflet.css";
import { LayoutGrid, ClipboardList, TrendingUp, Bell, CircleUserRound } from "lucide-react";
import { captureChartImage, downloadExcel, downloadPdf, type ExportPayload } from "@/lib/exports";
import type { Apodeltiosi } from "@/lib/apodeltiosi";

type Status = "Ενεργός" | "Αξιολόγηση" | "Ανατεθειμένος" | "Ολοκληρωμένος" | "Ακυρωμένος";
type Tender = {
  adam: string;
  title: string;
  authority: string;
  cpv: string;
  cpvDescription?: string;
  contractType?: string;
  procedureType?: string;
  documentType?: string;
  nutsCode?: string;
  nutsName?: string;
  status: Status;
  publicationDate: string;
  deadline?: string;
  openingDate?: string;
  awardDate?: string;
  contractDates?: string[];
  deliveryDates?: string[];
  contractors?: string[];
  awardValue?: number;
  contractValue?: number;
  budget: number;
};
type Award = {
  adam: string;
  noticeAdam?: string;
  noticeTitle?: string;
  title: string;
  authority: string;
  cpv: string;
  cpvDescription?: string;
  contractor: string;
  contractorVat?: string;
  awardDate?: string;
  value: number;
};
type Contract = {
  adam: string;
  noticeAdam?: string;
  noticeTitle?: string;
  title: string;
  authority: string;
  cpv: string;
  cpvDescription?: string;
  contractor: string;
  contractorVat?: string;
  signedDate?: string;
  deliveryDate?: string;
  value: number;
};

const fallbackTenders: Tender[] = [
  { adam: "25PROC017081252", title: "Υπηρεσίες συμβούλου για τον ψηφιακό μετασχηματισμό", authority: "Υπουργείο Ψηφιακής Διακυβέρνησης", cpv: "72262000-9", status: "Ενεργός", publicationDate: "2025-06-24", budget: 860000 },
];

const contractTypeOptions = ["Έργα", "Μελέτες", "Προμήθειες", "Τεχνικές ή λοιπές συναφείς υπηρεσίες", "Υπηρεσίες"];

// Well beyond any realistic CPV/authority-scoped selection (the whole
// unfiltered table is 250k+ rows) - a hit here means the current filter is
// still too broad for a complete Αγορά & Ανταγωνισμός computation.
const MARKET_AUTO_LOAD_CAP = 3000;

const navItems = [
  ["overview", LayoutGrid, "Επισκόπηση"],
  ["tenders", ClipboardList, "Διαγωνισμοί"],
  ["market", TrendingUp, "Αγορά & Ανταγωνισμός"],
  ["alerts", Bell, "Παρακολούθηση"],
  ["profile", CircleUserRound, "Προφίλ"],
] as const;

// Matched to the same hue families as the pastel Metric cards in Επισκόπηση
// (Ενεργός~mint, Αξιολόγηση~sand, Ανατεθειμένος~lilac, Ολοκληρωμένος~sage,
// Ακυρωμένος~rose), just at full saturation instead of the pastel tint -
// they'd drifted apart (Ολοκληρωμένος showed purple here vs green up there,
// Ανατεθειμένος showed blue here vs purple up there).
const statusTone: Record<Status, string> = {
  "Ενεργός": "teal",
  "Αξιολόγηση": "amber",
  "Ανατεθειμένος": "purple",
  "Ολοκληρωμένος": "green",
  "Ακυρωμένος": "red",
};

const documentTypeLabels: Record<string, string> = {
  declaration: "Διακήρυξη",
  announcement: "Προκήρυξη",
  summary: "Περίληψη",
  clarification: "Διευκρίνιση",
  extension: "Παράταση / μετάθεση",
  amendment: "Τροποποίηση",
  decision: "Απόφαση / έγκριση",
};

const number = new Intl.NumberFormat("el-GR");
const euro = new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

type DashboardBreakdown = {
  total: number;
  status: { status: string; count: number; budget: number }[];
  cpv: { cpv_code: string; cpv_description: string | null; count: number }[];
  cpvTotal: number;
  nuts: { nuts_code: string; nuts_name: string; count: number }[];
  monthly: { month: string; count: number; budget: number; authorities: number; cpv: number }[];
};
const emptyDashboard: DashboardBreakdown = { total: 0, status: [], cpv: [], cpvTotal: 0, nuts: [], monthly: [] };

export default function Home() {
  const [tenders, setTenders] = useState<Tender[]>(fallbackTenders);
  const [awards, setAwards] = useState<Award[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [dashboard, setDashboard] = useState<DashboardBreakdown>(emptyDashboard);
  const [dashboardError, setDashboardError] = useState("");
  const [years, setYears] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState("");
  const [loadedPage, setLoadedPage] = useState(1);
  const [totalTenders, setTotalTenders] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState("overview");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Όλες");
  const [authority, setAuthority] = useState("Όλες");
  const [contractor, setContractor] = useState<string[]>([]);
  const [cpv, setCpv] = useState<string[]>([]);
  const [year, setYear] = useState("Όλα");
  const [contractType, setContractType] = useState<string[]>([]);
  const [documentType, setDocumentType] = useState("Όλοι");
  // Lifted out of AlertsPanelContent so it survives switching to another tab
  // and back - that page unmounts/remounts on every tab change, which would
  // otherwise wipe free-mode watchlist picks (they're not persisted anywhere
  // else) exactly like a page refresh, just triggered by a tab click instead.
  const [alertsWatchlist, setAlertsWatchlist] = useState<WatchlistItem[]>([]);
  const [alertsNutsFilter, setAlertsNutsFilter] = useState<NutsFilterItem[]>([]);
  // Same reasoning for Αγορά & Ανταγωνισμός's own local state (drill-down
  // selection, contractor search box, "load more" count) - MarketPanel
  // unmounts on every tab switch too.
  const [marketSelectedContractor, setMarketSelectedContractor] = useState("");
  const [marketContractorSearch, setMarketContractorSearch] = useState("");
  const [marketVisibleCount, setMarketVisibleCount] = useState(10);
  // One shared login instance for the whole app - previously AlertsPanel and
  // MarketGate each had their own useTeamCode() call, so logging out on one
  // tab didn't reactively update the other (each only re-read localStorage
  // on its own next mount, i.e. the next tab switch) and Home had no direct
  // way to know the code at all (worked around with an onCodeChange relay).
  // A single instance here, rendered once, fixes both.
  const team = useTeamCode();
  const previousTeamCode = useRef(team.code);
  useEffect(() => {
    if (previousTeamCode.current && !team.code) {
      // Logging out: clear everything that mirrored persisted/team-session
      // state so it doesn't linger and get shown as if it were free-mode
      // state once the code is gone. Also resets the plain shared filters
      // (same as pressing "Επαναφορά φίλτρων") - otherwise whatever a Saved
      // View (or manual filtering) left in place before logging out would
      // keep filtering the page as if still logged in.
      setAlertsWatchlist([]); setAlertsNutsFilter([]);
      setMarketSelectedContractor(""); setMarketContractorSearch(""); setMarketVisibleCount(10);
      setStatus("Όλες"); setAuthority(""); setContractor([]); setCpv([]); setYear("Όλα"); setContractType([]); setDocumentType("Όλοι");
    }
    previousTeamCode.current = team.code;
  }, [team.code]);
  // Προφίλ needs the CPV/region watchlist counts even if the visitor never
  // opens Παρακολούθηση this session (that's the only other place that loads
  // them) - fetched independently here, on login, same endpoint
  // AlertsPanelContent's own load() already uses. The same response also
  // feeds the nav bell badge (count of matches published in the last 7
  // days, not yet awarded - the same window the "Πρόσφατοι" tab uses).
  const [recentAlertCount, setRecentAlertCount] = useState(0);
  // Submitted/interested counts and the email recipient list are also only
  // ever loaded inside AlertsPanelContent otherwise - fetched here too so
  // Προφίλ has them without requiring a prior visit to Παρακολούθηση.
  const [submittedCount, setSubmittedCount] = useState(0);
  const [interestedCount, setInterestedCount] = useState(0);
  const [profileRecipients, setProfileRecipients] = useState<{ email: string }[]>([]);
  useEffect(() => {
    if (!team.code) {
      setAlertsWatchlist([]); setAlertsNutsFilter([]); setRecentAlertCount(0);
      setSubmittedCount(0); setInterestedCount(0); setProfileRecipients([]);
      return;
    }
    const code = team.code;
    const headers = { "x-alert-code": code };
    fetch("/api/alerts", { headers })
      .then((response) => response.ok ? response.json() : { watchlist: [], nutsFilter: [], alerts: [] })
      .then((payload) => {
        setAlertsWatchlist(payload.watchlist ?? []);
        setAlertsNutsFilter(payload.nutsFilter ?? []);
        const sevenDaysAgo = Date.now() - 7 * 86400000;
        const count = (payload.alerts ?? []).filter((item: { hasAward: boolean; publicationDate: string | null }) =>
          !item.hasAward && item.publicationDate && new Date(item.publicationDate).getTime() >= sevenDaysAgo,
        ).length;
        setRecentAlertCount(count);
      })
      .catch(() => {});
    fetch("/api/alert-submissions", { headers })
      .then((response) => response.ok ? response.json() : { items: [] })
      .then((payload) => setSubmittedCount((payload.items ?? []).length))
      .catch(() => {});
    fetch("/api/alert-interests", { headers })
      .then((response) => response.ok ? response.json() : { items: [] })
      .then((payload) => setInterestedCount((payload.items ?? []).length))
      .catch(() => {});
    fetch("/api/alert-recipients", { headers })
      .then((response) => response.ok ? response.json() : { items: [] })
      .then((payload) => setProfileRecipients(payload.items ?? []))
      .catch(() => {});
  }, [team.code]);
  // Paid-tier feature: named, saved filter combinations (Επισκόπηση/
  // Διαγωνισμοί/Αγορά share the same filter state already, so one saved
  // view naturally applies to all three).
  const [savedViews, setSavedViews] = useState<{ id: string; name: string; filters: Record<string, unknown> }[]>([]);
  const [newViewName, setNewViewName] = useState("");
  const [savedViewsError, setSavedViewsError] = useState("");
  useEffect(() => {
    if (!team.code) { setSavedViews([]); return; }
    const code = team.code;
    fetch("/api/saved-views", { headers: { "x-alert-code": code } })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Φόρτωση προβολών: ${response.status} ${(await response.text()).slice(0, 200)}`);
        return response.json();
      })
      .then((payload) => { setSavedViews(payload.items ?? []); setSavedViewsError(""); })
      .catch((error) => setSavedViewsError(error instanceof Error ? error.message : "Άγνωστο σφάλμα φόρτωσης προβολών"));
  }, [team.code]);
  const saveCurrentView = () => {
    const name = newViewName.trim();
    if (!name || !team.code) return;
    const code = team.code;
    const filters = { year, authority, contractor, cpv, contractType, documentType, status };
    fetch("/api/saved-views", { method: "POST", headers: { "Content-Type": "application/json", "x-alert-code": code }, body: JSON.stringify({ name, filters }) })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Αποθήκευση προβολής: ${response.status} ${(await response.text()).slice(0, 200)}`);
        return response.json();
      })
      .then((payload) => { setSavedViews((current) => [...(payload.items ?? []), ...current]); setNewViewName(""); setSavedViewsError(""); })
      .catch((error) => setSavedViewsError(error instanceof Error ? error.message : "Άγνωστο σφάλμα αποθήκευσης προβολής"));
  };
  const applyView = (view: { filters: Record<string, unknown> }) => {
    const f = view.filters;
    if (typeof f.year === "string") setYear(f.year);
    if (typeof f.authority === "string") setAuthority(f.authority);
    if (Array.isArray(f.contractor)) setContractor(f.contractor as string[]);
    if (Array.isArray(f.cpv)) setCpv(f.cpv as string[]);
    if (Array.isArray(f.contractType)) setContractType(f.contractType as string[]);
    if (typeof f.documentType === "string") setDocumentType(f.documentType);
    if (typeof f.status === "string") setStatus(f.status);
  };
  const deleteView = (id: string) => {
    if (!team.code) return;
    const code = team.code;
    setSavedViews((current) => current.filter((item) => item.id !== id));
    fetch(`/api/saved-views?id=${encodeURIComponent(id)}`, { method: "DELETE", headers: { "x-alert-code": code } })
      .then(async (response) => { if (!response.ok) setSavedViewsError(`Διαγραφή προβολής: ${response.status} ${(await response.text()).slice(0, 200)}`); })
      .catch((error) => setSavedViewsError(error instanceof Error ? error.message : "Άγνωστο σφάλμα διαγραφής προβολής"));
  };
  const [lastSync, setLastSync] = useState<string | null>(null);
  const latestRequest = useRef(0);
  const latestDashboardRequest = useRef(0);
  // Ειδοποιήσεις has no filters and its own independent data - read via a
  // ref (not a dependency) so a plain tab switch never re-triggers the fetch
  // effect below, only an actual filter change does.
  const pageRef = useRef(page);
  useEffect(() => { pageRef.current = page; }, [page]);
  const statusChartRef = useRef<HTMLDivElement>(null);
  const cpvChartRef = useRef<HTMLDivElement>(null);
  const monthlyCountChartRef = useRef<HTMLDivElement>(null);
  const monthlyBudgetChartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/last-sync")
      .then((response) => response.ok ? response.json() : { refreshedAt: null })
      .then((payload) => setLastSync(payload.refreshedAt ?? null))
      .catch(() => setLastSync(null));
  }, []);

  useEffect(() => {
    fetch("/api/options?type=year")
      .then((response) => response.ok ? response.json() : { options: [] })
      .then((payload) => setYears(payload.options ?? []))
      .catch(() => setYears([]));
  }, []);

  const loadTenderPage = useCallback((nextPage: number, append = false) => {
    const requestId = ++latestRequest.current;
    setLoading(true);
    const params = new URLSearchParams({ page: String(nextPage), pageSize: "100" });
    if (query.trim()) params.set("q", query.trim());
    if (authority.trim() && authority !== "Όλες") params.set("authority", authority.trim());
    contractor.forEach((item) => params.append("contractor", item));
    cpv.forEach((item) => params.append("cpv", item));
    if (year !== "Όλα") params.set("year", year);
    contractType.forEach((item) => params.append("contractType", item));
    if (documentType !== "Όλοι") params.set("documentType", documentType);
    // Pages are intentionally small; users can continue through the complete
    // dataset without downloading the whole historical database at once.
    fetch(`/api/procurement?${params.toString()}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Δεν ήταν δυνατή η φόρτωση της Supabase");
        return response.json();
      })
      .then((payload) => {
        if (requestId !== latestRequest.current) return;
        setTenders((current) => append ? [...current, ...(payload.tenders ?? [])] : (payload.tenders ?? []));
        setAwards((current) => append ? [...current, ...(payload.awards ?? [])] : (payload.awards ?? []));
        setContracts((current) => append ? [...current, ...(payload.contracts ?? [])] : (payload.contracts ?? []));
        setLoadedPage(nextPage);
        setTotalTenders(payload.meta?.total ?? payload.tenders?.length ?? 0);
        setHasMore(Boolean(payload.meta?.hasMore));
        setDataError("");
      })
      .catch((error) => {
        if (requestId === latestRequest.current) setDataError(error instanceof Error ? error.message : "Σφάλμα δεδομένων");
      })
      .finally(() => {
        if (requestId === latestRequest.current) setLoading(false);
      });
  }, [query, authority, contractor, cpv, year, contractType, documentType]);

  const loadDashboard = useCallback(() => {
    const requestId = ++latestDashboardRequest.current;
    const params = new URLSearchParams();
    if (authority.trim() && authority !== "Όλες") params.set("authority", authority.trim());
    contractor.forEach((item) => params.append("contractor", item));
    cpv.forEach((item) => params.append("cpv", item));
    if (year !== "Όλα") params.set("year", year);
    contractType.forEach((item) => params.append("contractType", item));
    fetch(`/api/dashboard?${params.toString()}`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("dashboard request failed")))
      .then((payload) => {
        if (requestId !== latestDashboardRequest.current) return;
        setDashboard(payload);
        setDashboardError("");
      })
      .catch(() => {
        // A very broad, unfiltered-by-year combination can still time out
        // server-side - show nothing, but say so explicitly instead of a
        // silent "0", which reads as "no such tenders exist" and is wrong.
        if (requestId !== latestDashboardRequest.current) return;
        setDashboard(emptyDashboard);
        setDashboardError("Πολύ ευρύ φίλτρο για να υπολογιστεί - πρόσθεσε έτος ή άλλο φίλτρο για να στενέψει.");
      });
  }, [authority, contractor, cpv, year, contractType]);

  useEffect(() => {
    // Αναθέτουσα Αρχή applies on every keystroke (no "pick an option" step
    // like CPV/Ανάδοχος have) - a longer pause here means fewer full
    // reloads fired while someone is still mid-word.
    const timer = window.setTimeout(() => {
      // Ειδοποιήσεις has no filter UI and its own independent data fetch -
      // this pair is wasted there. Checked via a ref, not a `page`
      // dependency, so switching tabs alone can't retrigger this effect.
      if (pageRef.current === "alerts") return;
      loadTenderPage(1);
      loadDashboard();
    }, 500);
    return () => window.clearTimeout(timer);
  }, [loadTenderPage, loadDashboard]);


  // The ΑΔΑΜ/τίτλος search box and Τύπος εγγράφου select are both hidden on
  // Αγορά & Ανταγωνισμός (a specific tender / a notice-lifecycle document
  // type don't fit a per-contractor aggregate view), but `query` and
  // `documentType` are shared state across all tabs and still get sent as
  // `q`/`documentType` to /api/procurement, which DOES apply both
  // server-side to the market awards/contracts query. Left as-is, a value
  // set on Διαγωνισμοί would keep silently narrowing the Αγορά results after
  // switching tabs, with no visible control left to see or clear it. Clear
  // both on entry instead - loadTenderPage's dependency on them then
  // triggers a fresh, unfiltered fetch automatically.
  useEffect(() => {
    if (page !== "market") return;
    if (query) setQuery("");
    if (documentType !== "Όλοι") setDocumentType("Όλοι");
  }, [page, query, documentType]);

  // Αγορά & Ανταγωνισμός computes its stats (Αναθέσεις/Συμβάσεις/Αξία per
  // ανάδοχος) from whatever tenders are already loaded - fine for the
  // ordinary "Διαγωνισμοί" list, which is meant to be browsed 100 at a
  // time, but silently wrong for aggregates unless every matching tender
  // is loaded. Keep paging automatically while on this tab, up to a safety
  // cap so an unfiltered/very broad selection can't try to pull the whole
  // multi-hundred-thousand-row table into the browser.
  useEffect(() => {
    if (page !== "market") return;
    // A failed page fetch leaves hasMore/loadedPage exactly as they were -
    // without this, a persistent error (e.g. a slow query timing out)
    // would make this effect retry the same page forever instead of
    // surfacing the error like the rest of the app already does.
    if (dataError) return;
    // Αναθέτουσα Αρχή has no "pick an option" step, so a short typed prefix
    // (e.g. the first letter or two) matches far more rows than the person
    // is actually asking for - only engage the heavy full-load once it's
    // specific enough that finishing quickly is realistic. The plain 100-
    // row page still loads normally either way, just without the auto-page.
    const authorityTooShort = authority.trim().length > 0 && authority.trim() !== "Όλες" && authority.trim().length < 3;
    if (authorityTooShort) return;
    if (!hasMore || loading) return;
    if (tenders.length >= MARKET_AUTO_LOAD_CAP) return;
    loadTenderPage(loadedPage + 1, true);
  }, [page, hasMore, loading, loadedPage, tenders.length, loadTenderPage, dataError, authority]);

  // contractor/cpv are NOT re-checked here - the server already filtered
  // `tenders` by them (via /api/procurement's contractor/cpv params), and
  // its matching is real resolution through record_contractors_compact /
  // record_cpvs_compact (VAT numbers, brand aliases like PWC ->
  // PricewaterhouseCoopers, CPV description matches, award/contract
  // linkage) - nothing a literal substring check against the tender's own
  // denormalized fields can reproduce. Confirmed live: selecting the PWC
  // alias correctly returned ~22 tenders from the server, but this re-check
  // (literally searching each tender's contractor names for the substring
  // "pwc") kept only the 2 that happened to contain it, discarding the rest.
  const filtered = useMemo(() => tenders.filter((tender) => {
    const needle = query.trim().toLocaleLowerCase("el");
    const matchesQuery = page !== "tenders" || !needle || `${tender.adam} ${tender.title}`.toLocaleLowerCase("el").includes(needle);
    return matchesQuery && (status === "Όλες" || tender.status === status) &&
      (!authority || authority === "Όλες" || tender.authority.toLocaleLowerCase("el").includes(authority.toLocaleLowerCase("el"))) &&
      (year === "Όλα" || tender.publicationDate?.startsWith(year)) &&
      (contractType.length === 0 || contractType.includes(tender.contractType ?? "")) &&
      (documentType === "Όλοι" || tender.documentType === documentType);
  }), [tenders, query, status, authority, year, contractType, documentType, page]);

  const documentTypes = Object.entries(documentTypeLabels);
  const statusCount = (value: Status) => dashboard.status.find((item) => item.status === value)?.count ?? 0;
  const statusBudget = (value: Status) => dashboard.status.find((item) => item.status === value)?.budget ?? 0;
  const totalBudget = dashboard.status.reduce((sum, item) => sum + item.budget, 0);

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brandMark">⌖</span>
          <span><strong>TenderScope</strong><small>Ελληνικό Παρατηρητήριο Δημοσίων Συμβάσεων</small></span>
        </div>
        <nav aria-label="Κύρια πλοήγηση">
          {navItems.map(([id, Icon, label]) => (
            <button key={id} className={page === id ? "active" : ""} onClick={() => setPage(id)}>
              <span>
                <Icon size={16} strokeWidth={2.25} />
                {id === "alerts" && recentAlertCount > 0 && <i className="navBadge">{recentAlertCount > 9 ? "9+" : recentAlertCount}</i>}
              </span>{label}
            </button>
          ))}
        </nav>
      </header>

      {/* One shared login control for the whole app instead of a separate
          copy on Ειδοποιήσεις and Αγορά - always visible so its state can
          never be out of sync with itself. Sits below the tab row, same
          spot regardless of which tab is active. */}
      <div className="teamCodeRow">{team.code !== undefined && <TeamCodeBar team={team} />}</div>

      <div className={`workspace${page === "alerts" || page === "profile" ? " workspaceFull" : ""}`}>
        <section className="content">
          <div className="pageTitle">
            <div><p className="eyebrow">PROCUREMENT INTELLIGENCE</p><h1>{page === "overview" ? "Επισκόπηση" : page === "tenders" ? "Διαγωνισμοί" : page === "market" ? "Αγορά & Ανταγωνισμός" : page === "profile" ? "Προφίλ" : "Παρακολούθηση"}</h1></div>
            {(page === "overview" || page === "tenders") && <label className="search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Αναζήτηση με ΑΔΑΜ ή τίτλο…" /></label>}
          </div>
          {loading && tenders.length === 0 && <div className="dataBanner">Φόρτωση πραγματικών δεδομένων από Supabase…</div>}
          {dataError && <div className="dataBanner error">{dataError} · εμφανίζεται προσωρινό δείγμα.</div>}
          {page === "overview" && dashboardError && <div className="dataBanner error">{dashboardError}</div>}

          {page === "overview" && <>
            <div className="metrics">
              <Metric label="Διαγωνισμοί" value={number.format(dashboard.total)} tone="sky" />
              <Metric label="Ενεργοί" value={number.format(statusCount("Ενεργός"))} tone="mint" />
              <Metric label="Σε αξιολόγηση" value={number.format(statusCount("Αξιολόγηση"))} tone="sand" />
              <Metric label="Ανατεθειμένοι" value={number.format(statusCount("Ανατεθειμένος"))} tone="lilac" />
              <Metric label="Ολοκληρωμένοι" value={number.format(statusCount("Ολοκληρωμένος"))} tone="sage" />
              <Metric label="Ακυρωμένοι" value={number.format(statusCount("Ακυρωμένος"))} tone="rose" />
            </div>
            <div className="metrics metricsBudget">
              <Metric label="Π/Υ:" value={euro.format(totalBudget)} tone="sky" />
              <Metric label="Π/Υ:" value={euro.format(statusBudget("Ενεργός"))} tone="mint" />
              <Metric label="Π/Υ:" value={euro.format(statusBudget("Αξιολόγηση"))} tone="sand" />
              <Metric label="Π/Υ:" value={euro.format(statusBudget("Ανατεθειμένος"))} tone="lilac" />
              <Metric label="Π/Υ:" value={euro.format(statusBudget("Ολοκληρωμένος"))} tone="sage" />
              <Metric label="Π/Υ:" value={euro.format(statusBudget("Ακυρωμένος"))} tone="rose" />
            </div>
            <div className="chartGrid">
              <article className="panel"><PanelHeader title="Διαγωνισμοί ανά στάδιο" caption={`Σύνολο ${number.format(dashboard.total)} διαγωνισμών`} chartRef={statusChartRef} onDownload={{ filename: "diagonismoi-ana-stadio", title: "Διαγωνισμοί ανά στάδιο", headers: ["Κατάσταση", "Πλήθος", "Προϋπολογισμός"], rows: dashboard.status.map((item) => [item.status, item.count, item.budget]), columnTypes: ["text", "number", "currency"] }} /><div ref={statusChartRef}><StatusBars counts={dashboard.status} /></div></article>
              <article className="panel"><PanelHeader title="CPV Distribution" caption="Κορυφαίες κατηγορίες (σύνολο βάσης)" chartRef={cpvChartRef} onDownload={{ filename: "cpv-distribution", title: "CPV Distribution", headers: ["CPV", "Περιγραφή", "Πλήθος"], rows: dashboard.cpv.map((item) => [item.cpv_code, item.cpv_description ?? "", item.count]), columnTypes: ["text", "text", "number"] }} /><div ref={cpvChartRef}><CpvDonut counts={dashboard.cpv} total={dashboard.total} cpvTotal={dashboard.cpvTotal} /></div></article>
            </div>
            <div className="monthlyGrid">
              <article className="panel monthlyTablePanel"><PanelHeader title="Διαγωνισμοί ανά μήνα" caption="Πλήθος, Π/Υ, CPV και αναθέτουσες αρχές ανά μήνα δημοσίευσης" onDownload={{ filename: "diagonismoi-ana-mina", title: "Διαγωνισμοί ανά μήνα", headers: ["Μήνας", "Διαγωνισμοί", "Συνολική αξία", "CPV", "Αναθέτουσες Αρχές"], rows: dashboard.monthly.map((item) => [`${item.month}-01`, item.count, item.budget, item.cpv, item.authorities]), columnTypes: ["month", "number", "currency", "number", "number"] }} /><MonthlyTable months={dashboard.monthly} /></article>
              <div className="monthlyChartsCol">
                <article className="panel"><PanelHeader title="Πλήθος ανά μήνα" caption="Αριθμός διαγωνισμών ανά μήνα δημοσίευσης" chartRef={monthlyCountChartRef} onDownload={{ filename: "plithos-ana-mina", title: "Πλήθος ανά μήνα", headers: ["Μήνας", "Διαγωνισμοί"], rows: dashboard.monthly.map((item) => [`${item.month}-01`, item.count]), columnTypes: ["month", "number"] }} /><div ref={monthlyCountChartRef}><MonthlyBarChart months={dashboard.monthly} metric="count" formatValue={(value) => number.format(value)} unitLabel="διαγωνισμοί" /></div></article>
                <article className="panel"><PanelHeader title="Π/Υ ανά μήνα" caption="Συνολικός προϋπολογισμός ανά μήνα δημοσίευσης" chartRef={monthlyBudgetChartRef} onDownload={{ filename: "proypologismos-ana-mina", title: "Π/Υ ανά μήνα", headers: ["Μήνας", "Προϋπολογισμός"], rows: dashboard.monthly.map((item) => [`${item.month}-01`, item.budget]), columnTypes: ["month", "currency"] }} /><div ref={monthlyBudgetChartRef}><MonthlyBarChart months={dashboard.monthly} metric="budget" formatValue={(value) => euro.format(value)} unitLabel="" /></div></article>
              </div>
            </div>
            <NutsMap counts={dashboard.nuts} />
            <TenderTable rows={[...filtered].sort((a,b) => (b.publicationDate || "").localeCompare(a.publicationDate || "")).slice(0,10)} title="Πρόσφατοι διαγωνισμοί" caption="Οι 10 πιο πρόσφατες εγγραφές" onViewAll={() => setPage("tenders")} />
          </>}

          {page === "tenders" && <>
            <TenderTable rows={filtered} expanded />
            {hasMore && <button className="viewAll" disabled={loading} onClick={() => loadTenderPage(loadedPage + 1, true)}>
              {loading ? "Φόρτωση…" : `Φόρτωση περισσότερων (${number.format(tenders.length)} από ${number.format(totalTenders)})`}
            </button>}
          </>}
          {page === "market" && <MarketPanel awards={awards} contracts={contracts} cpv={cpv} setCpv={setCpv} contractor={contractor} authority={authority} year={year} contractType={contractType} documentType={documentType} loadedCount={tenders.length} totalCount={totalTenders} stillLoading={hasMore && loading} locked={!team.code} selectedContractor={marketSelectedContractor} setSelectedContractor={setMarketSelectedContractor} contractorSearch={marketContractorSearch} setContractorSearch={setMarketContractorSearch} visibleCount={marketVisibleCount} setVisibleCount={setMarketVisibleCount} />}
          {page === "alerts" && <AlertsPanelContent key={team.code ?? "free"} code={team.code ?? null} onUnauthorized={team.onUnauthorized} watchlist={alertsWatchlist} setWatchlist={setAlertsWatchlist} nutsFilter={alertsNutsFilter} setNutsFilter={setAlertsNutsFilter} />}
          {page === "profile" && <div className="profileGrid">
            <article className="panel profileCard">
              <p className="eyebrow">ΛΟΓΑΡΙΑΣΜΟΣ</p>
              <h2>Κατάσταση σύνδεσης</h2>
              {team.code
                ? <p className="profileStatusOn">✓ Συνδεδεμένη ομάδα</p>
                : <p className="watchlistCaption">Δεν είσαι συνδεδεμένη — οι Προβολές και η παρακολούθηση Ειδοποιήσεων χρειάζονται σύνδεση.</p>}
              {lastSync && <p className="profileStat" title={new Date(lastSync).toLocaleString("el-GR")}>Τελευταία ενημέρωση δεδομένων: <strong>{new Intl.DateTimeFormat("el-GR", { dateStyle: "short", timeStyle: "short" }).format(new Date(lastSync))}</strong></p>}
            </article>
            <article className="panel profileCard">
              <p className="eyebrow">ΠΡΟΒΟΛΕΣ</p>
              <h2>Αποθηκευμένες προβολές</h2>
              {team.code ? <>
                {savedViewsError && <p className="recipientError">{savedViewsError}</p>}
                {savedViews.length > 0 ? <ul className="savedViewsList">
                  {savedViews.map((view) => (
                    <li key={view.id}>
                      <button type="button" className="savedViewApply" onClick={() => { applyView(view); setPage("overview"); }}>{view.name}</button>
                      <button type="button" className="savedViewDelete" onClick={() => deleteView(view.id)} aria-label={`Διαγραφή ${view.name}`}>×</button>
                    </li>
                  ))}
                </ul> : <p className="noRows">Δεν έχεις αποθηκεύσει καμία προβολή ακόμη.</p>}
              </> : <p className="watchlistCaption">Συνδέσου για να δεις τις αποθηκευμένες προβολές σου.</p>}
            </article>
            <article className="panel profileCard">
              <p className="eyebrow">ΠΑΡΑΚΟΛΟΥΘΗΣΗ</p>
              <h2>Τι παρακολουθείς</h2>
              {team.code ? <>
                <p className="profileStat"><strong>{alertsWatchlist.length}</strong> CPV υπό παρακολούθηση</p>
                <p className="profileStat"><strong>{alertsNutsFilter.length}</strong> περιοχές υπό παρακολούθηση</p>
                <p className="profileStat"><strong>{submittedCount}</strong> υποβεβλημένες προσφορές</p>
                <p className="profileStat"><strong>{interestedCount}</strong> διαγωνισμοί με ενδιαφέρον</p>
                <button type="button" className="profileLink" onClick={() => setPage("alerts")}>Πήγαινε στην Παρακολούθηση →</button>
              </> : <p className="watchlistCaption">Συνδέσου για να δεις τι παρακολουθείς.</p>}
            </article>
            <article className="panel profileCard">
              <p className="eyebrow">EMAIL</p>
              <h2>Παραλήπτες ειδοποιήσεων</h2>
              {team.code ? (profileRecipients.length > 0 ? <ul className="savedViewsList">
                {profileRecipients.map((item) => <li key={item.email}><span className="profileStat">{item.email}</span></li>)}
              </ul> : <p className="noRows">Δεν έχει προστεθεί κανένα email ακόμη.</p>) : <p className="watchlistCaption">Συνδέσου για να δεις τους παραλήπτες.</p>}
              {team.code && <button type="button" className="profileLink" onClick={() => setPage("alerts")}>Διαχείριση παραληπτών →</button>}
            </article>
          </div>}
        </section>

        {/* Ειδοποιήσεις is a CPV watch-list/alert feed, not a filtered view of the
            database - the regular filters don't apply to it at all. */}
        {page !== "alerts" && page !== "profile" && <aside className="filters">
          <div className="filterHeading"><div><span>Φίλτρα</span><small>{number.format(tenders.length)} φορτωμένα · {number.format(dashboard.total || totalTenders)} συνολικά</small></div><button title={loading ? "Φόρτωση…" : "Επαναφορά φίλτρων"} onClick={() => { setStatus("Όλες"); setAuthority(""); setContractor([]); setCpv([]); setQuery(""); setYear("Όλα"); setContractType([]); setDocumentType("Όλοι"); }}><span className={loading ? "spinIcon" : ""}>↻</span></button></div>
          <div className="savedViews">
            <p className="eyebrow">ΠΡΟΒΟΛΕΣ</p>
            {team.code ? <>
              <div className="recipientInput">
                <input value={newViewName} onChange={(event) => setNewViewName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") saveCurrentView(); }} placeholder="Όνομα προβολής" />
                <button type="button" onClick={saveCurrentView} disabled={!newViewName.trim()}>Αποθήκευση</button>
              </div>
              {savedViewsError && <p className="recipientError">{savedViewsError}</p>}
              {savedViews.length > 0 && <ul className="savedViewsList">
                {savedViews.map((view) => (
                  <li key={view.id}>
                    <button type="button" className="savedViewApply" onClick={() => applyView(view)}>{view.name}</button>
                    <button type="button" className="savedViewDelete" onClick={() => deleteView(view.id)} aria-label={`Διαγραφή ${view.name}`}>×</button>
                  </li>
                ))}
              </ul>}
            </> : <p className="watchlistCaption">Αποθήκευσε συνδυασμούς φίλτρων που χρησιμοποιείς συχνά — συνδέσου ή εγγράψου.</p>}
          </div>
          <label>Έτος<select value={year} onChange={(event) => setYear(event.target.value)}><option>Όλα</option>{years.map((item) => <option key={item}>{item}</option>)}</select></label>
          <SingleSearchInput label="Αναθέτουσα Αρχή" type="authority" value={authority === "Όλες" ? "" : authority} onChange={setAuthority} placeholder="Γράψε ή επίλεξε αρχή" />
          <MultiSearchInput label="Ανάδοχος" type="contractor" values={contractor} onChange={setContractor} placeholder="Αναζήτησε και επίλεξε αναδόχους" />
          {page !== "market" && <MultiSearchInput label="CPV" type="cpv" values={cpv} onChange={setCpv} placeholder="Αναζήτησε κωδικό ή περιγραφή CPV" />}
          <CheckboxDropdown label="Τύπος σύμβασης" options={contractTypeOptions} values={contractType} onChange={setContractType} />
          {/* A tender's document-type/status describe the notice's own lifecycle - awards and
              contracts always attach to the original declaration, never to a follow-up document
              or a not-yet-awarded status, so these two never apply anything meaningful here. */}
          {page !== "market" && <label>Τύπος εγγράφου<select value={documentType} onChange={(event) => setDocumentType(event.target.value)}><option value="Όλοι">Όλοι</option>{documentTypes.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
          {page !== "market" && <label>Κατάσταση<select value={status} onChange={(event) => setStatus(event.target.value)}><option>Όλες</option>{Object.keys(statusTone).map((item) => <option key={item}>{item}</option>)}</select></label>}
          <div className="filterNote"><span>i</span><p>{page === "market"
            ? "Το CPV επιλέγεται μέσα στον πίνακα της Αγοράς. Τύπος εγγράφου και Κατάσταση δεν εφαρμόζονται εδώ - αφορούν το στάδιο της ίδιας της διακήρυξης, όχι τις αναθέσεις/συμβάσεις."
            : "Τα ίδια φίλτρα εφαρμόζονται στην Επισκόπηση και στους Διαγωνισμούς."}</p></div>
        </aside>}
      </div>
    </main>
  );
}

function Metric({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: string }) {
  return <article className={`metric ${tone}`}><span>{label}</span><strong>{value}</strong>{sub && <small>{sub}</small>}</article>;
}

function PanelHeader({ title, caption, onDownload, chartRef }: { title: string; caption: string; onDownload?: ExportPayload; chartRef?: RefObject<HTMLElement | null> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"excel" | "pdf" | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onOutside = (event: MouseEvent) => { if (!menuRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  const run = async (format: "excel" | "pdf") => {
    if (!onDownload || busy) return;
    setBusy(format);
    try {
      const chartImage = await captureChartImage(chartRef?.current ?? null);
      if (format === "excel") await downloadExcel(onDownload, chartImage);
      else await downloadPdf(onDownload, chartImage);
      setOpen(false);
    } catch {
      // Swallow - a failed export shouldn't crash the panel, and the browser
      // will simply not show a download if the request never completes.
    } finally {
      setBusy(null);
    }
  };

  return <header className="panelHeader">
    <div><h2>{title}</h2><p>{caption}</p></div>
    <div className="downloadMenu" ref={menuRef}>
      <button type="button" title="Λήψη" disabled={!onDownload} onClick={() => setOpen((value) => !value)}>•••</button>
      {open && <div className="downloadMenuList">
        <button type="button" onClick={() => run("excel")} disabled={busy !== null}>{busy === "excel" ? "Δημιουργία…" : "Λήψη Excel"}</button>
        <button type="button" onClick={() => run("pdf")} disabled={busy !== null}>{busy === "pdf" ? "Δημιουργία…" : "Λήψη PDF"}</button>
      </div>}
    </div>
  </header>;
}

function StatusBars({ counts }: { counts: { status: string; count: number }[] }) {
  const statuses: Status[] = ["Ενεργός", "Αξιολόγηση", "Ανατεθειμένος", "Ολοκληρωμένος", "Ακυρωμένος"];
  const byStatus = new Map(counts.map((item) => [item.status, item.count]));
  const maximum = Math.max(1, ...statuses.map((item) => byStatus.get(item) ?? 0));
  // Ανατεθειμένος/Αξιολόγηση dwarf Ολοκληρωμένος/Ακυρωμένος by two orders of
  // magnitude, so a plain linear width made the smaller categories an
  // invisible sliver even though their real count is non-zero - give every
  // non-zero bar a floor so it stays visible, the count text is the exact figure.
  return <div className="bars">{statuses.map((item) => { const count = byStatus.get(item) ?? 0; const width = count === 0 ? 0 : Math.max((count / maximum) * 100, 3); return <div className="barRow" key={item}><span>{item}</span><div><i className={statusTone[item]} style={{ width: `${width}%` }} /></div><strong>{number.format(count)}</strong></div>; })}</div>;
}

function CpvDonut({ counts, total, cpvTotal }: { counts: { cpv_code: string; cpv_description: string | null; count: number }[]; total: number; cpvTotal: number }) {
  const top = counts.slice(0, 3);
  const topSum = top.reduce((sum, item) => sum + item.count, 0);
  const denominator = Math.max(total, 1);
  // "Λοιπά" is every CPV code outside the top 3, not just ranks 4-12 of the
  // (already top-12-only) breakdown array - otherwise the slice understated
  // how fragmented the real distribution is across thousands of codes.
  const otherShare = Math.max(0, denominator - topSum) / denominator;
  const colors = ["#0d4565", "#168c8c", "#dca54a"];
  // SVG stroke-dasharray rings instead of a CSS conic-gradient background -
  // html2canvas (used to rasterize this chart into the Excel/PDF export)
  // doesn't render conic-gradient correctly, leaving the exported version
  // blank. Plain SVG circles capture correctly on both paths.
  const size = 148;
  const strokeWidth = 33;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const segments = [
    ...top.map((item, index) => ({ pct: (item.count / denominator) * 100, color: colors[index] })),
    { pct: otherShare * 100, color: "#d6e2e7" },
  ].filter((segment) => segment.pct > 0);
  let cursor = 0;
  return <div className="donutWrap"><div className="donut">
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        {segments.map((segment, index) => {
          const dash = (segment.pct / 100) * circumference;
          const offset = -((cursor / 100) * circumference);
          cursor += segment.pct;
          return <circle key={index} cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={segment.color} strokeWidth={strokeWidth} strokeDasharray={`${dash} ${circumference - dash}`} strokeDashoffset={offset} />;
        })}
      </g>
    </svg>
    <span><strong>{number.format(cpvTotal)}</strong><small>CPV</small></span>
  </div><ul>{top.map((item, index) => <li key={item.cpv_code} title={item.cpv_description ?? undefined}><i className={["navy", "teal", "gold"][index]} /><span><b>{item.cpv_code}</b><small>{item.cpv_description || "Χωρίς περιγραφή"}</small></span><b>{Math.round(item.count / denominator * 100)}%</b></li>)}{otherShare > 0 && <li><i className="pale" />Λοιπά ({number.format(Math.max(0, cpvTotal - top.length))} κωδικοί) <b>{Math.round(otherShare * 100)}%</b></li>}</ul></div>;
}

const MONTH_NAMES = ["Ιαν","Φεβ","Μαρ","Απρ","Μαϊ","Ιουν","Ιουλ","Αυγ","Σεπ","Οκτ","Νοε","Δεκ"];

function monthLabel(ym: string) {
  const [year, month] = ym.split("-");
  return `${MONTH_NAMES[Number(month) - 1] ?? month} '${year.slice(2)}`;
}

// A horizontal axis label needs to stay short enough for ~20 narrow columns
// to sit side by side without overlapping - just the month name, with the
// year spelled out only at each January where the year actually changes.
function shortMonthLabel(ym: string) {
  const [year, month] = ym.split("-");
  const name = MONTH_NAMES[Number(month) - 1] ?? month;
  return month === "01" ? `${name} '${year.slice(2)}` : name;
}

function MonthlyTable({ months }: { months: { month: string; count: number; budget: number; authorities: number; cpv: number }[] }) {
  if (!months.length) return <p className="noRows">Δεν υπάρχουν δεδομένα για τα τρέχοντα φίλτρα.</p>;
  // Count/budget add up correctly across months; distinct CPV/authority
  // counts don't (the same CPV or authority can appear in several months),
  // so a naive sum would overstate the real total - leave those blank in
  // the totals row rather than show a misleading number.
  const totals = months.reduce((sum, item) => ({ count: sum.count + item.count, budget: sum.budget + item.budget }), { count: 0, budget: 0 });
  return <div className="tableScroll monthlyTable"><table>
    <thead><tr><th>Μήνας</th><th>Διαγωνισμοί</th><th>Συνολική αξία</th><th>CPV</th><th>Αναθέτουσες Αρχές</th></tr></thead>
    <tbody>
      {months.map((item) => <tr key={item.month}><td>{monthLabel(item.month)}</td><td>{number.format(item.count)}</td><td>{euro.format(item.budget)}</td><td>{number.format(item.cpv)}</td><td>{number.format(item.authorities)}</td></tr>)}
      <tr className="tableTotal"><td>Σύνολο</td><td>{number.format(totals.count)}</td><td>{euro.format(totals.budget)}</td><td>—</td><td>—</td></tr>
    </tbody>
  </table></div>;
}

function MonthlyBarChart({ months, metric, formatValue, unitLabel }: {
  months: { month: string; count: number; budget: number }[];
  metric: "count" | "budget";
  formatValue: (value: number) => string;
  unitLabel: string;
}) {
  if (!months.length) return <p className="noRows">Δεν υπάρχουν δεδομένα για τα τρέχοντα φίλτρα.</p>;
  const maximum = Math.max(1, ...months.map((item) => item[metric]));
  return <div className="monthlyBars">
    {months.map((item) => <div className="monthlyBarCol" key={item.month}>
      <div className="monthlyBarTrack">
        <div className="monthlyBar" style={{ height: `${Math.max((item[metric] / maximum) * 100, 2)}%` }} title={`${monthLabel(item.month)}: ${formatValue(item[metric])} ${unitLabel}`} />
      </div>
      <span className="monthlyBarLabel">{shortMonthLabel(item.month)}</span>
    </div>)}
  </div>;
}

function TenderTable({ rows, expanded = false, title = "Λίστα διαγωνισμών", caption, onViewAll }: { rows: Tender[]; expanded?: boolean; title?: string; caption?: string; onViewAll?: () => void }) {
  const [selected, setSelected] = useState<Tender | null>(null);
  if (selected) return <TenderDetail tender={selected} onBack={() => setSelected(null)} />;
  return <article className={`panel tablePanel ${expanded ? "expanded" : ""}`}><PanelHeader title={title} caption={caption ?? `${number.format(rows.length)} εγγραφές μετά τα φίλτρα`} onDownload={{ filename: title, title, headers: ["ΑΔΑΜ", "Τίτλος", "Αναθέτουσα Αρχή", "CPV", "Περιγραφή CPV", "Τύπος σύμβασης", "Τύπος εγγράφου", "Κατάσταση", "Δημοσίευση"], rows: rows.map((item) => [item.adam, item.title, item.authority, item.cpv, item.cpvDescription ?? "", item.contractType ?? "", documentTypeLabels[item.documentType ?? ""] ?? item.documentType ?? "", item.status, item.publicationDate ?? ""]), columnTypes: ["text", "text", "text", "text", "text", "text", "text", "text", "date"] }} /><div className="tableScroll"><table><thead><tr><th>ΑΔΑΜ</th><th>Τίτλος</th><th>Αναθέτουσα Αρχή</th><th>CPV / Τίτλος</th><th>Τύπος σύμβασης</th><th>Τύπος εγγράφου</th><th>Κατάσταση</th><th>Δημοσίευση</th><th /></tr></thead><tbody>{rows.map((item) => <tr key={item.adam}><td className="adam">{item.adam}</td><td>{item.title}</td><td>{item.authority}</td><td><strong>{item.cpv}</strong><small className="cellSub">{item.cpvDescription}</small></td><td className="cellPlain">{item.contractType ?? "—"}</td><td className="cellPlain">{item.documentType ? (documentTypeLabels[item.documentType] ?? item.documentType) : "—"}</td><td><span className={`status ${statusTone[item.status]}`}>{item.status}</span></td><td>{formatDate(item.publicationDate)}</td><td><button className="view" aria-label={`Προβολή ${item.adam}`} onClick={() => setSelected(item)}>→</button></td></tr>)}</tbody></table></div>{!rows.length && <p className="noRows">Δεν βρέθηκαν διαγωνισμοί για τα επιλεγμένα φίλτρα.</p>}{onViewAll && <button className="viewAll" onClick={onViewAll}>Προβολή όλων των διαγωνισμών →</button>}</article>;
}

function TenderDetail({ tender, onBack }: { tender: Tender; onBack: () => void }) {
  const milestones = [
    ["Δημοσίευση", tender.publicationDate], ["Καταληκτική υποβολής", tender.openingDate], ["Ανάθεση", tender.awardDate],
    ["Σύμβαση", tender.contractDates?.[0]], ["Παράδοση", tender.deliveryDates?.[0]],
  ].filter((item): item is [string, string] => Boolean(item[1]));
  const dates = milestones.map((item) => new Date(item[1]).getTime()).filter(Number.isFinite);
  const start = Math.min(...dates); const end = Math.max(...dates); const span = Math.max(end - start, 86400000);
  return <article className="panel tenderDetail"><button className="back" onClick={onBack}>← Πίσω στη λίστα</button><p className="eyebrow">ΚΑΡΤΕΛΑ ΔΙΑΓΩΝΙΣΜΟΥ</p><h2>{tender.title}</h2><p className="detailMeta">{tender.adam} · {tender.authority} · {tender.cpv} {tender.cpvDescription}</p><div className="detailMetrics"><Metric label="Προϋπολογισμός" value={euro.format(tender.budget)} tone="sky" /><Metric label="Αξία ανάθεσης" value={euro.format(tender.awardValue ?? 0)} tone="sand" /><Metric label="Αξία σύμβασης" value={euro.format(tender.contractValue ?? 0)} tone="mint" /></div><section className="gantt"><h3>Χρονοδιάγραμμα διαγωνισμού</h3>{milestones.map(([label,date], index) => <div className="ganttRow" key={`${label}-${date}`}><span>{label}</span><div><i style={{left:`${((new Date(date).getTime()-start)/span)*88}%`,width:index === milestones.length-1 ? "12%" : `${Math.max(8,((new Date(milestones[Math.min(index+1,milestones.length-1)][1]).getTime()-new Date(date).getTime())/span)*88)}%`}} /></div><time>{formatDate(date)}</time></div>)}</section><div className="detailFacts"><p><b>Ανάδοχος:</b> {tender.contractors?.join(", ") || "Δεν έχει καταχωριστεί"}</p><p><b>Τύπος διαδικασίας:</b> {tender.procedureType || "—"}</p><p><b>NUTS:</b> {[tender.nutsCode,tender.nutsName].filter(Boolean).join(" · ") || "—"}</p></div></article>;
}

function NutsMap({ counts }: { counts: { nuts_code: string; nuts_name: string; count: number }[] }) {
  const mapElRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);

  // "EL" is the generic whole-country code a notice falls back to when
  // nothing more specific was recorded - it has no real single location, so
  // it's not useful in a per-region list and is dropped entirely rather than
  // shown as a meaningless top entry.
  const regions = [...counts].filter((item) => item.nuts_code !== "EL").sort((a, b) => b.count - a.count);
  const total = regions.reduce((sum, item) => sum + item.count, 0);
  const max = Math.max(1, ...regions.map((item) => item.count));
  const pins = regions
    .map((item) => ({ item, position: nutsLatLon(item.nuts_code) }))
    .filter((row): row is { item: typeof regions[number]; position: [number, number] } => row.position !== null)
    .slice(0, 15);
  const pinsKey = pins.map((row) => `${row.item.nuts_code}:${row.item.count}`).join("|");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { default: L } = await import("leaflet");
      if (cancelled || !mapElRef.current) return;
      if (!mapRef.current) {
        mapRef.current = L.map(mapElRef.current, { scrollWheelZoom: false }).setView([38.8, 23.5], 6);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 18,
        }).addTo(mapRef.current);
        layerRef.current = L.layerGroup().addTo(mapRef.current);
        // The container's real size isn't known until the surrounding grid
        // has laid out - without this the tiles render into a 0-height box.
        window.requestAnimationFrame(() => mapRef.current?.invalidateSize());
      }
      const layer = layerRef.current;
      if (!layer) return;
      layer.clearLayers();
      for (const { item, position } of pins) {
        const size = Math.round(26 + (item.count / max) * 24);
        // A 4-6 digit count ("36.250") doesn't fit legibly inside a 24-46px
        // circle - the exact figure is still available in the tooltip below.
        const label = item.count >= 1000 ? `${Math.round(item.count / 1000)}χ` : number.format(item.count);
        const icon = L.divIcon({
          html: `<span class="mapPinBadge">${label}</span>`,
          className: "mapPinWrap",
          iconSize: [size, size],
        });
        L.marker(position, { icon }).bindTooltip(`${item.nuts_name}: ${number.format(item.count)} διαγωνισμοί`).addTo(layer);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinsKey]);

  useEffect(() => () => { mapRef.current?.remove(); mapRef.current = null; }, []);

  return <article className="panel nutsPanel"><PanelHeader title="Διαγωνισμοί ανά NUTS" caption={`${number.format(total)} διαγωνισμοί με τα τρέχοντα φίλτρα`} onDownload={{ filename: "diagonismoi-ana-nuts", title: "Διαγωνισμοί ανά NUTS", headers: ["NUTS", "Περιοχή", "Πλήθος"], rows: regions.map((item) => [item.nuts_code, item.nuts_name, item.count]), columnTypes: ["text", "text", "number"] }} /><div className="nutsMap"><div className="realMap" ref={mapElRef} /><div className="nutsLegend">{regions.slice(0,10).map((item) => <div key={item.nuts_code}><span title={item.nuts_name}>{item.nuts_name}</span><i><b style={{width:`${(item.count/max)*100}%`}} /></i><strong>{number.format(item.count)}</strong></div>)}</div></div></article>;
}

// Approximate centroid [lat, lon] per Greek NUTS unit (official 2021
// classification, down to NUTS3 where the source data provides it, with
// NUTS2/NUTS1-level fallbacks since KHMDHS notices don't always carry full
// NUTS3 precision).
const NUTS_COORDS: Record<string, [number, number]> = {
  EL3: [38.0, 23.7], EL30: [38.0, 23.7],
  EL301: [38.05, 23.80], EL302: [38.02, 23.68], EL303: [37.98, 23.73], EL304: [37.93, 23.70],
  EL305: [38.05, 23.95], EL306: [38.05, 23.55], EL307: [37.94, 23.65],
  EL4: [37.0, 25.5],
  EL41: [39.0, 26.0], EL411: [39.10, 26.55], EL412: [37.75, 26.85], EL413: [38.37, 26.13],
  EL42: [37.0, 26.5], EL421: [36.40, 27.15], EL422: [37.05, 25.30],
  EL43: [35.3, 24.8], EL431: [35.34, 25.13], EL432: [35.19, 25.72], EL433: [35.37, 24.47], EL434: [35.51, 24.02],
  EL5: [40.7, 22.9],
  EL51: [41.1, 25.0], EL511: [41.13, 26.35], EL512: [41.13, 24.89], EL513: [41.12, 25.40], EL514: [41.15, 24.15], EL515: [40.94, 24.40],
  EL52: [40.6, 22.9], EL521: [40.52, 22.20], EL522: [40.64, 22.94], EL523: [40.99, 22.87], EL524: [40.76, 22.05], EL525: [40.28, 22.50], EL526: [41.09, 23.55], EL527: [40.35, 23.40],
  EL53: [40.3, 21.5], EL531: [40.09, 21.43], EL532: [40.52, 21.27], EL533: [40.30, 21.79], EL534: [40.78, 21.40],
  EL54: [39.6, 20.8], EL541: [39.16, 20.99], EL542: [39.55, 20.30], EL543: [39.66, 20.85], EL544: [38.96, 20.75],
  EL6: [38.7, 22.5],
  EL61: [39.5, 22.4], EL611: [39.40, 21.85], EL612: [39.64, 22.42], EL613: [39.36, 22.95], EL614: [39.90, 22.40],
  EL62: [38.3, 20.6], EL621: [37.79, 20.90], EL622: [39.62, 19.92], EL623: [38.18, 20.57], EL624: [38.71, 20.65],
  EL63: [38.2, 21.5], EL631: [38.63, 21.42], EL632: [38.25, 21.73], EL633: [37.68, 21.42],
  EL64: [38.6, 23.0], EL641: [38.37, 23.30], EL642: [38.46, 23.60], EL643: [38.90, 21.62], EL644: [38.90, 22.43], EL645: [38.48, 22.10],
  EL65: [37.5, 22.4], EL651: [37.50, 22.60], EL652: [37.94, 22.93], EL653: [37.00, 22.20], EL654: [37.30, 22.10],
};

function nutsLatLon(code: string): [number, number] | null {
  // Prefer the most specific match, then fall back one NUTS level at a time
  // (EL421 -> EL42 -> EL4) until something in the table matches.
  let key = code;
  while (key.length >= 3) {
    const coords = NUTS_COORDS[key];
    if (coords) return coords;
    key = key.slice(0, -1);
  }
  return null;
}

function CheckboxDropdown({ label, options, values, onChange }: {
  label: string;
  options: string[];
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onOutside = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  const summary = values.length === 0 ? "Όλοι" : values.length === 1 ? values[0] : `${values.length} επιλεγμένα`;

  return <div className="checkboxDropdown" ref={rootRef}>
    <span className="checkboxGroupLabel">{label}</span>
    <button type="button" className="checkboxDropdownTrigger" onClick={() => setOpen((current) => !current)}>
      <span>{summary}</span><span className={`chevron ${open ? "open" : ""}`}>▾</span>
    </button>
    {open && <div className="checkboxDropdownPanel">
      {options.map((item) => (
        <label key={item} className="checkboxRow">
          <input
            type="checkbox"
            checked={values.includes(item)}
            onChange={(event) => onChange(event.target.checked ? [...values, item] : values.filter((value) => value !== item))}
          />
          {item}
        </label>
      ))}
    </div>}
  </div>;
}

type SearchOption = { value: string; label: string };

function MultiSearchInput({ label, type, values, onChange, placeholder, onSelectOption, initialLabels }: {
  label: string;
  type: "contractor" | "cpv" | "authority" | "nuts";
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  onSelectOption?: (option: SearchOption) => void;
  // Values loaded from the database (not picked in this session, e.g. a
  // watchlist restored on page load) have no entry in labelByValue below,
  // since that only ever gets populated by select() - without this, those
  // chips fall back to showing the raw code instead of its description.
  initialLabels?: Record<string, string>;
}) {
  const [text, setText] = useState("");
  const [options, setOptions] = useState<SearchOption[]>([]);
  const [searching, setSearching] = useState(false);
  // Contractor values are sometimes a VAT number (to match precisely), not a
  // readable name, so chips need their own label separate from the filter value.
  const [labelByValue, setLabelByValue] = useState<Record<string, string>>(initialLabels ?? {});

  useEffect(() => {
    if (initialLabels) setLabelByValue((current) => ({ ...initialLabels, ...current }));
  }, [initialLabels]);

  useEffect(() => {
    const query = text.trim();
    if (query.length < 2) { setOptions([]); setSearching(false); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearching(true);
      fetch(`/api/options?type=${type}&q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((response) => response.ok ? response.json() : { options: [] })
        .then((payload) => {
          const normalized = (payload.options ?? []).map((item: string | SearchOption) =>
            typeof item === "string" ? { value: item, label: item } : item,
          );
          setOptions(normalized.filter((item: SearchOption) => !values.includes(item.value)));
        })
        .catch(() => setOptions([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [text, type, values]);

  const select = (option: SearchOption) => {
    if (!values.includes(option.value)) onChange([...values, option.value]);
    setLabelByValue((current) => ({ ...current, [option.value]: option.label }));
    onSelectOption?.(option);
    setText("");
    setOptions([]);
  };

  return <div className="multiSearch"><span className="multiSearchLabel">{label}{values.length > 0 && <span className="multiSearchCount">{values.length} επιλεγμέν{values.length === 1 ? "ος" : "οι"}</span>}</span>
    <div className="multiBox">
      {values.map((value) => {
        const fullLabel = labelByValue[value] ?? value;
        // CPV labels are "code — description" - keep the code prominent and
        // the description small/muted instead of both at equal visual weight.
        const separatorIndex = fullLabel.indexOf(" — ");
        const code = separatorIndex === -1 ? fullLabel : fullLabel.slice(0, separatorIndex);
        const description = separatorIndex === -1 ? "" : fullLabel.slice(separatorIndex + 3);
        return <span className="filterChip" key={value}>
          {description
            ? <><b className="chipCode">{code}</b><span className="chipDesc" title={description}>{description}</span></>
            : <span className="chipLabel" title={fullLabel}>{fullLabel}</span>}
          <button type="button" aria-label={`Αφαίρεση ${fullLabel}`} onClick={() => onChange(values.filter((item) => item !== value))}>×</button>
        </span>;
      })}
      <span className="multiAddInput">
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={values.length ? "Πρόσθεσε ακόμη μία επιλογή" : placeholder}
          autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
        />
      </span>
    </div>
    {(searching || options.length > 0) && <div className="suggestions">
      {searching && <span>Αναζήτηση…</span>}
      {!searching && options.map((option) => <button type="button" key={option.value} onMouseDown={(event) => { event.preventDefault(); select(option); }}>{option.label}</button>)}
    </div>}
  </div>;
}

// Single-value counterpart to MultiSearchInput - Αναθέτουσα Αρχή is one
// plain string (not a chip array like CPV/Ανάδοχος), but deserves the same
// clickable, keyboard-free suggestion list instead of the browser's native
// <datalist> popup, whose look/behavior varies by browser and can't be
// styled to match the rest of the sidebar. Typing still applies live on
// every keystroke, same as before - the dropdown is purely a convenience.
function SingleSearchInput({ label, type, value, onChange, placeholder }: {
  label: string;
  type: "authority";
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const [options, setOptions] = useState<SearchOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onOutside = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  useEffect(() => {
    const query = value.trim();
    if (query.length < 2) { setOptions([]); setSearching(false); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearching(true);
      fetch(`/api/options?type=${type}&q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((response) => response.ok ? response.json() : { options: [] })
        .then((payload) => setOptions(payload.options ?? []))
        .catch(() => setOptions([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [value, type]);

  const select = (option: SearchOption) => {
    onChange(option.value);
    setOptions([]);
    setOpen(false);
  };

  return <div className="multiSearch singleSearch" ref={rootRef}>
    <span className="multiSearchLabel">{label}</span>
    <div className="multiBox">
      <span className="multiAddInput">
        <input
          value={value}
          onChange={(event) => { onChange(event.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
        />
      </span>
    </div>
    {open && (searching || options.length > 0) && <div className="suggestions">
      {searching && <span>Αναζήτηση…</span>}
      {!searching && options.map((option) => <button type="button" key={option.value} onMouseDown={(event) => { event.preventDefault(); select(option); }}>{option.label}</button>)}
    </div>}
  </div>;
}


type ContractorSummary = { key: string; name: string; awards: number; contracts: number; authorities: number; value: number };

const CONTRACTOR_ALIASES: Record<string, string> = { PWC: "PRICEWATERHOUSECOOPERS", EY: "ERNST" };

function MarketPanel({ awards, contracts, cpv, setCpv, contractor, authority, year, contractType, documentType, loadedCount, totalCount, stillLoading, locked, selectedContractor, setSelectedContractor, contractorSearch, setContractorSearch, visibleCount, setVisibleCount }: {
  awards: Award[]; contracts: Contract[]; cpv: string[]; setCpv: (value: string[]) => void; contractor: string[]; authority: string;
  year: string; contractType: string[]; documentType: string; loadedCount: number; totalCount: number; stillLoading: boolean; locked: boolean;
  selectedContractor: string; setSelectedContractor: (value: string) => void;
  contractorSearch: string; setContractorSearch: (value: string) => void;
  visibleCount: number; setVisibleCount: (value: number | ((current: number) => number)) => void;
}) {
  useEffect(() => { setVisibleCount(10); }, [contractor, cpv, authority, year, contractType, documentType, contractorSearch, setVisibleCount]);
  // This grouping (dedupe-by-VAT, Union-Find merge, per-contractor totals)
  // is the expensive part of this panel - re-running it on every render was
  // fine while awards/contracts stayed small, but once the Αγορά page
  // started auto-loading hundreds/thousands of rows (see the auto-load
  // effect in Home) it re-ran in full on every intermediate page too,
  // which is what made the page feel like it froze while loading a broad
  // filter. Only cpv/contractor actually change what this computes -
  // authority/year/etc. only affect which awards/contracts arrive from the
  // server in the first place.
  const { relevantAwards, relevantContracts, contractorRowsBase, resolvedKeyFor } = useMemo(() => {
    const cpvTerms = cpv.map((item) => item.toLocaleLowerCase("el"));
    const matchesCpv = (item: { cpv: string; cpvDescription?: string }) =>
      !cpvTerms.length || cpvTerms.some((term) => `${item.cpv} ${item.cpvDescription}`.toLocaleLowerCase("el").includes(term));
    // A framework agreement's award/contract record can list several co-suppliers
    // together, so matching by CPV alone would also pull in unrelated companies
    // that merely share the same framework as the searched contractor. A filter
    // value is either a VAT number (exact identity) or a free-text/brand name.
    const contractorFilters = contractor.map((item) => {
      const trimmed = item.trim();
      if (/^\d{9}$/.test(trimmed)) return { vat: trimmed } as const;
      const upper = trimmed.toLocaleUpperCase("en-US");
      return { name: (CONTRACTOR_ALIASES[upper] ?? trimmed).toLocaleLowerCase("el") } as const;
    });
    const matchesContractor = (item: { contractor: string; contractorVat?: string }) =>
      !contractorFilters.length || contractorFilters.some((filter) =>
        "vat" in filter ? item.contractorVat === filter.vat : item.contractor.toLocaleLowerCase("el").includes(filter.name),
      );
    const relevantAwards = awards.filter((item) => matchesCpv(item) && matchesContractor(item));
    const relevantContracts = contracts.filter((item) => matchesCpv(item) && matchesContractor(item));

    // The same legal entity is often typed differently across notices ("Α.Ε." vs
    // "AE" vs an alternate registered name in quotes) - the VAT number is the one
    // stable identifier, so group by that and fall back to the raw name only when
    // a record has no VAT on file.
    // "Αναθέσεις" counts award records directly (not deduped by original
    // tender) - a contractor profile is about what this company was actually
    // given, so a 12-lot tender showing 12 awards is correct, not inflated.
    // valueByTender stays deduped by tender key though: an award and its
    // eventual signed contract for the very same lot both carry a value, and
    // summing both would double-count that lot's money.
    type ContractorGroup = { key: string; names: Map<string, number>; awardCount: number; contracts: Set<string>; authorities: Set<string>; valueByTender: Map<string, number> };
    const byContractor = new Map<string, ContractorGroup>();
    const groupKeyFor = (item: { contractor: string; contractorVat?: string }) => item.contractorVat?.trim() || item.contractor;
    const ensure = (item: { contractor: string; contractorVat?: string }) => {
      const key = groupKeyFor(item);
      let row = byContractor.get(key);
      if (!row) { row = { key, names: new Map(), awardCount: 0, contracts: new Set(), authorities: new Set(), valueByTender: new Map() }; byContractor.set(key, row); }
      row.names.set(item.contractor, (row.names.get(item.contractor) ?? 0) + 1);
      return row;
    };
    for (const item of relevantAwards) {
      if (!item.contractor || item.contractor === "Χωρίς ανάδοχο") continue;
      const row = ensure(item);
      const tenderKey = item.noticeAdam ?? item.adam;
      row.awardCount += 1;
      row.authorities.add(item.authority);
      // A contract for the same tender (added below) overrides this placeholder.
      if (!row.valueByTender.has(tenderKey)) row.valueByTender.set(tenderKey, item.value);
    }
    for (const item of relevantContracts) {
      if (!item.contractor || item.contractor === "Χωρίς ανάδοχο") continue;
      const row = ensure(item);
      const tenderKey = item.noticeAdam ?? item.adam;
      row.contracts.add(item.adam);
      row.authorities.add(item.authority);
      row.valueByTender.set(tenderKey, item.value);
    }

    // Some notices record the exact same contractor name under a different
    // (mistyped) VAT. When a literal name string is shared by more than one VAT
    // group, they almost certainly refer to the same real company - fold them
    // together instead of keeping the stray VAT typo as its own row.
    const parent = new Map<string, string>();
    const find = (key: string): string => {
      let root = key;
      while (parent.has(root) && parent.get(root) !== root) root = parent.get(root)!;
      return root;
    };
    for (const key of byContractor.keys()) parent.set(key, key);
    const nameOwner = new Map<string, string>();
    for (const [key, row] of byContractor) {
      for (const nameSeen of row.names.keys()) {
        const owner = nameOwner.get(nameSeen);
        if (!owner) { nameOwner.set(nameSeen, key); continue; }
        const rootA = find(owner);
        const rootB = find(key);
        if (rootA !== rootB) parent.set(rootB, rootA);
      }
    }
    const resolvedKeyFor = (item: { contractor: string; contractorVat?: string }) => find(groupKeyFor(item));
    const mergedGroups = new Map<string, ContractorGroup>();
    for (const [key, row] of byContractor) {
      const root = find(key);
      let target = mergedGroups.get(root);
      if (!target) { target = { key: root, names: new Map(), awardCount: 0, contracts: new Set(), authorities: new Set(), valueByTender: new Map() }; mergedGroups.set(root, target); }
      for (const [nameSeen, count] of row.names) target.names.set(nameSeen, (target.names.get(nameSeen) ?? 0) + count);
      target.awardCount += row.awardCount;
      for (const item of row.contracts) target.contracts.add(item);
      for (const item of row.authorities) target.authorities.add(item);
      for (const [tenderKey, amount] of row.valueByTender) if (!target.valueByTender.has(tenderKey)) target.valueByTender.set(tenderKey, amount);
    }

    const contractorRowsBase: ContractorSummary[] = [...mergedGroups.values()]
      .map((row) => ({
        key: row.key,
        // Show the spelling that shows up most often across the matched records.
        name: [...row.names.entries()].sort((a, b) => b[1] - a[1])[0][0],
        awards: row.awardCount,
        contracts: row.contracts.size,
        authorities: row.authorities.size,
        value: [...row.valueByTender.values()].reduce((sum, item) => sum + item, 0),
      }))
      .sort((a, b) => b.awards - a.awards);

    return { relevantAwards, relevantContracts, contractorRowsBase, resolvedKeyFor };
  }, [awards, contracts, cpv, contractor]);

  // Cheap even on a large base list - no need to memoize the text filter itself.
  const search = contractorSearch.trim().toLocaleLowerCase("el");
  const contractorRows = search ? contractorRowsBase.filter((row) => row.name.toLocaleLowerCase("el").includes(search)) : contractorRowsBase;
  // Free mode: the leaderboard itself is browsable (same as everything else
  // in the app), but only the top 3 rows per selection - full ranking,
  // drill-down into a contractor's own award/contract history, and export
  // all need a login, same split as Ειδοποιήσεις (usable without an account,
  // deeper value behind one).
  const FREE_ROW_LIMIT = 3;
  const visibleRows = locked ? contractorRows.slice(0, FREE_ROW_LIMIT) : contractorRows.slice(0, visibleCount);

  const hasSelection = cpv.length > 0 || contractor.length > 0 || (authority.trim() !== "" && authority !== "Όλες") ||
    year !== "Όλα" || contractType.length > 0 || documentType !== "Όλοι";
  const selectedSummary = contractorRows.find((row) => row.key === selectedContractor);

  return <>
    <article className="panel marketHero">
      <div><p className="eyebrow">COMPETITION MAPPING</p><h2>Ανάλυση ανταγωνισμού ανά CPV</h2><p>Επίλεξε ένα ή περισσότερα CPV για να δεις την αγορά, τους αναδόχους, και τις συνδεδεμένες συμβάσεις.</p></div>
      <MultiSearchInput label="CPV" type="cpv" values={cpv} onChange={setCpv} placeholder="Αναζήτησε και επίλεξε CPV" />
    </article>
    {!hasSelection && <article className="panel empty marketStart"><span>⌕</span><h2>Επίλεξε CPV ή ανάδοχο</h2><p>Τα αποτελέσματα ανταγωνισμού θα εμφανιστούν μόνο μετά τη δική σου επιλογή.</p></article>}
    {hasSelection && <>
      {loadedCount < totalCount && <div className={`dataBanner ${stillLoading ? "" : "error"}`}>
        {stillLoading
          ? `Υπολογισμός στατιστικών… (${number.format(loadedCount)} από ${number.format(totalCount)} διαγωνισμούς)`
          : `Το φίλτρο έχει ${number.format(totalCount)} αποτελέσματα - υπολογίστηκαν τα πρώτα ${number.format(loadedCount)}. Στένεψε το φίλτρο (π.χ. πρόσθεσε έτος) για πλήρη ακρίβεια.`}
      </div>}
      <label className="search marketContractorSearch"><span>⌕</span><input value={contractorSearch} onChange={(event) => setContractorSearch(event.target.value)} placeholder="Αναζήτηση αναδόχου" /></label>
      <article className="panel tablePanel">
        <PanelHeader title="Ανάδοχοι" caption="Ταξινομημένοι κατά αριθμό αναθέσεων. Πάτησε πάνω σε έναν ανάδοχο για να δεις τις αναθέσεις και τις συμβάσεις του." onDownload={locked ? undefined : { filename: "anadoxoi", title: "Ανάδοχοι", headers: ["Ανάδοχος", "Αναθέσεις", "Συμβάσεις", "Συνολική αξία", "Αναθέτουσες Αρχές"], rows: contractorRows.map((item) => [item.name, item.awards, item.contracts, item.value, item.authorities]), columnTypes: ["text", "number", "number", "currency", "number"] }} />
        <div className="tableScroll"><table>
          <thead><tr><th /><th>Ανάδοχος</th><th>Αναθέσεις</th><th>Συμβάσεις</th><th>Συνολική αξία</th><th>Αναθέτουσες Αρχές</th></tr></thead>
          <tbody>{visibleRows.map((item) => (
            <tr key={item.key} className={selectedContractor === item.key ? "selectedRow" : ""} onClick={() => !locked && setSelectedContractor(item.key === selectedContractor ? "" : item.key)}>
              <td><input type="checkbox" checked={selectedContractor === item.key} disabled={locked} readOnly /></td>
              <td><button className="contractorLink" type="button" disabled={locked}>{item.name}</button></td>
              <td>{number.format(item.awards)}</td>
              <td>{number.format(item.contracts)}</td>
              <td>{euro.format(item.value)}</td>
              <td>{number.format(item.authorities)}</td>
            </tr>
          ))}</tbody>
        </table></div>
        {!contractorRows.length && <p className="noRows">Δεν βρέθηκαν αποτελέσματα για τις επιλογές σου.</p>}
        {!locked && contractorRows.length > visibleRows.length && <button className="viewAll" type="button" onClick={() => setVisibleCount((current) => current + 10)}>
          Φόρτωση περισσότερων ({visibleRows.length} από {number.format(contractorRows.length)})
        </button>}
        {locked && contractorRows.length > visibleRows.length && <p className="lockedNote">
          Δες όλους τους αναδόχους ({number.format(contractorRows.length)}), το ιστορικό αναθέσεων τους, και λήψη σε Excel/PDF — Σύνδεση
        </p>}
      </article>
      {!locked && selectedContractor && selectedSummary && <ContractorProfile
        name={selectedSummary.name}
        summary={selectedSummary}
        awards={relevantAwards.filter((item) => resolvedKeyFor(item) === selectedContractor)}
        contracts={relevantContracts.filter((item) => resolvedKeyFor(item) === selectedContractor)}
        onClose={() => setSelectedContractor("")}
      />}
    </>}
  </>;
}

function ContractorProfile({ name, summary, awards, contracts, onClose }: {
  name: string; summary: ContractorSummary; awards: Award[]; contracts: Contract[]; onClose: () => void;
}) {
  const [tab, setTab] = useState<"awards" | "contracts" | "distribution">("awards");
  const [selectedTender, setSelectedTender] = useState<Tender | null>(null);
  const [loadingTender, setLoadingTender] = useState(false);

  const openTender = (adam: string) => {
    setLoadingTender(true);
    fetch(`/api/procurement?q=${encodeURIComponent(adam)}&pageSize=5`)
      .then((response) => response.ok ? response.json() : { tenders: [] })
      .then((payload) => setSelectedTender((payload.tenders ?? []).find((item: Tender) => item.adam === adam) ?? null))
      .catch(() => setSelectedTender(null))
      .finally(() => setLoadingTender(false));
  };

  if (selectedTender) return <TenderDetail tender={selectedTender} onBack={() => setSelectedTender(null)} />;

  // Each award is shown as its own row - a 12-lot tender means 12 awards,
  // which is correct here (this profile is about what the company actually
  // won, not how many distinct competitive procedures it entered). The
  // original tender is a secondary, best-effort reference: shown when known,
  // never required for the row to appear or be counted.
  const awardRows = [...awards].sort((a, b) => (b.awardDate ?? "").localeCompare(a.awardDate ?? ""));

  // Same dedup rule as the "Συνολική αξία" metric above (and MarketPanel's
  // valueByTender): an award and its own eventual signed contract both carry
  // a value for the same lot, so summing both here would double-count it -
  // keep one value per tender, letting a contract (the final signed amount)
  // override its award's placeholder.
  const valueByTender = new Map<string, { value: number; label: string }>();
  for (const item of awards) {
    const key = item.noticeAdam ?? item.adam;
    if (!valueByTender.has(key)) {
      valueByTender.set(key, { value: item.value, label: item.cpvDescription ? `${item.cpv} — ${item.cpvDescription}` : item.cpv });
    }
  }
  for (const item of contracts) {
    const key = item.noticeAdam ?? item.adam;
    valueByTender.set(key, { value: item.value, label: item.cpvDescription ? `${item.cpv} — ${item.cpvDescription}` : item.cpv });
  }
  const distribution = [...[...valueByTender.values()].reduce((map, item) => {
    map.set(item.label, (map.get(item.label) ?? 0) + item.value);
    return map;
  }, new Map<string, number>())].sort((a, b) => b[1] - a[1]);
  const distributionTotal = distribution.reduce((sum, [, value]) => sum + value, 0) || 1;

  return <article className="panel contractorProfile">
    <header><div><p className="eyebrow">ΠΡΟΦΙΛ ΑΝΑΔΟΧΟΥ</p><h2>{name}</h2></div><button onClick={onClose}>Κλείσιμο ×</button></header>
    <div className="metrics marketMetrics">
      <Metric label="Αναθέσεις" value={number.format(summary.awards)} tone="sky" />
      <Metric label="Συμβάσεις" value={number.format(summary.contracts)} tone="mint" />
      <Metric label="Αναθέτουσες Αρχές" value={number.format(summary.authorities)} tone="sand" />
      <Metric label="Συνολική αξία" value={euro.format(summary.value)} tone="lilac" />
    </div>
    <div className="tabRow">
      <button type="button" className={tab === "awards" ? "active" : ""} onClick={() => setTab("awards")}>Αναθέσεις</button>
      <button type="button" className={tab === "contracts" ? "active" : ""} onClick={() => setTab("contracts")}>Συμβάσεις</button>
      <button type="button" className={tab === "distribution" ? "active" : ""} onClick={() => setTab("distribution")}>Κατανομή</button>
    </div>
    {tab === "awards" && <div className="tableScroll"><table><thead><tr><th>ΑΔΑΜ Ανάθεσης</th><th>Τίτλος</th><th>Αναθέτουσα Αρχή</th><th>Ημ. ανάθεσης</th><th>Αξία</th><th>Διακήρυξη</th></tr></thead><tbody>{awardRows.map((item) => {
      const hasNotice = Boolean(item.noticeAdam && item.noticeTitle);
      return <tr key={item.adam} className={hasNotice ? "clickableRow" : ""} onClick={hasNotice ? () => openTender(item.noticeAdam!) : undefined}>
        <td className="adam">{item.adam}</td>
        <td>{item.title}</td>
        <td>{item.authority}</td>
        <td>{formatDate(item.awardDate)}</td>
        <td>{euro.format(item.value)}</td>
        <td>{hasNotice ? item.noticeTitle : <span className="cellSub">—</span>}</td>
      </tr>;
    })}</tbody></table>{!awardRows.length && <p className="noRows">Δεν βρέθηκαν αναθέσεις.</p>}{loadingTender && <p className="noRows">Φόρτωση στοιχείων διαγωνισμού…</p>}</div>}
    {tab === "contracts" && <div className="tableScroll"><table><thead><tr><th>ΑΔΑΜ Σύμβασης</th><th>Τίτλος</th><th>Αναθέτουσα Αρχή</th><th>Ημ. υπογραφής</th><th>Αξία</th></tr></thead><tbody>{contracts.map((item) => <tr key={item.adam}><td className="adam">{item.adam}</td><td>{item.title}</td><td>{item.authority}</td><td>{formatDate(item.signedDate)}</td><td>{euro.format(item.value)}</td></tr>)}</tbody></table>{!contracts.length && <p className="noRows">Δεν βρέθηκαν συμβάσεις.</p>}</div>}
    {tab === "distribution" && <div className="bars">{distribution.slice(0, 10).map(([label, value]) => <div className="barRow" key={label}><span title={label}>{label}</span><div><i className="teal" style={{ width: `${(value / distributionTotal) * 100}%` }} /></div><strong>{euro.format(value)}</strong></div>)}{!distribution.length && <p className="noRows">Δεν υπάρχουν δεδομένα κατανομής.</p>}</div>}
  </article>;
}

function formatDate(value?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("el-GR").format(new Date(value));
}

type WatchlistItem = { cpv_code: string; cpv_label: string | null };
type NutsFilterItem = { nuts_code: string; nuts_name: string | null };
type AlertItem = {
  adam: string; title: string; authority: string; contractType?: string; documentType?: string | null;
  publicationDate: string | null; openingDate: string | null; budget: number; hasAward: boolean;
  matchedCpv: string[]; cpvs: { code: string; description: string | null }[];
};

const ALERT_URGENT_DAYS = 15;

function alertUrgency(openingDate: string | null): "open" | "urgent" | "passed" | "unknown" {
  if (!openingDate) return "unknown";
  const diffDays = (new Date(openingDate).getTime() - Date.now()) / 86400000;
  if (diffDays < 0) return "passed";
  if (diffDays < ALERT_URGENT_DAYS) return "urgent";
  return "open";
}

// Shared across every page that gates content behind the team passcode
// (Ειδοποιήσεις's own data, Αγορά & Ανταγωνισμός) - one login unlocks all of
// them, since the code is just read from/written to the same localStorage
// key regardless of which page's hook instance is asking.
function useTeamCode() {
  const [code, setCode] = useState<string | null | undefined>(undefined);
  const [inputCode, setInputCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [lockError, setLockError] = useState("");
  const [showCodeBox, setShowCodeBox] = useState(false);

  useEffect(() => {
    setCode(window.localStorage.getItem("alertAccessCode"));
  }, []);

  const unlock = () => {
    if (!inputCode.trim()) return;
    setChecking(true);
    setLockError("");
    fetch("/api/alert-recipients", { headers: { "x-alert-code": inputCode } })
      .then((response) => {
        if (response.ok) {
          window.localStorage.setItem("alertAccessCode", inputCode);
          setCode(inputCode);
          setShowCodeBox(false);
        } else {
          setLockError("Λάθος κωδικός.");
        }
      })
      .catch(() => setLockError("Σφάλμα σύνδεσης - δοκίμασε ξανά."))
      .finally(() => setChecking(false));
  };

  const logout = () => {
    window.localStorage.removeItem("alertAccessCode");
    setCode(null);
    setInputCode("");
  };

  const onUnauthorized = useCallback(() => {
    window.localStorage.removeItem("alertAccessCode");
    setCode(null);
    setLockError("Ο κωδικός δεν ισχύει πια.");
  }, []);

  return { code, inputCode, setInputCode, checking, lockError, setLockError, showCodeBox, setShowCodeBox, unlock, logout, onUnauthorized };
}

function TeamCodeBar({ team }: { team: ReturnType<typeof useTeamCode> }) {
  const { code, inputCode, setInputCode, checking, lockError, setLockError, showCodeBox, setShowCodeBox, unlock, logout } = team;
  return <div className="teamCodeBar">
    {code
      ? <span className="teamCodeStatus">✓ Σύνδεση ενεργή<button type="button" onClick={logout}>Αποσύνδεση</button></span>
      : showCodeBox
        ? <span className="teamCodeStatus">
            <input type="password" value={inputCode} onChange={(event) => { setInputCode(event.target.value); setLockError(""); }} onKeyDown={(event) => { if (event.key === "Enter") unlock(); }} placeholder="Κωδικός πρόσβασης" autoFocus />
            <button type="button" onClick={unlock} disabled={checking}>{checking ? "…" : "Είσοδος"}</button>
            {lockError && <span className="recipientError">{lockError}</span>}
          </span>
        : <span className="teamCodeStatus">
            <button type="button" className="teamCodeToggle" onClick={() => setShowCodeBox(true)}>Σύνδεση</button>
            {/* Not wired up yet - individual self-service registration is a
                separate, bigger feature to build later (own login +
                persistent profile per person, distinct from this shared
                passcode). Shown now, disabled, so the entry point is
                already in place. */}
            <button type="button" className="teamCodeSignup" disabled title="Σύντομα διαθέσιμο">Εγγραφή</button>
          </span>}
  </div>;
}

// The Ειδοποιήσεις page itself stays open to anyone - only the TEAM's own
// shared picks (CPV/region watchlist, tracked tenders, email recipients) are
// gated. Without the code, AlertsPanelContent runs in "free" mode: CPV/region
// search and results work exactly the same, but nothing is written to the
// shared Supabase tables OR persisted anywhere on this device - it's plain
// component state, gone on refresh, with no email option (that needs the
// shared, code-gated recipient list). Entering the passcode switches to
// "team" mode, which reads/writes the real shared tables, persists across
// visits, and unlocks email alerts.
//
// key forces a full remount on login/logout - otherwise React keeps reusing
// the same component instance and every piece of state (alerts,
// submitted/interested, recipients) from the previous mode stays on screen
// instead of being cleared. watchlist/nutsFilter are passed in from Home
// instead, so they're unaffected by this remount and by switching tabs away
// and back.
function AlertsPanelContent({ code, onUnauthorized, watchlist, setWatchlist, nutsFilter, setNutsFilter }: {
  code: string | null; onUnauthorized: () => void;
  watchlist: WatchlistItem[]; setWatchlist: (value: WatchlistItem[] | ((current: WatchlistItem[]) => WatchlistItem[])) => void;
  nutsFilter: NutsFilterItem[]; setNutsFilter: (value: NutsFilterItem[] | ((current: NutsFilterItem[]) => NutsFilterItem[])) => void;
}) {
  const authFetch = useCallback((url: string, init: RequestInit = {}) => {
    return fetch(url, { ...init, headers: { ...(init.headers as Record<string, string> ?? {}), "x-alert-code": code ?? "" } })
      .then((response) => {
        if (response.status === 401) onUnauthorized();
        return response;
      });
  }, [code, onUnauthorized]);

  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  // Defaults to "recent" (not "active") so landing here from the nav bell
  // badge - which counts exactly this tab's items - shows what it was
  // counting immediately, instead of needing an extra click past "Ενεργοί".
  const [alertTab, setAlertTab] = useState<"recent" | "active" | "inactive">("recent");
  const [authorityFilter, setAuthorityFilter] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [selectedTender, setSelectedTender] = useState<Tender | null>(null);
  const [loadingTender, setLoadingTender] = useState(false);
  const [recipients, setRecipients] = useState<{ email: string }[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [recipientError, setRecipientError] = useState("");
  const [recipientNote, setRecipientNote] = useState("");
  const [apodeltiosiFile, setApodeltiosiFile] = useState<File | null>(null);
  const [apodeltiosiLoading, setApodeltiosiLoading] = useState(false);
  const [apodeltiosiError, setApodeltiosiError] = useState("");
  const [apodeltiosiResult, setApodeltiosiResult] = useState<Apodeltiosi | null>(null);
  const [submittedAdams, setSubmittedAdams] = useState<Set<string>>(new Set());
  const [interestedAdams, setInterestedAdams] = useState<Set<string>>(new Set());
  const [trackedItems, setTrackedItems] = useState<AlertItem[]>([]);
  const [copiedAdam, setCopiedAdam] = useState<string | null>(null);

  const copyAdam = useCallback((adam: string, event: SyntheticEvent) => {
    event.stopPropagation();
    const onCopied = () => {
      setCopiedAdam(adam);
      window.setTimeout(() => setCopiedAdam((current) => (current === adam ? null : current)), 1500);
    };
    navigator.clipboard.writeText(adam).then(onCopied, () => {
      // Some browsers refuse the async Clipboard API outside a focused tab
      // or a secure context - a hidden textarea + execCommand still works.
      const textarea = document.createElement("textarea");
      textarea.value = adam;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        if (document.execCommand("copy")) onCopied();
      } catch {
        // Nothing more we can do - the click still worked, just not the copy.
      }
      document.body.removeChild(textarea);
    });
  }, []);

  const loadSubmissions = useCallback(() => {
    if (!code) return; // free mode: nothing to load, state starts empty every visit
    authFetch("/api/alert-submissions")
      .then((response) => response.ok ? response.json() : { items: [] })
      .then((payload) => setSubmittedAdams(new Set((payload.items ?? []).map((item: { adam: string }) => item.adam))))
      .catch(() => setSubmittedAdams(new Set()));
  }, [authFetch, code]);

  useEffect(() => { loadSubmissions(); }, [loadSubmissions]);

  const toggleSubmitted = (adam: string) => {
    const isMarked = submittedAdams.has(adam);
    setSubmittedAdams((current) => {
      const next = new Set(current);
      if (isMarked) next.delete(adam); else next.add(adam);
      return next;
    });
    if (!code) return; // free mode: state above is the only record, nothing persisted
    if (isMarked) {
      authFetch(`/api/alert-submissions?adam=${encodeURIComponent(adam)}`, { method: "DELETE" }).then(loadSubmissions);
    } else {
      authFetch("/api/alert-submissions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ adam }) }).then(loadSubmissions);
    }
  };

  const loadInterests = useCallback(() => {
    if (!code) return;
    authFetch("/api/alert-interests")
      .then((response) => response.ok ? response.json() : { items: [] })
      .then((payload) => setInterestedAdams(new Set((payload.items ?? []).map((item: { adam: string }) => item.adam))))
      .catch(() => setInterestedAdams(new Set()));
  }, [authFetch, code]);

  useEffect(() => { loadInterests(); }, [loadInterests]);

  const toggleInterested = (adam: string) => {
    const isMarked = interestedAdams.has(adam);
    setInterestedAdams((current) => {
      const next = new Set(current);
      if (isMarked) next.delete(adam); else next.add(adam);
      return next;
    });
    if (!code) return;
    if (isMarked) {
      authFetch(`/api/alert-interests?adam=${encodeURIComponent(adam)}`, { method: "DELETE" }).then(loadInterests);
    } else {
      authFetch("/api/alert-interests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ adam }) }).then(loadInterests);
    }
  };

  // "Υποβεβλημένες προσφορές"/"Ενδιαφέρον για συμμετοχή" are the user's own
  // tracked ADAMs, looked up directly - unlike `alerts` (below), which is
  // scoped to whatever CPVs are currently on the watchlist within a recent
  // window, so it would otherwise make an already-tracked tender vanish from
  // these lists the moment its CPV is unwatched.
  useEffect(() => {
    const adams = [...new Set([...submittedAdams, ...interestedAdams])];
    if (!adams.length) { setTrackedItems([]); return; }
    const params = new URLSearchParams();
    adams.forEach((adam) => params.append("adam", adam));
    // Not team-gated: resolving already-known ADAMs to their public ΚΗΜΔΗΣ
    // details reveals nothing about who's tracking what, so this works the
    // same in local mode as it does for the team.
    fetch(`/api/alert-tenders?${params.toString()}`)
      .then((response) => response.ok ? response.json() : { items: [] })
      .then((payload) => setTrackedItems(payload.items ?? []))
      .catch(() => setTrackedItems([]));
  }, [submittedAdams, interestedAdams]);

  const loadRecipients = useCallback(() => {
    if (!code) { setRecipients([]); return; }
    authFetch("/api/alert-recipients")
      .then((response) => response.ok ? response.json() : { items: [] })
      .then((payload) => setRecipients(payload.items ?? []))
      .catch(() => setRecipients([]));
  }, [authFetch, code]);

  useEffect(() => { loadRecipients(); }, [loadRecipients]);

  const addRecipient = () => {
    const email = newEmail.trim();
    if (!email) return;
    setRecipientNote("");
    authFetch("/api/alert-recipients", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) })
      .then((response) => response.json())
      .then((payload) => {
        if (payload.error) { setRecipientError(payload.error); return; }
        setRecipientError("");
        setNewEmail("");
        setRecipientNote(payload.welcomeEmailSent ? `Το πρώτο email στάλθηκε στο ${email}.` : "");
        loadRecipients();
      });
  };

  const removeRecipient = (email: string) => {
    setRecipients((current) => current.filter((item) => item.email !== email));
    authFetch(`/api/alert-recipients?email=${encodeURIComponent(email)}`, { method: "DELETE" }).then(loadRecipients);
  };

  // Team mode: single source of truth is the server (/api/alerts with no
  // params reads the shared watchlist/region tables and returns them
  // alongside the matching feed) - watchlist/nutsFilter state here just
  // mirrors whatever it last returned.
  const load = useCallback(() => {
    // A cold Vercel/Supabase connection occasionally 500s the first request
    // right after a page load; one silent retry clears most of those.
    const attemptFetch = (attempt: number) => {
      setLoading(true);
      authFetch("/api/alerts")
        .then((response) => response.ok ? response.json() : Promise.reject(new Error("alerts request failed")))
        .then((payload) => { setWatchlist(payload.watchlist ?? []); setNutsFilter(payload.nutsFilter ?? []); setAlerts(payload.alerts ?? []); setError(""); setLoading(false); })
        .catch(() => {
          if (attempt < 2) { window.setTimeout(() => attemptFetch(attempt + 1), 900); return; }
          setError("Δεν ήταν δυνατή η φόρτωση των ειδοποιήσεων.");
          setLoading(false);
        });
    };
    attemptFetch(0);
  }, [authFetch]);

  useEffect(() => { if (code) load(); }, [code, load]);

  // Free mode: watchlist/nutsFilter state IS the source of truth (nothing
  // persisted, nothing to read back) - only the matching-notice feed itself
  // needs the server, computed straight from whatever's currently in state.
  // Runs automatically whenever that state changes, so adding/removing a CPV
  // or region refreshes the results without a separate reload call.
  const loadLocalAlerts = useCallback(() => {
    if (!watchlist.length) { setAlerts([]); setError(""); setLoading(false); return; }
    setLoading(true);
    const params = new URLSearchParams();
    watchlist.forEach((item) => params.append("cpv", item.cpv_code));
    nutsFilter.forEach((item) => params.append("nuts", item.nuts_code));
    fetch(`/api/alerts?${params.toString()}`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("alerts request failed")))
      .then((payload) => { setAlerts(payload.alerts ?? []); setError(""); setLoading(false); })
      .catch(() => { setError("Δεν ήταν δυνατή η φόρτωση των ειδοποιήσεων."); setLoading(false); });
  }, [watchlist, nutsFilter]);

  useEffect(() => { if (!code) loadLocalAlerts(); }, [code, watchlist, nutsFilter, loadLocalAlerts]);

  // The refresh (↻) button needs one function regardless of mode.
  const refresh = code ? load : loadLocalAlerts;

  const removeCpv = (cpvCode: string) => {
    setWatchlist((current) => current.filter((item) => item.cpv_code !== cpvCode));
    if (!code) return; // free mode: the state update above is the whole story
    authFetch(`/api/watchlist?cpv_code=${encodeURIComponent(cpvCode)}`, { method: "DELETE" }).then(load);
  };

  const removeNutsFilter = (nutsCode: string) => {
    setNutsFilter((current) => current.filter((item) => item.nuts_code !== nutsCode));
    if (!code) return;
    authFetch(`/api/alert-nuts-filter?nuts_code=${encodeURIComponent(nutsCode)}`, { method: "DELETE" }).then(load);
  };

  const openTender = (adam: string) => {
    setLoadingTender(true);
    fetch(`/api/procurement?q=${encodeURIComponent(adam)}&pageSize=5`)
      .then((response) => response.ok ? response.json() : { tenders: [] })
      .then((payload) => setSelectedTender((payload.tenders ?? []).find((item: Tender) => item.adam === adam) ?? null))
      .catch(() => setSelectedTender(null))
      .finally(() => setLoadingTender(false));
  };

  // Team-only (paid-tier candidate): sends the raw PDF to Claude to read and
  // extract into the same 6-section structure as the sample doc she supplied.
  const runApodeltiosi = () => {
    if (!apodeltiosiFile) return;
    setApodeltiosiLoading(true);
    setApodeltiosiError("");
    setApodeltiosiResult(null);
    const formData = new FormData();
    formData.append("file", apodeltiosiFile);
    authFetch("/api/apodeltiosi", { method: "POST", body: formData })
      .then((response) => response.json())
      .then((payload) => {
        if (payload.error) { setApodeltiosiError(payload.error); return; }
        setApodeltiosiResult(payload.result);
      })
      .catch(() => setApodeltiosiError("Σφάλμα κατά την ανάλυση - δοκίμασε ξανά."))
      .finally(() => setApodeltiosiLoading(false));
  };

  const downloadApodeltiosiDocx = () => {
    if (!apodeltiosiResult) return;
    authFetch("/api/apodeltiosi/docx", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(apodeltiosiResult) })
      .then((response) => response.ok ? response.blob() : Promise.reject())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `Αποδελτίωση_${apodeltiosiResult.titlos.slice(0, 40)}.docx`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
      })
      .catch(() => setApodeltiosiError("Η λήψη απέτυχε - δοκίμασε ξανά."));
  };

  if (selectedTender) return <TenderDetail tender={selectedTender} onBack={() => setSelectedTender(null)} />;

  const submittedItems = trackedItems.filter((item) => submittedAdams.has(item.adam));
  const interestedItems = trackedItems.filter((item) => interestedAdams.has(item.adam));

  return <>
    <div className="alertsTopGrid">
    <div className="alertsLeftCol">
    <article className="panel watchlistPanel">
      <div className="watchlistRow cpvWatchRow">
        <div className="filterHeading"><div><p className="eyebrow">CPV ALERTS</p><h2>Παρακολούθηση CPV</h2></div><button type="button" title={loading ? "Φόρτωση…" : "Ανανέωση ειδοποιήσεων"} onClick={refresh}><span className={loading ? "spinIcon" : ""}>↻</span></button></div>
        <div className="cpvNutsRow">
          <MultiSearchInput
            label="CPV"
            type="cpv"
            values={watchlist.map((item) => item.cpv_code)}
            initialLabels={Object.fromEntries(watchlist.map((item) => [item.cpv_code, item.cpv_label ?? item.cpv_code]))}
            onChange={(nextValues) => {
              const removed = watchlist.map((item) => item.cpv_code).find((code) => !nextValues.includes(code));
              if (removed) removeCpv(removed);
            }}
            onSelectOption={(option) => {
              if (!code) {
                setWatchlist((current) => current.some((item) => item.cpv_code === option.value)
                  ? current
                  : [...current, { cpv_code: option.value, cpv_label: option.label }]);
                return;
              }
              authFetch("/api/watchlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cpv_code: option.value, cpv_label: option.label }) })
                .then(load);
            }}
            placeholder="Αναζήτησε κωδικό ή περιγραφή CPV"
          />
          <MultiSearchInput
            label="Περιοχή"
            type="nuts"
            values={nutsFilter.map((item) => item.nuts_code)}
            initialLabels={Object.fromEntries(nutsFilter.map((item) => [item.nuts_code, item.nuts_name ?? item.nuts_code]))}
            onChange={(nextValues) => {
              const removed = nutsFilter.map((item) => item.nuts_code).find((code) => !nextValues.includes(code));
              if (removed) removeNutsFilter(removed);
            }}
            onSelectOption={(option) => {
              if (!code) {
                setNutsFilter((current) => current.some((item) => item.nuts_code === option.value)
                  ? current
                  : [...current, { nuts_code: option.value, nuts_name: option.label }]);
                return;
              }
              authFetch("/api/alert-nuts-filter", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nuts_code: option.value, nuts_name: option.label }) })
                .then(load);
            }}
            placeholder="π.χ. Αττική - αφήστε κενό για όλη τη χώρα"
          />
        </div>
      </div>
      <p className="watchlistCaption">Οι νέοι διαγωνισμοί που δημοσιεύονται σε αυτά τα CPV εμφανίζονται παρακάτω, με αποδελτίωση των βασικών στοιχείων{nutsFilter.length > 0 && ", περιορισμένοι στην περιοχή που επέλεξες"}.</p>
    </article>
    <article className="panel submittedPanel">
      <p className="eyebrow">ΚΑΤΑΤΕΘΕΙΜΕΝΕΣ</p>
      <h2>Υποβεβλημένες προσφορές</h2>
      {!submittedItems.length && <p className="noRows">Δεν έχεις σημειώσει ακόμη κάποιον διαγωνισμό ως υποβεβλημένο. Πάτησε «Σήμανση προσφοράς» σε μια κάρτα παρακάτω.</p>}
      {submittedItems.length > 0 && <ul className="submittedList">
        {submittedItems.map((item) => <li key={item.adam}>
          <button type="button" className="submittedTitle" onClick={() => openTender(item.adam)}>{item.title}</button>
          <span className="submittedMeta">{item.authority}</span>
          <span className="submittedFacts">
            <span><b>Π/Υ</b>{euro.format(item.budget)}</span>
            <span><b>Αποσφράγιση</b>{formatDate(item.openingDate ?? undefined)}</span>
            <span className="adamCopy" role="button" tabIndex={0} title="Αντιγραφή ΑΔΑΜ" onClick={(event) => copyAdam(item.adam, event)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); copyAdam(item.adam, event); } }}><b>ΑΔΑΜ</b>{copiedAdam === item.adam ? "Αντιγράφηκε!" : item.adam}</span>
          </span>
          <button type="button" className="submittedUnmark" onClick={() => toggleSubmitted(item.adam)} aria-label={`Αναίρεση σήμανσης ${item.title}`}>Αναίρεση</button>
        </li>)}
      </ul>}
      <div className="panelDivider">
        <p className="eyebrow">ΕΝΔΙΑΦΕΡΟΝ</p>
        <h2>Ενδιαφέρον για συμμετοχή</h2>
        {!interestedItems.length && <p className="noRows">Δεν έχεις σημειώσει ακόμη κάποιον διαγωνισμό ως ενδιαφέροντα. Πάτησε «Σήμανση ενδιαφέροντος» σε μια κάρτα παρακάτω.</p>}
        {interestedItems.length > 0 && <ul className="submittedList">
          {interestedItems.map((item) => <li key={item.adam}>
            <button type="button" className="submittedTitle" onClick={() => openTender(item.adam)}>{item.title}</button>
            <span className="submittedMeta">{item.authority}</span>
            <span className="submittedFacts">
              <span><b>Π/Υ</b>{euro.format(item.budget)}</span>
              <span><b>Αποσφράγιση</b>{formatDate(item.openingDate ?? undefined)}</span>
              <span className="adamCopy" role="button" tabIndex={0} title="Αντιγραφή ΑΔΑΜ" onClick={(event) => copyAdam(item.adam, event)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); copyAdam(item.adam, event); } }}><b>ΑΔΑΜ</b>{copiedAdam === item.adam ? "Αντιγράφηκε!" : item.adam}</span>
            </span>
            <button type="button" className="submittedUnmark" onClick={() => toggleInterested(item.adam)} aria-label={`Αναίρεση σήμανσης ${item.title}`}>Αναίρεση</button>
          </li>)}
        </ul>}
      </div>
    </article>
    </div>
    <div className="alertsRightCol">
    {code ? <article className="panel emailPanel">
      <p className="eyebrow">EMAIL</p>
      <h2><span className="emailIcon" aria-hidden="true">✉</span>Ειδοποιήσεις μέσω email</h2>
      <p className="emailCaption">Στείλε νέους διαγωνισμούς απευθείας στα εισερχόμενα.</p>
      <div className="recipientInput">
        <input
          type="email"
          value={newEmail}
          onChange={(event) => { setNewEmail(event.target.value); setRecipientError(""); }}
          onKeyDown={(event) => { if (event.key === "Enter") addRecipient(); }}
          placeholder="email@example.com"
        />
        <button type="button" onClick={addRecipient}>Προσθήκη</button>
      </div>
      {recipientError && <p className="recipientError">{recipientError}</p>}
      {recipientNote && <p className="recipientNote">{recipientNote}</p>}
      {recipients.length > 0 && <div className="recipientChips">
        {recipients.map((item) => <span className="recipientChip" key={item.email}>{item.email}<button type="button" onClick={() => removeRecipient(item.email)} aria-label={`Αφαίρεση ${item.email}`}>×</button></span>)}
      </div>}
    </article> : <article className="panel emailPanel emailPanelLocked">
      <p className="eyebrow">EMAIL</p>
      <h2><span className="emailIcon" aria-hidden="true">✉</span>Ειδοποιήσεις μέσω email</h2>
      <p className="emailCaption">Για να ενημερώνεσαι με νέες ειδοποιήσεις για CPV/διαγωνισμούς που σε ενδιαφέρουν, συνδέσου ή εγγράψου.</p>
    </article>}
    {code ? <article className="panel apodeltiosiPanel apodeltiosiTrigger">
      <p className="eyebrow">ΑΠΟΔΕΛΤΙΩΣΗ</p>
      <h2>Ανάλυση Διακήρυξης</h2>
      <p className="watchlistCaption">Ανέβασε το PDF μιας Διακήρυξης για αυτόματη αποδελτίωση σε δομημένη μορφή.</p>
      <div className="recipientInput">
        <input type="file" accept="application/pdf" onChange={(event) => { setApodeltiosiFile(event.target.files?.[0] ?? null); setApodeltiosiError(""); }} />
        <button type="button" onClick={runApodeltiosi} disabled={!apodeltiosiFile || apodeltiosiLoading}>{apodeltiosiLoading ? "Ανάλυση…" : "Ανάλυση"}</button>
      </div>
      {apodeltiosiError && <p className="recipientError">{apodeltiosiError}</p>}
    </article> : <article className="panel apodeltiosiPanel apodeltiosiTrigger apodeltiosiPanelLocked">
      <p className="eyebrow">ΑΠΟΔΕΛΤΙΩΣΗ</p>
      <h2>Ανάλυση Διακήρυξης</h2>
      <p className="watchlistCaption">Για να ανεβάζεις Διακηρύξεις και να παίρνεις αυτόματη αποδελτίωση, συνδέσου ή εγγράψου.</p>
    </article>}
    </div>
    </div>
    {apodeltiosiResult && <article className="panel apodeltiosiPanel apodeltiosiResultPanel">
      <div className="apodeltiosiResultHeader">
        <div>
          <p className="eyebrow">ΑΠΟΔΕΛΤΙΩΣΗ</p>
          <h3>«{apodeltiosiResult.titlos}»</h3>
          {apodeltiosiResult.arithmosDiakiryxis && <p className="apodeltiosiSub">Αρ. Διακ.: {apodeltiosiResult.arithmosDiakiryxis}</p>}
        </div>
        <button type="button" onClick={downloadApodeltiosiDocx}>Λήψη .docx</button>
      </div>

      <h4>1. Βασικά Στοιχεία Διαγωνισμού</h4>
      <table className="apodeltiosiTable"><tbody>
        {apodeltiosiResult.basikaStoixeia.map((item, i) => <tr key={i}><td>{item.stoixeio}</td><td>{item.plirofpria}</td></tr>)}
      </tbody></table>

      <h4>2. Κρίσιμες Προθεσμίες</h4>
      <table className="apodeltiosiTable"><tbody>
        {apodeltiosiResult.prothesmies.map((item, i) => <tr key={i}><td>{item.energeia}</td><td>{item.imerominia}</td></tr>)}
      </tbody></table>

      {apodeltiosiResult.enosiEtaireion && <>
        <h4>3. Συμμετοχή ως Ένωση Εταιρειών</h4>
        {apodeltiosiResult.enosiEtaireion.genikesArxes.length > 0 && <>
          <h5>3.1 Γενικές Αρχές</h5>
          <ul className="apodeltiosiList">{apodeltiosiResult.enosiEtaireion.genikesArxes.map((item, i) => <li key={i}>{item}</li>)}</ul>
        </>}
        {apodeltiosiResult.enosiEtaireion.ypoxreotikaStoixeia.length > 0 && <>
          <h5>3.2 Υποχρεωτικά Στοιχεία Προσφοράς Ένωσης</h5>
          <ul className="apodeltiosiList">{apodeltiosiResult.enosiEtaireion.ypoxreotikaStoixeia.map((item, i) => <li key={i}>{item}</li>)}</ul>
        </>}
      </>}

      <h4>4. Κριτήρια Ποιοτικής Επιλογής</h4>
      {apodeltiosiResult.kritiriaPoiotikisEpilogis.katallilotita.length > 0 && <>
        <h5>4.1 Καταλληλότητα</h5>
        <ul className="apodeltiosiList">{apodeltiosiResult.kritiriaPoiotikisEpilogis.katallilotita.map((item, i) => <li key={i}>{item}</li>)}</ul>
      </>}
      {apodeltiosiResult.kritiriaPoiotikisEpilogis.oikonomikiEparkeia.length > 0 && <>
        <h5>4.2 Οικονομική Επάρκεια</h5>
        <ul className="apodeltiosiList">{apodeltiosiResult.kritiriaPoiotikisEpilogis.oikonomikiEparkeia.map((item, i) => <li key={i}>{item}</li>)}</ul>
      </>}
      {apodeltiosiResult.kritiriaPoiotikisEpilogis.texnikiIkanotita.length > 0 && <>
        <h5>4.3 Τεχνική Ικανότητα</h5>
        <ul className="apodeltiosiList">{apodeltiosiResult.kritiriaPoiotikisEpilogis.texnikiIkanotita.map((item, i) => <li key={i}>{item}</li>)}</ul>
      </>}
      {apodeltiosiResult.kritiriaPoiotikisEpilogis.omadaErgou.length > 0 && <>
        <h5>4.4 Ομάδα Έργου</h5>
        <table className="apodeltiosiTable"><tbody>
          {apodeltiosiResult.kritiriaPoiotikisEpilogis.omadaErgou.map((item, i) => <tr key={i}><td>{item.rolos}</td><td>{item.prosonta}</td></tr>)}
        </tbody></table>
      </>}
      {apodeltiosiResult.kritiriaPoiotikisEpilogis.pistopoiitikaISO.length > 0 && <>
        <h5>4.5 Πιστοποιητικά ISO</h5>
        <table className="apodeltiosiTable"><tbody>
          {apodeltiosiResult.kritiriaPoiotikisEpilogis.pistopoiitikaISO.map((item, i) => <tr key={i}><td>{item.pistopoiitiko}</td><td>{item.pedio}</td></tr>)}
        </tbody></table>
      </>}

      <h4>5. Τι Υποβάλλουμε</h4>
      {apodeltiosiResult.tiYpovalloume.dikaiologitikaSymmetoxis.length > 0 && <>
        <h5>5.1 Δικαιολογητικά Συμμετοχής</h5>
        <ul className="apodeltiosiList">{apodeltiosiResult.tiYpovalloume.dikaiologitikaSymmetoxis.map((item, i) => <li key={i}>{item}</li>)}</ul>
      </>}
      {apodeltiosiResult.tiYpovalloume.oikonomikiProsfora.length > 0 && <>
        <h5>5.2 Οικονομική Προσφορά</h5>
        <ul className="apodeltiosiList">{apodeltiosiResult.tiYpovalloume.oikonomikiProsfora.map((item, i) => <li key={i}>{item}</li>)}</ul>
      </>}
      {apodeltiosiResult.tiYpovalloume.isxysProsforas.length > 0 && <>
        <h5>5.3 Ισχύς Προσφοράς</h5>
        <ul className="apodeltiosiList">{apodeltiosiResult.tiYpovalloume.isxysProsforas.map((item, i) => <li key={i}>{item}</li>)}</ul>
      </>}
      {apodeltiosiResult.tiYpovalloume.dikaiologitikaProsorinouAnadoxou.length > 0 && <>
        <h5>5.4 Δικαιολογητικά Προσωρινού Αναδόχου</h5>
        <ul className="apodeltiosiList">{apodeltiosiResult.tiYpovalloume.dikaiologitikaProsorinouAnadoxou.map((item, i) => <li key={i}>{item}</li>)}</ul>
      </>}

      {apodeltiosiResult.epishmanseis.length > 0 && <>
        <h4>6. Σημαντικές Επισημάνσεις</h4>
        <ul className="apodeltiosiList">{apodeltiosiResult.epishmanseis.map((item, i) => <li key={i}>{item}</li>)}</ul>
      </>}
    </article>}
    {!loading && !watchlist.length && <article className="panel empty"><span>♢</span><h2>Δεν παρακολουθείς κανένα CPV</h2><p>Πρόσθεσε έναν ή περισσότερους κωδικούς CPV παραπάνω για να ξεκινήσεις να βλέπεις εδώ τους νέους διαγωνισμούς που ταιριάζουν.</p></article>}
    {error && <div className="dataBanner error">{error}</div>}
    {watchlist.length > 0 && (() => {
      const isWithinDays = (item: AlertItem, days: number) => item.publicationDate ? (Date.now() - new Date(item.publicationDate).getTime()) < days * 86400000 : false;
      const authorityTerms = authorityFilter.map((item) => item.toLocaleLowerCase("el"));
      const scoped = authorityTerms.length
        ? alerts.filter((item) => authorityTerms.some((term) => item.authority.toLocaleLowerCase("el").includes(term)))
        : alerts;
      // Πρόσφατοι = published in the last week (with a ΝΕΟ badge for the
      // last-3-days sub-tier within it), Ενεργοί = everything else still
      // open (colored by how close its αποσφράγιση is), Ανενεργοί = passed.
      // A notice's own opening_at can be stale once ΚΗΜΔΗΣ moves on - a
      // tender that already has an award (see sql/alerts_feed.sql) is
      // concluded regardless of what its deadline still claims, so it's
      // always treated as passed instead of misreading as still open.
      const isConcluded = (item: AlertItem) => item.hasAward || alertUrgency(item.openingDate) === "passed";
      const passed = scoped.filter(isConcluded);
      // Newest publication first within Πρόσφατα - the rest of the app
      // sorts by αποσφράγιση, but "recent" is specifically about what just
      // got published, so it needs its own sort key.
      const recent = scoped
        .filter((item) => !isConcluded(item) && isWithinDays(item, 7))
        .sort((a, b) => (b.publicationDate ?? "").localeCompare(a.publicationDate ?? ""));
      const active = scoped.filter((item) => !isConcluded(item) && !isWithinDays(item, 7));
      const tabs: { key: "recent" | "active" | "inactive"; label: string; items: AlertItem[] }[] = [
        { key: "recent", label: "Πρόσφατοι", items: recent },
        { key: "active", label: "Ενεργοί", items: active },
        { key: "inactive", label: "Ανενεργοί", items: passed },
      ];
      const shownItems = tabs.find((tab) => tab.key === alertTab)?.items ?? [];

      const renderCard = (item: AlertItem) => {
        // A tender can carry many CPVs, most of them irrelevant - lead
        // with the ones that actually matched the watchlist, and fall
        // back to the full list only if none matched for some reason.
        const relevantCpvs = item.cpvs.filter((cpv) => item.matchedCpv.includes(cpv.code));
        const shownCpvs = relevantCpvs.length ? relevantCpvs : item.cpvs;
        const colorClass = alertTab === "recent" ? "is-recent"
          : alertTab === "inactive" ? "is-passed"
          : alertUrgency(item.openingDate) === "urgent" ? "is-active-urgent" : "is-active-open";
        const isMarked = submittedAdams.has(item.adam);
        const isInterestedMarked = interestedAdams.has(item.adam);
        return <button type="button" className={`alertCard ${colorClass} ${isMarked ? "isSubmitted" : ""} ${isInterestedMarked ? "isInterested" : ""}`} key={item.adam} onClick={() => openTender(item.adam)}>
        <span className="markToggleRow">
          <span
            className="markToggle interest"
            role="button"
            tabIndex={0}
            title={isInterestedMarked ? "Υπό εξέταση για συμμετοχή - πάτησε για αναίρεση" : "Σημείωσε ότι μας ενδιαφέρει / σκεφτόμαστε συμμετοχή"}
            onClick={(event) => { event.stopPropagation(); toggleInterested(item.adam); }}
            onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); toggleInterested(item.adam); } }}
          >{isInterestedMarked ? "★ Ενδιαφέρον" : "Σήμανση ενδιαφέροντος"}</span>
          <span
            className="markToggle"
            role="button"
            tabIndex={0}
            title={isMarked ? "Έχει κατατεθεί προσφορά - πάτησε για αναίρεση" : "Σημείωσε ότι κατατέθηκε προσφορά"}
            onClick={(event) => { event.stopPropagation(); toggleSubmitted(item.adam); }}
            onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); toggleSubmitted(item.adam); } }}
          >{isMarked ? "✓ Υποβλήθηκε" : "Σήμανση προσφοράς"}</span>
        </span>
        <span className="alertCardHead"><strong>{item.title}</strong><span>{alertTab === "recent" && isWithinDays(item, 3) && <b className="newBadge">ΝΕΟ</b>}{formatDate(item.publicationDate ?? undefined)}</span></span>
        <span className="alertCardAuthority">{item.authority}</span>
        <span className="alertCardFacts">
          <span className="adamCopy" role="button" tabIndex={0} title="Αντιγραφή ΑΔΑΜ" onClick={(event) => copyAdam(item.adam, event)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); copyAdam(item.adam, event); } }}><b>ΑΔΑΜ</b>{copiedAdam === item.adam ? "Αντιγράφηκε!" : item.adam}</span>
          <span title={item.cpvs.map((cpv) => cpv.code).join(", ")}><b>CPV</b>{shownCpvs.map((cpv) => cpv.code).join(", ") || "—"}</span>
          <span><b>Π/Υ</b>{euro.format(item.budget)}</span>
          <span><b>Αποσφράγιση</b>{formatDate(item.openingDate ?? undefined)}</span>
          <span><b>Τύπος σύμβασης</b>{item.contractType ?? "—"}</span>
          <span><b>Τύπος εγγράφου</b>{item.documentType ? (documentTypeLabels[item.documentType] ?? item.documentType) : "—"}</span>
        </span>
      </button>;
      };

      return <article className="panel tablePanel">
      <PanelHeader title="Νέοι διαγωνισμοί" caption={`${number.format(recent.length + active.length + passed.length)} διαγωνισμοί από τις αρχές του 2026 στα CPV που παρακολουθείς`} onDownload={{ filename: "neoi-diagonismoi", title: "Νέοι διαγωνισμοί", headers: ["ΑΔΑΜ", "Τίτλος", "Αναθέτουσα Αρχή", "Π/Υ", "Αποσφράγιση", "Τύπος σύμβασης", "Τύπος εγγράφου"], rows: shownItems.map((item) => [item.adam, item.title, item.authority, item.budget, item.openingDate ?? "", item.contractType ?? "", item.documentType ? (documentTypeLabels[item.documentType] ?? item.documentType) : ""]), columnTypes: ["text", "text", "text", "currency", "date", "text", "text"] }} />
      <div className="alertAuthorityFilter">
        <MultiSearchInput
          label="Αναθέτουσα Αρχή"
          type="authority"
          values={authorityFilter}
          onChange={setAuthorityFilter}
          placeholder="Αναζητήστε Αναθέτουσα Αρχή"
        />
      </div>
      <div className="alertTabs">
        {tabs.map((tab) => <button type="button" key={tab.key} className={`alertTabBtn ${alertTab === tab.key ? "active" : ""}`} onClick={() => setAlertTab(tab.key)}>
          {tab.label} <span className="alertTabCount">{number.format(tab.items.length)}</span>
        </button>)}
      </div>
      {loading && <p className="noRows">Φόρτωση ειδοποιήσεων…</p>}
      {!loading && !alerts.length && <p className="noRows">Δεν βρέθηκαν νέοι διαγωνισμοί ακόμη.</p>}
      {!loading && alerts.length > 0 && !shownItems.length && <p className="noRows">Δεν υπάρχουν διαγωνισμοί σε αυτή την κατηγορία.</p>}
      {!loading && shownItems.length > 0 && <div className="alertList">{shownItems.map(renderCard)}</div>}
      {loadingTender && <p className="noRows">Φόρτωση στοιχείων διαγωνισμού…</p>}
    </article>;
    })()}
  </>;
}

