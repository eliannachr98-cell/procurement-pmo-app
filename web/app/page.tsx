"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type RefObject, type SyntheticEvent } from "react";
import "leaflet/dist/leaflet.css";
import { LayoutGrid, ClipboardList, TrendingUp, CircleUserRound, Tags, MapPin, Building2, Trophy } from "lucide-react";
import { captureChartImage, downloadExcel, downloadPdf, type ExportPayload } from "@/lib/exports";
import type { Apodeltiosi } from "@/lib/apodeltiosi";

type Status = "Ενεργός" | "Αξιολόγηση" | "Ανατεθειμένος" | "Συμβασιοποιημένος" | "Ακυρωμένος";
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
  extendedOpeningDate?: string;
  dateIssue?: boolean;
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
  partners?: string[];
  awardDate?: string;
  value: number;
  valueBasis?: string;
  noticeBudget?: number;
  noticeBudgetBasis?: string;
};
type Contract = {
  adam: string;
  awardAdam?: string;
  noticeAdam?: string;
  noticeTitle?: string;
  title: string;
  authority: string;
  cpv: string;
  cpvDescription?: string;
  contractor: string;
  contractorVat?: string;
  partners?: string[];
  signedDate?: string;
  deliveryDate?: string;
  value: number;
  valueBasis?: string;
  noticeBudget?: number;
  noticeBudgetBasis?: string;
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
  ["profile", CircleUserRound, "Προφίλ"],
] as const;

// Matched to the same hue families as the pastel Metric cards in Επισκόπηση
// (Ενεργός~mint, Αξιολόγηση~sand, Ανατεθειμένος~lilac, Συμβασιοποιημένος~sage,
// Ακυρωμένος~rose), just at full saturation instead of the pastel tint -
// they'd drifted apart (Συμβασιοποιημένος showed purple here vs green up there,
// Ανατεθειμένος showed blue here vs purple up there).
const statusTone: Record<Status, string> = {
  "Ενεργός": "teal",
  "Αξιολόγηση": "amber",
  "Ανατεθειμένος": "purple",
  "Συμβασιοποιημένος": "green",
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

type Competitor = {
  key: string; name: string; awards: number; contracts: number; value: number; lastDate: string | null; unionShare: number | null; avgBudget: number | null;
  discount: { count: number; average: number | null; median: number | null; positiveShare: number | null };
  monthly: { month: string; count: number }[];
  clients: { authority: string; count: number; awards: number; contracts: number; value?: number; share: number }[];
};
type CompetitorData = { competitors: Competitor[]; common: { authority: string; competitors: number; payments: number; keys: string[]; by?: { key: string; count: number }[] }[]; summary?: { discount: { count: number; median: number | null; average: number | null } } };

type MarketOverview = {
  empty?: boolean;
  tenders: number;
  tendersWithAwards: number;
  contractors: number;
  authorities?: number;
  awards: number;
  contracts: number;
  value: number;
  awardsValue?: number;
  contractsValue?: number;
  topContractors: { name: string; awards: number; contracts: number; total: number; value: number }[];
  topAuthorities: { authority: string; tenders: number; value: number }[];
  concentrationTop5: number | null;
  discount: { count: number; average: number | null; median: number | null; positiveShare: number | null };
  discountByType: { type: string | null; count: number; average: number }[];
  tracked?: { key: string; name: string; awards: number; contracts: number; value: number; discount: number | null }[];
  consulting?: {
    tenders: number; docs: number; value: number; big4Docs: number; big4Value: number;
    firms: { name: string; docs: number; value: number }[];
    others: { name: string; awards: number; contracts: number; value: number; discount: number | null }[];
  };
};

export default function Home() {
  const [tenders, setTenders] = useState<Tender[]>(fallbackTenders);
  const [awards, setAwards] = useState<Award[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [dashboard, setDashboard] = useState<DashboardBreakdown>(emptyDashboard);
  const [dashboardError, setDashboardError] = useState("");
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [marketOverview, setMarketOverview] = useState<MarketOverview | null>(null);
  const [marketOverviewState, setMarketOverviewState] = useState<"idle" | "loading" | "error">("idle");
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
  const [hideDirectAwards, setHideDirectAwards] = useState(false);
  // Lifted out of AlertsPanelContent so it survives switching to another tab
  // and back - that page unmounts/remounts on every tab change, which would
  // otherwise wipe free-mode watchlist picks (they're not persisted anywhere
  // else) exactly like a page refresh, just triggered by a tab click instead.
  const [alertsWatchlist, setAlertsWatchlist] = useState<WatchlistItem[]>([]);
  // Επισκόπηση: Διαγωνισμοί and Αγορά follow the "Όλη η αγορά / Τα ενδιαφέροντά μου"
  // switch; Ανταγωνισμός is always about the interests (CPV) of the profile.
  // watchlistReady holds the first requests back until the interests have loaded.
  const [overviewScope, setOverviewScope] = useState<"mine" | "all">("all");
  const [watchlistReady, setWatchlistReady] = useState(false);
  const [contractorWatch, setContractorWatch] = useState<{ contractor_key: string; contractor_label: string | null }[]>([]);
  const [authorityWatch, setAuthorityWatch] = useState<{ authority_name: string }[]>([]);
  const [competition, setCompetition] = useState<CompetitorData | null>(null);
  const [competitionState, setCompetitionState] = useState<"idle" | "loading" | "error">("idle");
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
  // Emoji picker for the Προφίλ avatar is hidden until the avatar itself is
  // clicked - deliberately set up as a menu-on-click so a future "or upload
  // a photo" option has a natural place to sit alongside emoji, instead of
  // permanently showing a whole grid of options under the avatar.
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
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
      setStatus("Όλες"); setAuthority(""); setContractor([]); setCpv([]); setYear("Όλα"); setContractType([]); setDocumentType("Όλοι"); setHideDirectAwards(false);
    }
    previousTeamCode.current = team.code;
  }, [team.code]);
  // Προφίλ needs the CPV/region watchlist counts even if the visitor never
  // opens Παρακολούθηση this session (that's the only other place that loads
  // them) - fetched independently here, on login, same endpoint
  // AlertsPanelContent's own load() already uses. The same response also
  // feeds the nav bell badge (count of matches published in the last 7
  // days, not yet awarded - the same window the "Πρόσφατοι" tab uses).
  // Submitted/interested counts and the email recipient list are also only
  // ever loaded inside AlertsPanelContent otherwise - fetched here too so
  // Προφίλ has them without requiring a prior visit to Παρακολούθηση.
  const [interestedCount, setInterestedCount] = useState(0);
  useEffect(() => {
    if (!team.code) {
      setAlertsWatchlist([]); setAlertsNutsFilter([]);
      setInterestedCount(0);
      setWatchlistReady(false); setContractorWatch([]); setAuthorityWatch([]);
      return;
    }
    const code = team.code;
    const headers = { "x-alert-code": code };
    // The interests alone load quickly; the alerts feed below does not, and
    // the Επισκόπηση must not wait for it.
    fetch("/api/watchlist", { headers })
      .then((response) => response.ok ? response.json() : { items: [] })
      .then((payload) => { setAlertsWatchlist(payload.items ?? []); setWatchlistReady(true); })
      .catch(() => setWatchlistReady(true));
    fetch("/api/contractor-watchlist", { headers })
      .then((response) => response.ok ? response.json() : { items: [] })
      .then((payload) => setContractorWatch(payload.items ?? []))
      .catch(() => {});
    fetch("/api/authority-watchlist", { headers })
      .then((response) => response.ok ? response.json() : { items: [] })
      .then((payload) => setAuthorityWatch(payload.items ?? []))
      .catch(() => {});
    fetch("/api/alerts", { headers })
      .then((response) => response.ok ? response.json() : { watchlist: [], nutsFilter: [], alerts: [] })
      .then((payload) => {
        if (payload.watchlist?.length) setAlertsWatchlist(payload.watchlist);
        setAlertsNutsFilter(payload.nutsFilter ?? []);
      })
      .catch(() => {});
    // A single real tender is often published as BOTH a Διακήρυξη and a
    // Προκήρυξη (two separate ΑΔΑΜ, same authority+budget) - the tracked
    // list intentionally shows both (nothing gets hidden there), but a raw
    // count of marked ΑΔΑΜ overstates how many distinct tenders that
    // actually is. Resolve to full details and count distinct
    // authority+budget pairs instead, matching how the email-candidate
    // pairing check already identifies the same real-world pair.
    Promise.all([
      fetch("/api/alert-submissions", { headers }).then((response) => response.ok ? response.json() : { items: [] }),
      fetch("/api/alert-interests", { headers }).then((response) => response.ok ? response.json() : { items: [] }),
    ]).then(([submissions, interests]) => {
      const submittedAdamsList: string[] = (submissions.items ?? []).map((item: { adam: string }) => item.adam);
      const interestedAdamsList: string[] = (interests.items ?? []).map((item: { adam: string }) => item.adam);
      const allAdams = [...new Set([...submittedAdamsList, ...interestedAdamsList])];
      if (!allAdams.length) { setInterestedCount(0); return; }
      const params = new URLSearchParams();
      allAdams.forEach((adam) => params.append("adam", adam));
      fetch(`/api/alert-tenders?${params.toString()}`)
        .then((response) => response.ok ? response.json() : { items: [] })
        .then((payload) => {
          const items: { adam: string; authority: string; budget: number }[] = payload.items ?? [];
          const distinctTenderKey = (adams: string[]) => {
            const submittedSet = new Set(adams);
            const keys = new Set(items.filter((item) => submittedSet.has(item.adam)).map((item) => `${item.authority}|${item.budget}`));
            return keys.size;
          };
          setInterestedCount(distinctTenderKey(interestedAdamsList));
        })
        .catch(() => {});
    }).catch(() => {});
  // Re-runs on login AND every time Προφίλ is opened (not just once) -
  // otherwise a submission/interest marked elsewhere mid-session left these
  // counts stuck at whatever they were when she first logged in.
  }, [team.code, page]);
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
    const filters = { year, authority, contractor, cpv, contractType, documentType, status, hideDirectAwards };
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
    if (typeof f.hideDirectAwards === "boolean") setHideDirectAwards(f.hideDirectAwards);
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
  // What is new in the followed CPVs/authorities/contractors since the previous
  // visit (kept per browser: sessionStorage holds the baseline for this
  // session, localStorage the time of the latest visit).
  const [interestNews, setInterestNews] = useState<{ cpv: number; authorities: number; contractors: number } | null>(null);
  const [visitBaseline, setVisitBaseline] = useState<string | null>(null);
  const syncShort = lastSync ? new Intl.DateTimeFormat("el-GR", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(lastSync)) : null;
  const newsLabel = (count?: number) => count === undefined ? "…" : count === 0 ? "Χωρίς νέα" : `${new Intl.NumberFormat("el-GR").format(count)} νέα`;
  const latestRequest = useRef(0);
  const latestDashboardRequest = useRef(0);
  const latestMarketOverviewRequest = useRef(0);
  const latestCompetitionRequest = useRef(0);
  // Ειδοποιήσεις has no filters and its own independent data - read via a
  // ref (not a dependency) so a plain tab switch never re-triggers the fetch
  // effect below, only an actual filter change does.
  const pageRef = useRef(page);
  useEffect(() => { pageRef.current = page; }, [page]);

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

  // What the profile follows. "Η αγορά μου" scopes the Επισκόπηση and the
  // Διαγωνισμοί list to it; with nothing followed (or "Όλη η αγορά") there is
  // nothing to scope by. scopeWaiting holds requests back until the followed
  // CPVs have loaded.
  const mineCodes = useMemo(() => team.code ? alertsWatchlist.map((item) => item.cpv_code) : [], [team.code, alertsWatchlist]);
  const mineAuthorities = useMemo(() => team.code ? authorityWatch.map((item) => item.authority_name) : [], [team.code, authorityWatch]);
  const trackKeys = useMemo(() => team.code ? contractorWatch.map((item) => item.contractor_key) : [], [team.code, contractorWatch]);
  const competitorLabels = useMemo(() => Object.fromEntries(contractorWatch.map((item) => [item.contractor_key, item.contractor_label ?? item.contractor_key])) as Record<string, string>, [contractorWatch]);
  const mineNuts = useMemo(() => team.code ? alertsNutsFilter.map((item) => item.nuts_code) : [], [team.code, alertsNutsFilter]);
  const scopeOn = (page === "overview" || page === "tenders") && overviewScope === "mine";
  const scopeCodes = useMemo(() => scopeOn ? mineCodes : [], [scopeOn, mineCodes]);
  // "Η αγορά μου" is the followed CPVs within the followed regions only; followed authorities and contractors do not widen it.
  const scopeAuthorities = useMemo<string[]>(() => [], []);
  const scopeContractors = useMemo<string[]>(() => [], []);
  const scopeNuts = useMemo(() => scopeOn ? mineNuts : [], [scopeOn, mineNuts]);
  const scopeWaiting = scopeOn && Boolean(team.code) && !watchlistReady;

  const loadTenderPage = useCallback((nextPage: number, append = false) => {
    if (scopeWaiting) return;
    const requestId = ++latestRequest.current;
    setLoading(true);
    const params = new URLSearchParams({ page: String(nextPage), pageSize: "100" });
    // Only the Αγορά page needs the awards/contracts rows of the list.
    if (page !== "market") params.set("lite", "1");
    if (query.trim()) params.set("q", query.trim());
    if (authority.trim() && authority !== "Όλες") params.set("authority", authority.trim());
    contractor.forEach((item) => params.append("contractor", item));
    cpv.forEach((item) => params.append("cpv", item));
    if (year !== "Όλα") params.set("year", year);
    contractType.forEach((item) => params.append("contractType", item));
    if (documentType !== "Όλοι") params.set("documentType", documentType);
    if (hideDirectAwards) params.set("hideDirectAwards", "true");
    scopeCodes.forEach((item) => params.append("watchCpv", item));
    scopeAuthorities.forEach((item) => params.append("watchAuthority", item));
    scopeContractors.forEach((item) => params.append("watchContractor", item));
    scopeNuts.forEach((item) => params.append("watchNuts", item));
    // Pages are intentionally small; users can continue through the complete
    // dataset without downloading the whole historical database at once.
    fetch(`/api/procurement?${params.toString()}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Δεν ήταν δυνατή η φόρτωση της Supabase");
        return response.json();
      })
      .then((payload) => {
        if (requestId !== latestRequest.current) return;
        setTenders((current) => {
          if (!append) return payload.tenders ?? [];
          const seen = new Set(current.map((item) => item.adam));
          return [...current, ...(payload.tenders ?? []).filter((item: Tender) => !seen.has(item.adam))];
        });
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
  }, [query, authority, contractor, cpv, year, contractType, documentType, hideDirectAwards, scopeCodes, scopeAuthorities, scopeContractors, scopeNuts, scopeWaiting, page]);

  // CPV codes of the profile's interests. Applied to Διαγωνισμοί/Αγορά only
  // while "Τα ενδιαφέροντά μου" is selected; with no interests there is nothing
  // to scope by and the whole market is shown.

  const loadDashboard = useCallback(() => {
    if (scopeWaiting) return;
    const requestId = ++latestDashboardRequest.current;
    const params = new URLSearchParams();
    if (authority.trim() && authority !== "Όλες") params.set("authority", authority.trim());
    contractor.forEach((item) => params.append("contractor", item));
    cpv.forEach((item) => params.append("cpv", item));
    scopeCodes.forEach((item) => params.append("watchCpv", item));
    scopeAuthorities.forEach((item) => params.append("watchAuthority", item));
    scopeContractors.forEach((item) => params.append("watchContractor", item));
    scopeNuts.forEach((item) => params.append("watchNuts", item));
    if (year !== "Όλα") params.set("year", year);
    contractType.forEach((item) => params.append("contractType", item));
    setDashboardLoading(true);
    fetch(`/api/dashboard?${params.toString()}`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("dashboard request failed")))
      .then((payload) => {
        if (requestId !== latestDashboardRequest.current) return;
        setDashboard(payload);
        setDashboardError("");
        setDashboardLoading(false);
      })
      .catch(() => {
        // A very broad, unfiltered-by-year combination can still time out
        // server-side - show nothing, but say so explicitly instead of a
        // silent "0", which reads as "no such tenders exist" and is wrong.
        if (requestId !== latestDashboardRequest.current) return;
        setDashboard(emptyDashboard);
        setDashboardError("Πολύ ευρύ φίλτρο για να υπολογιστεί - πρόσθεσε έτος ή άλλο φίλτρο για να στενέψει.");
        setDashboardLoading(false);
      });
  }, [authority, contractor, cpv, year, contractType, scopeCodes, scopeAuthorities, scopeContractors, scopeNuts, scopeWaiting]);

  const loadMarketOverview = useCallback(() => {
    if (scopeWaiting) return;
    const requestId = ++latestMarketOverviewRequest.current;
    const params = new URLSearchParams();
    if (authority.trim() && authority !== "Όλες") params.set("authority", authority.trim());
    contractor.forEach((item) => params.append("contractor", item));
    cpv.forEach((item) => params.append("cpv", item));
    scopeCodes.forEach((item) => params.append("watchCpv", item));
    scopeAuthorities.forEach((item) => params.append("watchAuthority", item));
    scopeContractors.forEach((item) => params.append("watchContractor", item));
    scopeNuts.forEach((item) => params.append("watchNuts", item));
    if (year !== "Όλα") params.set("year", year);
    contractType.forEach((item) => params.append("contractType", item));
    setMarketOverviewState("loading");
    fetch(`/api/market-overview?${params.toString()}`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("market overview request failed")))
      .then((payload) => {
        if (requestId !== latestMarketOverviewRequest.current) return;
        setMarketOverview(payload);
        setMarketOverviewState("idle");
      })
      .catch(() => {
        if (requestId !== latestMarketOverviewRequest.current) return;
        setMarketOverview(null);
        setMarketOverviewState("error");
      });
  }, [authority, contractor, cpv, year, contractType, scopeCodes, scopeAuthorities, scopeContractors, scopeNuts, scopeWaiting]);

  // Ανταγωνισμός is only about the contractors the profile follows (set in Προφίλ),
  // over the whole market - it does not depend on the CPV / region scope.
  const competitionNeedsFetch = page === "overview" && overviewScope === "mine" && Boolean(team.code) && watchlistReady && trackKeys.length > 0;
  const loadCompetition = useCallback(() => {
    const requestId = ++latestCompetitionRequest.current;
    const params = new URLSearchParams();
    trackKeys.forEach((item) => params.append("key", item));
    if (year !== "Όλα") params.set("year", year);
    setCompetitionState("loading");
    fetch(`/api/competitors?${params.toString()}`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("competition request failed")))
      .then((payload) => {
        if (requestId !== latestCompetitionRequest.current) return;
        setCompetition(payload);
        setCompetitionState("idle");
      })
      .catch(() => {
        if (requestId !== latestCompetitionRequest.current) return;
        setCompetition(null);
        setCompetitionState("error");
      });
  }, [year, trackKeys]);
  useEffect(() => {
    if (!competitionNeedsFetch) return;
    const timer = window.setTimeout(loadCompetition, 300);
    return () => window.clearTimeout(timer);
  }, [competitionNeedsFetch, loadCompetition]);

  useEffect(() => {
    if (page !== "profile" || !team.code || !watchlistReady || !visitBaseline) return;
    const baseline = visitBaseline;
    setInterestNews(null);
    fetch(`/api/interest-news?since=${baseline.slice(0, 10)}`, { headers: { "x-alert-code": team.code } })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => setInterestNews(payload && typeof payload.cpv === "number" ? payload : null))
      .catch(() => setInterestNews(null));
  }, [page, team.code, watchlistReady, visitBaseline, alertsWatchlist.length, authorityWatch.length, contractorWatch.length]);

  // Time of the previous visit, fixed for this session; tenders published since
  // then are marked ΝΕΟ. Kept per browser.
  useEffect(() => {
    if (!team.code) { setVisitBaseline(null); return; }
    let baseline = new Date(Date.now() - 7 * 86400000).toISOString();
    try {
      const stored = sessionStorage.getItem("tenderscope_visit_baseline");
      if (stored) {
        baseline = stored;
      } else {
        baseline = localStorage.getItem("tenderscope_last_visit") ?? baseline;
        sessionStorage.setItem("tenderscope_visit_baseline", baseline);
        localStorage.setItem("tenderscope_last_visit", new Date().toISOString());
      }
    } catch {
      // storage unavailable (private window): fall back to the last 7 days
    }
    setVisitBaseline(baseline);
  }, [team.code]);

  // Interest / submitted marks, shared by the Διαγωνισμοί list (same endpoints
  // and tables the Παρακολούθηση uses).
  const [markedInterested, setMarkedInterested] = useState<Set<string>>(new Set());
  const [markedSubmitted, setMarkedSubmitted] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!team.code) { setMarkedInterested(new Set()); setMarkedSubmitted(new Set()); return; }
    const headers = { "x-alert-code": team.code };
    fetch("/api/alert-interests", { headers }).then((response) => response.ok ? response.json() : { items: [] })
      .then((payload) => setMarkedInterested(new Set((payload.items ?? []).map((item: { adam: string }) => item.adam)))).catch(() => {});
    fetch("/api/alert-submissions", { headers }).then((response) => response.ok ? response.json() : { items: [] })
      .then((payload) => setMarkedSubmitted(new Set((payload.items ?? []).map((item: { adam: string }) => item.adam)))).catch(() => {});
  }, [team.code]);
  const toggleMark = (kind: "interest" | "submitted", adam: string) => {
    if (!team.code) return;
    const marked = kind === "interest" ? markedInterested : markedSubmitted;
    const setMarked = kind === "interest" ? setMarkedInterested : setMarkedSubmitted;
    const path = kind === "interest" ? "/api/alert-interests" : "/api/alert-submissions";
    const wasMarked = marked.has(adam);
    setMarked((current) => { const next = new Set(current); if (wasMarked) next.delete(adam); else next.add(adam); return next; });
    const request = wasMarked ? interestFetch(`${path}?adam=${encodeURIComponent(adam)}`, "DELETE") : interestFetch(path, "POST", { adam });
    request.then((ok) => {
      if (ok) return;
      // the save failed: undo the change in the screen
      setMarked((current) => { const next = new Set(current); if (wasMarked) next.add(adam); else next.delete(adam); return next; });
    });
  };
  // "Παρακολουθώ": anyone can follow a tender. Signed in, it is saved to the account
  // (the same table as the old "Ενδιαφέρον", shared by the team) and drives the updates
  // in Προφίλ; signed out, it is kept in this browser only and moved to the account on sign-in.
  const [guestFollowed, setGuestFollowed] = useState<Set<string>>(new Set());
  useEffect(() => {
    try { const raw = window.localStorage.getItem("tenderscope_followed"); if (raw) setGuestFollowed(new Set(JSON.parse(raw) as string[])); } catch { /* storage unavailable */ }
  }, []);
  const followed = team.code ? markedInterested : guestFollowed;
  const toggleFollow = (adam: string) => {
    if (team.code) { toggleMark("interest", adam); return; }
    setGuestFollowed((current) => {
      const next = new Set(current);
      if (next.has(adam)) next.delete(adam); else next.add(adam);
      try { window.localStorage.setItem("tenderscope_followed", JSON.stringify([...next])); } catch { /* storage unavailable */ }
      return next;
    });
  };
  const tenderMarks: TenderMarks = {
    followed,
    onFollow: toggleFollow,
    isNew: (tender) => Boolean(scopeOn && team.code && visitBaseline && tender.publicationDate && tender.publicationDate >= visitBaseline.slice(0, 10)),
  };

  // The CPV and region interests are managed from Προφίλ. Same endpoints as
  // the Παρακολούθηση used; the shared state keeps every page in sync.
  const interestFetch = (path: string, method: "POST" | "DELETE", body?: unknown) => fetch(path, {
    method,
    headers: { "x-alert-code": team.code ?? "", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }).then((response) => { if (response.status === 401) team.onUnauthorized(); return response.ok; });
  // On sign-in, what was followed while signed out is moved to the account.
  useEffect(() => {
    if (!team.code || guestFollowed.size === 0) return;
    const adams = [...guestFollowed];
    Promise.all(adams.map((adam) => interestFetch("/api/alert-interests", "POST", { adam }))).then(() => {
      setMarkedInterested((current) => new Set([...current, ...adams]));
      setGuestFollowed(new Set());
      try { window.localStorage.removeItem("tenderscope_followed"); } catch { /* storage unavailable */ }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team.code]);
  const addInterestCpv = (option: { value: string; label: string }) => {
    if (alertsWatchlist.some((item) => item.cpv_code === option.value)) return;
    interestFetch("/api/watchlist", "POST", { cpv_code: option.value, cpv_label: option.label })
      .then((ok) => { if (ok) setAlertsWatchlist((current) => [...current, { cpv_code: option.value, cpv_label: option.label }]); });
  };
  const removeInterestCpv = (cpvCode: string) => {
    interestFetch(`/api/watchlist?cpv_code=${encodeURIComponent(cpvCode)}`, "DELETE")
      .then((ok) => { if (ok) setAlertsWatchlist((current) => current.filter((item) => item.cpv_code !== cpvCode)); });
  };
  const addInterestNuts = (option: { value: string; label: string }) => {
    if (alertsNutsFilter.some((item) => item.nuts_code === option.value)) return;
    interestFetch("/api/alert-nuts-filter", "POST", { nuts_code: option.value, nuts_name: option.label })
      .then((ok) => { if (ok) setAlertsNutsFilter((current) => [...current, { nuts_code: option.value, nuts_name: option.label }]); });
  };
  const addInterestContractor = (option: { value: string; label: string }) => {
    if (contractorWatch.some((item) => item.contractor_key === option.value)) return;
    interestFetch("/api/contractor-watchlist", "POST", { contractor_key: option.value, contractor_label: option.label })
      .then((ok) => { if (ok) setContractorWatch((current) => [...current, { contractor_key: option.value, contractor_label: option.label }]); });
  };
  const removeInterestContractor = (key: string) => {
    interestFetch(`/api/contractor-watchlist?contractor_key=${encodeURIComponent(key)}`, "DELETE")
      .then((ok) => { if (ok) setContractorWatch((current) => current.filter((item) => item.contractor_key !== key)); });
  };
  const addInterestAuthority = (option: { value: string; label: string }) => {
    if (authorityWatch.some((item) => item.authority_name === option.value)) return;
    interestFetch("/api/authority-watchlist", "POST", { authority_name: option.value })
      .then((ok) => { if (ok) setAuthorityWatch((current) => [...current, { authority_name: option.value }]); });
  };
  const removeInterestAuthority = (name: string) => {
    interestFetch(`/api/authority-watchlist?authority_name=${encodeURIComponent(name)}`, "DELETE")
      .then((ok) => { if (ok) setAuthorityWatch((current) => current.filter((item) => item.authority_name !== name)); });
  };
  const removeInterestNuts = (nutsCode: string) => {
    interestFetch(`/api/alert-nuts-filter?nuts_code=${encodeURIComponent(nutsCode)}`, "DELETE")
      .then((ok) => { if (ok) setAlertsNutsFilter((current) => current.filter((item) => item.nuts_code !== nutsCode)); });
  };


  // Only the Επισκόπηση shows these numbers, so they're fetched there only
  // (and again whenever its filters change).
  useEffect(() => {
    if (page !== "overview" || dashboardLoading) return;
    const timer = window.setTimeout(loadMarketOverview, 500);
    return () => window.clearTimeout(timer);
  }, [page, loadMarketOverview, dashboardLoading]);

  useEffect(() => {
    // The tender list only depends on the filters, not on the Επισκόπηση scope.
    const timer = window.setTimeout(() => {
      // Ειδοποιήσεις has no filter UI and its own independent data fetch.
      if (pageRef.current !== "tenders" && pageRef.current !== "market") return;
      loadTenderPage(1);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [loadTenderPage, page]);

  // The Επισκόπηση numbers load one block at a time (Διαγωνισμοί first), so the
  // database is not asked for three heavy things at once. dashboardLoading is
  // raised right away so the other blocks wait for it.
  useEffect(() => {
    setDashboardLoading(true);
    const timer = window.setTimeout(loadDashboard, 500);
    return () => window.clearTimeout(timer);
  }, [loadDashboard]);


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
      (documentType === "Όλοι" || tender.documentType === documentType) &&
      (!hideDirectAwards || tender.procedureType !== DIRECT_AWARD_PROCEDURE);
  }), [tenders, query, status, authority, year, contractType, documentType, hideDirectAwards, page]);

  // Sorting and the "only tenders I follow" view of Διαγωνισμοί.
  const [tenderSort, setTenderSort] = useState<"newest" | "oldest" | "deadlineNear" | "deadlineFar">("newest");
  const [onlyFollowed, setOnlyFollowed] = useState(false);
  const [followedTenders, setFollowedTenders] = useState<Tender[]>([]);
  const [followedLoading, setFollowedLoading] = useState(false);
  useEffect(() => {
    if (!onlyFollowed || page !== "tenders") return;
    const adams = [...followed].slice(0, 100);
    if (!adams.length) { setFollowedTenders([]); return; }
    let cancelled = false;
    setFollowedLoading(true);
    fetch(`/api/procurement?page=1&pageSize=100&adams=${encodeURIComponent(adams.join(","))}`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("offers")))
      .then((payload) => { if (!cancelled) setFollowedTenders(payload.tenders ?? []); })
      .catch(() => { if (!cancelled) setFollowedTenders([]); })
      .finally(() => { if (!cancelled) setFollowedLoading(false); });
    return () => { cancelled = true; };
  }, [onlyFollowed, page, followed]);
  const shownTenders = useMemo(() => {
    const source = onlyFollowed ? followedTenders.filter((tender) => followed.has(tender.adam)) : filtered;
    const opening = (tender: Tender) => tender.openingDate && !tender.dateIssue ? tender.openingDate : "";
    const published = (tender: Tender) => tender.publicationDate ?? "";
    const desc = (a: string, b: string) => b.localeCompare(a);
    // A missing deadline always goes last, whichever way the list is sorted.
    const byOpening = (a: Tender, b: Tender, direction: 1 | -1) => {
      const left = opening(a); const right = opening(b);
      if (!left && !right) return 0;
      if (!left) return 1;
      if (!right) return -1;
      return direction * left.localeCompare(right);
    };
    return [...source].sort((a, b) => {
      if (tenderSort === "oldest") return published(a).localeCompare(published(b)) || byOpening(a, b, 1);
      if (tenderSort === "deadlineNear") return byOpening(a, b, 1) || desc(published(a), published(b));
      if (tenderSort === "deadlineFar") return byOpening(a, b, -1) || desc(published(a), published(b));
      return desc(published(a), published(b)) || byOpening(a, b, -1);
    });
  }, [filtered, onlyFollowed, followedTenders, followed, tenderSort]);

  const documentTypes = Object.entries(documentTypeLabels);
  const statusCount = (value: Status) => dashboard.status.find((item) => item.status === value)?.count ?? 0;
  const statusBudget = (value: Status) => dashboard.status.find((item) => item.status === value)?.budget ?? 0;
  const totalBudget = dashboard.status.reduce((sum, item) => sum + item.budget, 0);

  // The switch is always shown. "Η Αγορά μου" needs a sign-in and saved CPV preferences; until then the whole market is shown with a note saying why.
  const scopeNote = overviewScope !== "mine" ? null
    : !team.code ? <>Συνδέσου για να δεις την Αγορά σου, με βάση τα CPV και τις περιοχές που αποθηκεύεις στο Προφίλ. Μέχρι τότε εμφανίζεται όλη η αγορά.</>
    : watchlistReady && alertsWatchlist.length === 0 ? <>{mineNuts.length > 0 ? "Έχεις αποθηκεύσει περιοχές αλλά κανένα CPV." : "Δεν έχεις αποθηκεύσει προτιμήσεις (CPV και περιοχές)."} Πρόσθεσέ τες στο Προφίλ για να δεις την Αγορά σου. Μέχρι τότε εμφανίζεται όλη η αγορά. <button type="button" className="profileLink" onClick={() => setPage("profile")}>Πήγαινε στο Προφίλ →</button></>
    : null;
  const scopeBar = (
            <div className="overviewScope">
              <div className="overviewScopeToggle" data-scope={overviewScope} role="group" aria-label="Εύρος Διαγωνισμών και Αγοράς"><span className="scopeThumb" aria-hidden="true" />
                <button type="button" className={overviewScope === "all" ? "active" : ""} onClick={() => setOverviewScope("all")}>Όλη η Αγορά</button>
                <button type="button" className={overviewScope === "mine" ? "active" : ""} onClick={() => setOverviewScope("mine")}>Η Αγορά μου</button>
              </div>
              {scopeNote && <p className="overviewScopeNote">{scopeNote}</p>}
            </div>
  );

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brandMark">⌖</span>
          <span><strong>TenderScope</strong><small>Ελληνικό Παρατηρητήριο Δημοσίων Συμβάσεων</small></span>
        </div>
        <nav aria-label="Κύρια πλοήγηση">
          <div className="navMain">
            {navItems.filter(([id]) => id !== "profile").map(([id, Icon, label]) => (
              <button key={id} className={page === id ? "active" : ""} onClick={() => setPage(id)}>
                <span>
                  <Icon size={16} strokeWidth={2.25} />
                </span>{label}
              </button>
            ))}
          </div>
          <div className="navProfileCol">
            {navItems.filter(([id]) => id === "profile").map(([id, Icon, label]) => (
              <button key={id} className={page === id ? "active" : ""} onClick={() => setPage(id)}>
                <span><Icon size={16} strokeWidth={2.25} /></span>{label}
              </button>
            ))}
            {team.code !== undefined && <TeamCodeBar team={team} />}
          </div>
        </nav>
      </header>

      {/* One shared login control for the whole app instead of a separate
          copy on Ειδοποιήσεις and Αγορά - always visible so its state can
          never be out of sync with itself. Sits below the tab row, same
          spot regardless of which tab is active. */}

      <div className="pageTitle pageTitleRow">
            <div><p className="eyebrow">PROCUREMENT INTELLIGENCE</p><h1>{page === "overview" ? "Επισκόπηση" : page === "tenders" ? "Διαγωνισμοί" : page === "market" ? "Αγορά & Ανταγωνισμός" : page === "profile" ? "Προφίλ" : "Παρακολούθηση"}</h1></div>
        <div className="pageTitleTools">
            {page === "tenders" && <label className="search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Αναζήτηση με ΑΔΑΜ ή τίτλο…" /></label>}
          {(page === "overview" || page === "tenders") && scopeBar}
        </div>
      </div>
      <div className={`workspace${page === "profile" ? " workspaceFull" : ""}${page === "tenders" || page === "overview" ? " tendersWorkspace" : ""}`}>
        <section className="content">
          {loading && tenders.length === 0 && <div className="dataBanner">Φόρτωση πραγματικών δεδομένων από Supabase…</div>}
          {dataError && <div className="dataBanner error">{dataError} · εμφανίζεται προσωρινό δείγμα.</div>}
          {page === "overview" && dashboardError && <div className="dataBanner error">{dashboardError}</div>}

          {page === "overview" && <>
            <div className={`overviewWrap${dashboardLoading ? " isLoading" : ""}`}>
            <div className="overviewBlock">
            <section className="overviewSection"><h2 className="overviewHeading">Διαγωνισμοί</h2>
            <div className="metrics statusMetrics">
              <Metric label="Διαγωνισμοί" value={number.format(dashboard.total)} sub={`Π/Υ: ${euro.format(totalBudget)}`} tone="sky" />
              <Metric label="Ενεργοί" value={number.format(statusCount("Ενεργός"))} sub={`Π/Υ: ${euro.format(statusBudget("Ενεργός"))}`} tone="mint" />
              <Metric label="Σε αξιολόγηση" value={number.format(statusCount("Αξιολόγηση"))} sub={`Π/Υ: ${euro.format(statusBudget("Αξιολόγηση"))}`} tone="sand" />
              <Metric label="Ανατεθειμένοι" value={number.format(statusCount("Ανατεθειμένος"))} sub={`Π/Υ: ${euro.format(statusBudget("Ανατεθειμένος"))}`} tone="lilac" />
              <Metric label="Συμβασιοποιημένοι" value={number.format(statusCount("Συμβασιοποιημένος"))} sub={`Π/Υ: ${euro.format(statusBudget("Συμβασιοποιημένος"))}`} tone="sage" />
              <Metric label="Ακυρωμένοι" value={number.format(statusCount("Ακυρωμένος"))} sub={`Π/Υ: ${euro.format(statusBudget("Ακυρωμένος"))}`} tone="rose" />
            </div>
            <div className="overviewSplit">
              <article className="panel monthlyTablePanel"><PanelHeader title="Διαγωνισμοί ανά μήνα" caption="Πλήθος, Π/Υ, CPV και αναθέτουσες/διενεργούσες αρχές ανά μήνα δημοσίευσης" onDownload={{ filename: "diagonismoi-ana-mina", title: "Διαγωνισμοί ανά μήνα", headers: ["Μήνας", "Διαγωνισμοί", "Συνολική αξία", "CPV", "Αναθέτουσες/Διενεργούσες Αρχές"], rows: dashboard.monthly.map((item) => [`${item.month}-01`, item.count, item.budget, item.cpv, item.authorities]), columnTypes: ["month", "number", "currency", "number", "number"] }} /><MonthlyTable months={dashboard.monthly} /></article>
            <NutsMap counts={dashboard.nuts} />
            </div>
            </section>
            <div className="overviewJump"><button type="button" onClick={() => setPage("tenders")}>{team.code && overviewScope === "mine" ? "Δες τους διαγωνισμούς της αγοράς μου →" : "Δες όλους τους διαγωνισμούς →"}</button></div>
            </div>
            <div className="overviewBlock">
            <h2 className="overviewHeading overviewBlockTitle">Αγορά &amp; Ανταγωνισμός</h2>
            <section className="overviewSection"><h3 className="overviewSubheading">Αγορά</h3><OverviewMarket data={marketOverview} state={marketOverviewState} /></section>
            <section className="overviewSection"><h3 className="overviewSubheading">Ανταγωνισμός <span className="overviewHeadingNote">για τους αναδόχους που ακολουθείς</span></h3>
              {overviewScope === "mine"
                ? <OverviewCompetition data={competition} state={competitionState} signedIn={Boolean(team.code)} ready={watchlistReady} hasKeys={trackKeys.length > 0} onProfile={() => setPage("profile")} labels={competitorLabels} />
                : <p className="noRows">{team.code
                  ? <>Επίλεξε αναδόχους στο Προφίλ για να δεις τον ανταγωνισμό τους. <button type="button" className="profileLink" onClick={() => setPage("profile")}>Πήγαινε στο Προφίλ →</button>{trackKeys.length > 0 && <> Ο ανταγωνισμός των αναδόχων που ακολουθείς φαίνεται στη «Η Αγορά μου». <button type="button" className="profileLink" onClick={() => setOverviewScope("mine")}>Δες τον →</button></>}</>
                  : <>Συνδέσου και επίλεξε αναδόχους στο Προφίλ για να δεις τον ανταγωνισμό τους.</>}</p>}
            </section>
            <div className="overviewJump"><button type="button" onClick={() => setPage("market")}>Δες Αγορά &amp; Ανταγωνισμός →</button></div>
            </div>
            </div>
          </>}

          {page === "tenders" && <>
            <div className="tenderToolbar">
              <label>Ταξινόμηση<select value={tenderSort} onChange={(event) => setTenderSort(event.target.value as typeof tenderSort)}>
                <option value="newest">Νεότερα πρώτα (δημοσίευση)</option>
                <option value="oldest">Παλαιότερα πρώτα (δημοσίευση)</option>
                <option value="deadlineNear">Πιο κοντινή αποσφράγιση</option>
                <option value="deadlineFar">Πιο μακρινή αποσφράγιση</option>
              </select></label>
              <label className="checkboxRow"><input type="checkbox" checked={onlyFollowed} onChange={(event) => setOnlyFollowed(event.target.checked)} />Μόνο όσα παρακολουθώ</label>
            </div>
            <TenderTable rows={shownTenders} expanded marks={tenderMarks} loading={onlyFollowed ? followedLoading : loading} />
            {!onlyFollowed && hasMore && <button className="viewAll" disabled={loading} onClick={() => loadTenderPage(loadedPage + 1, true)}>
              {loading ? "Φόρτωση…" : `Φόρτωση περισσότερων (${number.format(tenders.length)} από ${number.format(totalTenders)})`}
            </button>}
          </>}
          {page === "market" && <MarketPanel awards={awards} contracts={contracts} cpv={cpv} contractor={contractor} authority={authority} year={year} contractType={contractType} documentType={documentType} loadedCount={tenders.length} totalCount={totalTenders} stillLoading={hasMore && loading} locked={!team.code} selectedContractor={marketSelectedContractor} setSelectedContractor={setMarketSelectedContractor} contractorSearch={marketContractorSearch} setContractorSearch={setMarketContractorSearch} visibleCount={marketVisibleCount} setVisibleCount={setMarketVisibleCount} />}
          {page === "profile" && <div className="profileGrid">
            <article className="panel profileCard profileAccountCard">
              <p className="eyebrow">ΛΟΓΑΡΙΑΣΜΟΣ</p>
              <div className="profileHeaderMain">
                <button
                  type="button"
                  className="profileAvatar"
                  disabled={!team.code}
                  title={team.code ? "Άλλαξε avatar" : undefined}
                  onClick={() => setAvatarPickerOpen((open) => !open)}
                >
                  {team.code && team.teamAvatar ? <span className="profileAvatarEmoji">{team.teamAvatar}</span> : <CircleUserRound size={46} strokeWidth={1.75} />}
                </button>
                {team.code
                  ? <p className="profileStatusOn">{team.teamName || "Ο λογαριασμός σου"}</p>
                  : <p className="profileStatusOff">Δεν είσαι συνδεδεμένη — οι Προβολές και η Παρακολούθηση χρειάζονται σύνδεση.</p>}
              </div>
              {team.code && avatarPickerOpen && <>
                <p className="watchlistCaption">Διάλεξε emoji</p>
                <div className="profileEmojiPicker">
                  {AVATAR_OPTIONS.map((emoji) => (
                    <button type="button" key={emoji} className={`profileEmojiOption ${team.teamAvatar === emoji ? "active" : ""}`} disabled={team.avatarSaving} onClick={() => { team.updateAvatar(emoji); setAvatarPickerOpen(false); }}>{emoji}</button>
                  ))}
                </div>
                {team.avatarError && <p className="recipientError">{team.avatarError}</p>}
              </>}
              {lastSync && <p className="profileHeaderSync">Ενημέρωση δεδομένων<strong>{new Intl.DateTimeFormat("el-GR", { dateStyle: "short", timeStyle: "short" }).format(new Date(lastSync))}</strong></p>}
            </article>
            <article className="panel profileCard profileWatchCard">
              <p className="eyebrow">ΕΝΔΙΑΦΕΡΟΝΤΑ</p>
              <h2>Τι ακολουθείς</h2>
              {team.code ? <>
                <p className="watchlistCaption">Όσα ορίσεις εδώ καθορίζουν την Επισκόπηση («Η αγορά μου», Ανταγωνισμός) και τις ειδοποιήσεις.</p>
                <div className="interestGrid">
                  <section className="interestBox">
                    <header className="interestBoxHead"><span className="interestIcon"><Tags size={18} /></span><div><h3>CPV</h3><p>Κατηγορίες διαγωνισμών</p></div><span className="interestMeta"><em>{newsLabel(interestNews?.cpv)}</em>{syncShort && <small>Ενημ. {syncShort}</small>}</span><b className="interestCount">{number.format(alertsWatchlist.length)}</b></header>
                    <MultiSearchInput
                      label="Προσθήκη"
                      type="cpv"
                      values={alertsWatchlist.map((item) => item.cpv_code)}
                      initialLabels={Object.fromEntries(alertsWatchlist.map((item) => [item.cpv_code, item.cpv_label ?? item.cpv_code]))}
                      onChange={(nextValues) => {
                        const removed = alertsWatchlist.map((item) => item.cpv_code).find((code) => !nextValues.includes(code));
                        if (removed) removeInterestCpv(removed);
                      }}
                      onSelectOption={addInterestCpv}
                      placeholder="Κωδικός ή περιγραφή CPV"
                    />
                  </section>
                  <section className="interestBox">
                    <header className="interestBoxHead"><span className="interestIcon"><MapPin size={18} /></span><div><h3>Περιοχές</h3><p>Για τις ειδοποιήσεις</p></div><span className="interestMeta">{syncShort && <small>Ενημ. {syncShort}</small>}</span><b className="interestCount">{number.format(alertsNutsFilter.length)}</b></header>
                    <MultiSearchInput
                      label="Προσθήκη"
                      type="nuts"
                      values={alertsNutsFilter.map((item) => item.nuts_code)}
                      initialLabels={Object.fromEntries(alertsNutsFilter.map((item) => [item.nuts_code, item.nuts_name ?? item.nuts_code]))}
                      onChange={(nextValues) => {
                        const removed = alertsNutsFilter.map((item) => item.nuts_code).find((code) => !nextValues.includes(code));
                        if (removed) removeInterestNuts(removed);
                      }}
                      onSelectOption={addInterestNuts}
                      placeholder="π.χ. Αττική (κενό = όλη η χώρα)"
                    />
                  </section>
                  <section className="interestBox">
                    <header className="interestBoxHead"><span className="interestIcon"><Building2 size={18} /></span><div><h3>Αναθέτουσες αρχές</h3><p>Παρακολούθηση αρχών (θα φαίνονται στην Αγορά)</p></div><span className="interestMeta"><em>{newsLabel(interestNews?.authorities)}</em>{syncShort && <small>Ενημ. {syncShort}</small>}</span><b className="interestCount">{number.format(authorityWatch.length)}</b></header>
                    <MultiSearchInput
                      label="Προσθήκη"
                      type="authority"
                      values={authorityWatch.map((item) => item.authority_name)}
                      onChange={(nextValues) => {
                        const removed = authorityWatch.map((item) => item.authority_name).find((name) => !nextValues.includes(name));
                        if (removed) removeInterestAuthority(removed);
                      }}
                      onSelectOption={addInterestAuthority}
                      placeholder="Όνομα αναθέτουσας αρχής"
                    />
                  </section>
                  <section className="interestBox">
                    <header className="interestBoxHead"><span className="interestIcon"><Trophy size={18} /></span><div><h3>Ανάδοχοι</h3><p>Ανταγωνιστές που παρακολουθείς</p></div><span className="interestMeta"><em>{newsLabel(interestNews?.contractors)}</em>{syncShort && <small>Ενημ. {syncShort}</small>}</span><b className="interestCount">{number.format(contractorWatch.length)}</b></header>
                    <MultiSearchInput
                      label="Προσθήκη"
                      type="contractor"
                      values={contractorWatch.map((item) => item.contractor_key)}
                      initialLabels={Object.fromEntries(contractorWatch.map((item) => [item.contractor_key, item.contractor_label ?? item.contractor_key]))}
                      onChange={(nextValues) => {
                        const removed = contractorWatch.map((item) => item.contractor_key).find((key) => !nextValues.includes(key));
                        if (removed) removeInterestContractor(removed);
                      }}
                      onSelectOption={addInterestContractor}
                      placeholder="Όνομα ή ΑΦΜ αναδόχου"
                    />
                  </section>
                </div>
                <div className="profileDivider" />
                <p className="eyebrow">ΔΡΑΣΤΗΡΙΟΤΗΤΑ</p>
                <div className="metrics profileMetrics">
                  <Metric label="Διαγωνισμοί που παρακολουθώ" value={number.format(interestedCount)} tone="lilac" />
                </div>
              </> : <p className="watchlistCaption">Συνδέσου για να ορίσεις τι ακολουθείς.</p>}
            </article>
            <ProfileTools code={team.code ?? null} onUnauthorized={team.onUnauthorized} />
          </div>}
        </section>

        {/* Ειδοποιήσεις is a CPV watch-list/alert feed, not a filtered view of the
            database - the regular filters don't apply to it at all. */}
        {page !== "profile" && <aside className="filters">
          <div className="filterHeading"><div><span>Φίλτρα</span><small>{page === "overview" ? `${number.format(dashboard.total || totalTenders)} διαγωνισμοί` : `${number.format(tenders.length)} φορτωμένα · ${number.format(dashboard.total || totalTenders)} συνολικά`}</small></div><button title={loading ? "Φόρτωση…" : "Επαναφορά φίλτρων"} onClick={() => { setStatus("Όλες"); setAuthority(""); setContractor([]); setCpv([]); setQuery(""); setYear("Όλα"); setContractType([]); setDocumentType("Όλοι"); setHideDirectAwards(false); }}><span className={loading ? "spinIcon" : ""}>↻</span></button></div>
          <label>Έτος<select value={year} onChange={(event) => setYear(event.target.value)}><option>Όλα</option>{years.map((item) => <option key={item}>{item}</option>)}</select></label>
          <SingleSearchInput label="Αναθέτουσα/Διενεργούσα Αρχή" type="authority" value={authority === "Όλες" ? "" : authority} onChange={setAuthority} placeholder="Γράψε ή επίλεξε αρχή" />
          <MultiSearchInput label="Ανάδοχος" type="contractor" values={contractor} onChange={setContractor} placeholder="Αναζήτησε και επίλεξε αναδόχους" />
          <MultiSearchInput label="CPV" type="cpv" values={cpv} onChange={setCpv} placeholder="Αναζήτησε κωδικό ή περιγραφή CPV" />
          <CheckboxDropdown label="Τύπος σύμβασης" options={contractTypeOptions} values={contractType} onChange={setContractType} />
          {/* A tender's document-type/status describe the notice's own lifecycle - awards and
              contracts always attach to the original declaration, never to a follow-up document
              or a not-yet-awarded status, so these two never apply anything meaningful here. */}
          {page !== "market" && <label>Τύπος εγγράφου<select value={documentType} onChange={(event) => setDocumentType(event.target.value)}><option value="Όλοι">Όλοι</option>{documentTypes.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
          {page !== "market" && <label>Κατάσταση<select value={status} onChange={(event) => setStatus(event.target.value)}><option>Όλες</option>{Object.keys(statusTone).map((item) => <option key={item}>{item}</option>)}</select></label>}
          {page !== "market" && <label className="checkboxRow"><input type="checkbox" checked={hideDirectAwards} onChange={(event) => setHideDirectAwards(event.target.checked)} />Απόκρυψη απευθείας αναθέσεων</label>}
          <div className="filterNote"><span>i</span><p>{page === "market"
            ? "Τύπος εγγράφου και Κατάσταση δεν εφαρμόζονται εδώ - αφορούν το στάδιο της ίδιας της διακήρυξης, όχι τις αναθέσεις/συμβάσεις. Εμφανίζονται μόνο αναθέσεις και συμβάσεις που συνδέονται με διακήρυξη."
            : "Τα ίδια φίλτρα εφαρμόζονται στην Επισκόπηση και στους Διαγωνισμούς."}</p></div>
        </aside>}
      </div>
    </main>
  );
}

function Metric({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: string }) {
  return <article className={`metric ${tone}`}><div className="metricMain"><span>{label}</span><strong>{value}</strong></div>{sub && <small>{sub}</small>}</article>;
}

// Click-to-copy ΑΔΑΜ, used everywhere a tender/award/contract code is shown
// (Επισκόπηση/Διαγωνισμοί table, καρτέλα διαγωνισμού, Αγορά's award/contract
// tables, Παρακολούθηση cards) - self-contained local "copied" state so any
// number of instances on the same page work independently of each other.
function AdamCopy({ adam, label, className = "adamCopy" }: { adam: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = (event: SyntheticEvent) => {
    event.stopPropagation();
    const onCopied = () => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
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
  };
  return <span
    className={className}
    role="button"
    tabIndex={0}
    title="Αντιγραφή ΑΔΑΜ"
    onClick={handleCopy}
    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); handleCopy(event); } }}
  >
    {label && <b>{label}</b>}
    {copied ? "Αντιγράφηκε!" : adam}
  </span>;
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

const percentText = (value: number | null | undefined) => value === null || value === undefined ? "—" : `${value.toFixed(1).replace(".", ",")}%`;

// Counts only (no amounts): tenders, contractors, authorities, awards, contracts.
function MarketCounts({ data, tenders = true, values = false }: { data: MarketOverview; tenders?: boolean; values?: boolean }) {
  return <div className="metrics statusMetrics">
    {tenders && <Metric label="Διαγωνισμοί" value={number.format(data.tenders)} tone="sand" />}
    <Metric label="Ανάδοχοι" value={number.format(data.contractors)} tone="sky" />
    <Metric label="Αναθέτουσες/Διενεργούσες Αρχές" value={data.authorities === undefined ? "—" : number.format(data.authorities)} tone="mint" />
    <Metric label="Αναθέσεις" value={number.format(data.awards)} tone="lilac" sub={values && data.awardsValue !== undefined ? `Αξία: ${euro.format(data.awardsValue)}` : undefined} />
    <Metric label="Συμβάσεις" value={number.format(data.contracts)} tone="sky" sub={values && data.contractsValue !== undefined ? `Αξία: ${euro.format(data.contractsValue)}` : undefined} />
  </div>;
}


function OverviewMarket({ data, state }: { data: MarketOverview | null; state: "idle" | "loading" | "error" }) {
  if (state === "error") return <p className="noRows">Δεν υπάρχουν ακόμα υπολογισμένα στοιχεία για αυτό το φίλτρο - δοκίμασε άλλο Έτος ή πρόσθεσε Αναθέτουσα/Διενεργούσα Αρχή, CPV ή Ανάδοχο.</p>;
  if (!data) return <p className="noRows">{state === "loading" ? "Φόρτωση…" : "Δεν υπάρχουν δεδομένα."}</p>;
  if (data.empty) return <p className="noRows">Δεν υπάρχουν δεδομένα για τα τρέχοντα φίλτρα.</p>;
  return <>
    <MarketCounts data={data} tenders={false} values />
    <div className="overviewTables">
      <article className="panel"><PanelHeader title="Ανάδοχοι" caption={`${number.format(data.contractors)} ανάδοχοι · κατά σύνολο αναθέσεων και συμβάσεων${data.contractors > data.topContractors.length ? ` · εμφανίζονται οι ${number.format(data.topContractors.length)} πρώτοι` : ""}`} />
        <div className="tableScroll"><table><thead><tr><th>Ανάδοχος</th><th>Σύνολο</th><th>Αναθέσεις</th><th>Συμβάσεις</th><th>Αξία</th></tr></thead>
          <tbody>{data.topContractors.map((item) => { const total = item.total ?? item.awards + item.contracts; return <tr key={item.name}><td>{item.name}</td><td><b>{number.format(total)}</b></td><td>{number.format(item.awards)}</td><td>{number.format(item.contracts)}</td><td>{euro.format(item.value)}</td></tr>; })}</tbody></table>
          {!data.topContractors.length && <p className="noRows">Δεν υπάρχουν αναθέσεις ή συμβάσεις.</p>}</div></article>
      <article className="panel"><PanelHeader title="Αναθέτουσες/Διενεργούσες Αρχές" caption={`${number.format(data.authorities ?? data.topAuthorities.length)} αρχές · κατά αριθμό διαγωνισμών${(data.authorities ?? 0) > data.topAuthorities.length ? ` · εμφανίζονται οι ${number.format(data.topAuthorities.length)} πρώτες` : ""}`} />
        <div className="tableScroll"><table><thead><tr><th>Αναθέτουσα/Διενεργούσα Αρχή</th><th>Διαγωνισμοί</th><th>Αξία</th></tr></thead>
          <tbody>{data.topAuthorities.map((item) => <tr key={item.authority}><td>{item.authority}</td><td><b>{number.format(item.tenders)}</b></td><td title={item.value > 0 ? undefined : "Κανένας διαγωνισμός της αρχής δεν έχει ακόμα ανάθεση ή σύμβαση"}>{item.value > 0 ? euro.format(item.value) : "—"}</td></tr>)}</tbody></table>
          {!data.topAuthorities.length && <p className="noRows">Δεν υπάρχουν αναθέσεις ή συμβάσεις.</p>}</div></article>
    </div>
  </>;
}

// A contractor's short name: everything before the first legal-form word
// ("ΑΝΩΝΥΜΗ", "ΜΟΝΟΠΡΟΣΩΠΗ", "ΑΕ", "ΟΡΚΩΤΟΙ", "ΣΥΜΒΟΥΛΟΙ" ...), e.g.
// "KPMG ΟΡΚΩΤΟΙ ΕΛΕΓΚΤΕΣ ΑΝΩΝΥΜΗ ΕΤΑΙΡΕΙΑ" -> "KPMG".
const LEGAL_WORDS = new Set(["ΑΝΩΝΥΜΗ", "ΑΝΩΝΥΜΟΣ", "ΜΟΝΟΠΡΟΣΩΠΗ", "ΕΤΑΙΡΕΙΑ", "ΕΤΑΙΡΙΑ", "ΑΕ", "AE", "ΑΕΒΕ", "ΟΕ", "ΕΠΕ", "ΙΚΕ", "ΟΡΚΩΤΟΙ", "ΟΡΚΩΤΩΝ", "ΣΥΜΒΟΥΛΟΙ", "ΠΑΡΟΧΗΣ", "ΛΟΓΙΣΤΕΣ"]);
function shortName(name: string) {
  const kept: string[] = [];
  for (const word of name.replace(/\s+/g, " ").trim().split(" ")) {
    const bare = word.toLocaleUpperCase("el").replace(/[.,]/g, "");
    if (kept.length > 0 && LEGAL_WORDS.has(bare)) break;
    kept.push(word);
  }
  const short = kept.join(" ").replace(/[\s,\-–]+$/, "").trim();
  return short || name;
}

function OverviewCompetition({ data, state, signedIn, ready, hasKeys, onProfile, labels }: { data: CompetitorData | null; state: "idle" | "loading" | "error"; signedIn: boolean; ready: boolean; hasKeys: boolean; onProfile: () => void; labels: Record<string, string> }) {
  const [open, setOpen] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [onlyCommon, setOnlyCommon] = useState(false);
  if (!signedIn) return <p className="noRows">Συνδέσου και πρόσθεσε αναδόχους στο Προφίλ για να δεις τον ανταγωνισμό τους.</p>;
  if (ready && !hasKeys) return <p className="noRows">Δεν ακολουθείς ακόμα κάποιον ανάδοχο. Πρόσθεσέ τους στο Προφίλ. <button type="button" className="profileLink" onClick={onProfile}>Πήγαινε στο Προφίλ →</button></p>;
  if (state === "error") return <p className="noRows">Δεν φορτώθηκαν τα στοιχεία των αναδόχων - δοκίμασε ξανά.</p>;
  if (!data) return <p className="noRows">Φόρτωση…</p>;
  const total = data.competitors.reduce((sum, item) => sum + item.value, 0);
  // A followed contractor with no awards/contracts yet comes back without a name (just its key): use the label saved in Προφίλ.
  const displayName = (item: Competitor) => item.name !== item.key ? item.name : (labels[item.key] ?? item.name);
  const nameOf = (key: string) => { const item = data.competitors.find((entry) => entry.key === key); return item ? displayName(item) : (labels[key] ?? key); };
  // Σύγκριση: two contractors side by side, authority by authority. Starts with the two of the biggest value.
  const defaultPair = [...data.competitors].sort((x, y) => y.value - x.value).slice(0, 2).map((item) => item.key);
  const chosen = (picked.length > 0 ? picked : defaultPair).filter((key) => data.competitors.some((item) => item.key === key)).slice(0, 2);
  type AuthorityTotals = { awards: number; contracts: number; value: number };
  const totalsFor = (key: string | undefined) => {
    const map = new Map<string, AuthorityTotals>();
    const item = data.competitors.find((entry) => entry.key === key);
    for (const client of item?.clients ?? []) map.set(client.authority, { awards: client.awards, contracts: client.contracts, value: client.value ?? 0 });
    return map;
  };
  const comparing = chosen.length === 2;
  const mapA = totalsFor(chosen[0]);
  const mapB = totalsFor(chosen[1]);
  const empty: AuthorityTotals = { awards: 0, contracts: 0, value: 0 };
  const authorityRows = comparing ? [...new Set([...mapA.keys(), ...mapB.keys()])]
    .filter((authority) => !onlyCommon || (mapA.has(authority) && mapB.has(authority)))
    .map((authority) => ({ authority, a: mapA.get(authority) ?? empty, b: mapB.get(authority) ?? empty }))
    .sort((x, y) => (y.a.value + y.b.value) - (x.a.value + x.b.value) || (y.a.awards + y.a.contracts + y.b.awards + y.b.contracts) - (x.a.awards + x.a.contracts + x.b.awards + x.b.contracts)) : [];
  const sumOf = (side: "a" | "b") => authorityRows.reduce((sum, row) => ({ awards: sum.awards + row[side].awards, contracts: sum.contracts + row[side].contracts, value: sum.value + row[side].value }), { ...empty });
  const totalA = sumOf("a");
  const totalB = sumOf("b");
  const togglePick = (key: string) => setPicked(chosen.includes(key) ? chosen.filter((item) => item !== key) : [...chosen, key].slice(-2));
  const nameA = comparing ? shortName(nameOf(chosen[0])) : "";
  const nameB = comparing ? shortName(nameOf(chosen[1])) : "";
  // The last 24 months, oldest first, so every row's mini chart lines up.
  const months = Array.from({ length: 24 }, (_, index) => {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - (23 - index));
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  });
  const showShare = data.competitors.length > 1;
  const awardsTotal = data.competitors.reduce((sum, item) => sum + item.awards, 0);
  const contractsTotal = data.competitors.reduce((sum, item) => sum + item.contracts, 0);
  const pooled = data.summary?.discount;
  return <>
    <div className="metrics statusMetrics">
      <Metric label="Ανάδοχοι που ακολουθείς" value={number.format(data.competitors.length)} tone="sky" />
      <Metric label="Αναθέσεις" value={number.format(awardsTotal)} tone="lilac" />
      <Metric label="Συμβάσεις" value={number.format(contractsTotal)} tone="mint" />
      <Metric label="Τυπική έκπτωση" value={percentText(pooled?.median)} tone="sand" sub={pooled && pooled.count > 0 ? `Διάμεση, σε ${number.format(pooled.count)} διαγωνισμούς` : undefined} />
    </div>
    <article className="panel overviewBigFour"><PanelHeader title="Ανάδοχοι που ακολουθείς" caption="Σε όλη την αγορά · η αξία των ενώσεων μοιράζεται στα μέλη · πάτα μια γραμμή για λεπτομέρειες" />
      <div className="tableScroll"><table><thead><tr><th>Ανάδοχος</th><th>Αναθέσεις</th><th>Συμβάσεις</th><th>Αξία</th>{showShare && <th title="Μερίδιο στην αξία των αναδόχων που ακολουθείς">Μερίδιο</th>}<th title="Η τυπική (διάμεση) έκπτωση σε σχέση με τον προϋπολογισμό· σε παρένθεση το πλήθος των διαγωνισμών στους οποίους βασίζεται">Διάμεση έκπτωση</th><th>Μέσος Π/Υ</th><th>Τελευταία</th></tr></thead>
        <tbody>{data.competitors.map((item) => {
          const isOpen = open === item.key;
          const counts = new Map(item.monthly.map((entry) => [entry.month, entry.count]));
          const maxCount = Math.max(1, ...months.map((month) => counts.get(month) ?? 0));
          return <Fragment key={item.key}>
            <tr className="competitorRow" onClick={() => setOpen(isOpen ? null : item.key)} aria-expanded={isOpen}>
              <td><b>{isOpen ? "▾ " : "▸ "}{displayName(item)}</b>{item.awards + item.contracts === 0 && <small className="competitorEmpty"> · καμία ανάθεση ή σύμβαση ακόμα</small>}</td>
              <td>{number.format(item.awards)}</td><td>{number.format(item.contracts)}</td><td>{item.value > 0 ? euro.format(item.value) : "—"}</td>
              {showShare && <td>{total > 0 ? percentText(100 * item.value / total) : "—"}</td>}
              <td>{percentText(item.discount.median)}{item.discount.count > 0 && <small className="competitorEmpty"> ({number.format(item.discount.count)})</small>}</td>
              <td>{item.avgBudget ? euro.format(item.avgBudget) : "—"}</td><td>{item.lastDate ? formatDate(item.lastDate) : "—"}</td>
            </tr>
            {isOpen && <tr className="competitorDetail"><td colSpan={showShare ? 8 : 7}><div className="competitorDetailGrid">
              <div><h4>Πελάτες</h4>
                {item.clients.length === 0 ? <p className="noRows">Δεν υπάρχουν αναθέσεις ή συμβάσεις.</p> : <ul className="clientList">{item.clients.map((client) => <li key={client.authority} title={`${client.awards} αναθέσεις, ${client.contracts} συμβάσεις`}><span>{client.authority}</span><b>{number.format(client.count)}</b><em>{percentText(client.share)}</em></li>)}</ul>}
              </div>
              <div><h4>Πορεία ανά μήνα <small>(αναθέσεις και συμβάσεις, τελευταίοι 24 μήνες)</small></h4>
                <div className="miniBars" role="img" aria-label="Αναθέσεις και συμβάσεις ανά μήνα">{months.map((month) => {
                  const count = counts.get(month) ?? 0;
                  return <i key={month} title={`${monthLabel(month)}: ${number.format(count)}`} style={{ height: `${count === 0 ? 2 : Math.max(8, 100 * count / maxCount)}%` }} />;
                })}</div>
                <p className="miniBarsAxis"><span>{monthLabel(months[0])}</span><span>{monthLabel(months[months.length - 1])}</span></p>
              </div>
              <div><h4>Ενώσεις</h4>
                <p className="competitorUnion">{item.unionShare === null ? "—" : percentText(item.unionShare)} <span>των αναθέσεων και συμβάσεών του έγιναν σε ένωση εταιρειών.</span></p>
                <h4 className="competitorSubhead">Εκπτώσεις</h4>
                <p className="competitorDiscount">Μέση: <b>{percentText(item.discount.average)}</b> · με έκπτωση: <b>{percentText(item.discount.positiveShare)}</b><span>στους {number.format(item.discount.count)} διαγωνισμούς όπου υπολογίζεται</span></p>
              </div>
            </div></td></tr>}
          </Fragment>;
        })}</tbody></table></div>
    </article>
    {data.competitors.length > 1 && <article className="panel overviewBigFour"><PanelHeader title="Σύγκριση αναδόχων ανά αρχή" caption="Διάλεξε δύο αναδόχους και δες δίπλα-δίπλα τι έχουν πάρει από κάθε αναθέτουσα/διενεργούσα αρχή" />
      <div className="authorityFilter">
        <div className="authorityPills" role="group" aria-label="Ανάδοχοι">
          {data.competitors.map((item) => <button type="button" key={item.key} title={displayName(item)} className={`authorityPill${chosen.includes(item.key) ? " active" : ""}`} aria-pressed={chosen.includes(item.key)} onClick={() => togglePick(item.key)}>{shortName(displayName(item))}</button>)}
        </div>
        {comparing && <div className="authorityCompare"><label className="checkboxRow"><input type="checkbox" checked={onlyCommon} onChange={(event) => setOnlyCommon(event.target.checked)} />Μόνο κοινές αρχές</label></div>}
      </div>
      {!comparing ? <p className="noRows">Διάλεξε δύο αναδόχους από τα κουμπιά{chosen.length === 1 ? ` - έχεις διαλέξει τον ${shortName(nameOf(chosen[0]))}, διάλεξε και έναν ακόμα` : ""}.</p>
        : authorityRows.length === 0 ? <p className="noRows">{onlyCommon ? "Δεν υπάρχει αρχή όπου κέρδισαν και οι δύο." : "Δεν υπάρχουν αναθέσεις ή συμβάσεις."}</p>
        : <div className="tableScroll"><table className="authorityTable">
          <thead>
            <tr className="groupHead"><th rowSpan={2}>Αναθέτουσα/Διενεργούσα Αρχή</th><th colSpan={3}>{nameA}</th><th colSpan={3}>{nameB}</th></tr>
            <tr><th>Αναθέσεις</th><th>Συμβάσεις</th><th>Αξία</th><th>Αναθέσεις</th><th>Συμβάσεις</th><th>Αξία</th></tr>
          </thead>
          <tbody>
            {authorityRows.map((row) => <tr key={row.authority}>
              <td>{row.authority}</td>
              <td>{number.format(row.a.awards)}</td><td>{number.format(row.a.contracts)}</td><td>{row.a.value > 0 ? euro.format(row.a.value) : "—"}</td>
              <td>{number.format(row.b.awards)}</td><td>{number.format(row.b.contracts)}</td><td>{row.b.value > 0 ? euro.format(row.b.value) : "—"}</td>
            </tr>)}
            <tr className="tableTotal"><td>Σύνολο ({number.format(authorityRows.length)} αρχές)</td>
              <td>{number.format(totalA.awards)}</td><td>{number.format(totalA.contracts)}</td><td>{euro.format(totalA.value)}</td>
              <td>{number.format(totalB.awards)}</td><td>{number.format(totalB.contracts)}</td><td>{euro.format(totalB.value)}</td>
            </tr>
          </tbody></table></div>}
    </article>}
  </>;
}

function MonthlyTable({ months }: { months: { month: string; count: number; budget: number; authorities: number; cpv: number }[] }) {
  if (!months.length) return <p className="noRows">Δεν υπάρχουν δεδομένα για τα τρέχοντα φίλτρα.</p>;
  // Count/budget add up correctly across months; distinct CPV/authority
  // counts don't (the same CPV or authority can appear in several months),
  // so a naive sum would overstate the real total - leave those blank in
  // the totals row rather than show a misleading number.
  const totals = months.reduce((sum, item) => ({ count: sum.count + item.count, budget: sum.budget + item.budget }), { count: 0, budget: 0 });
  return <div className="tableScroll monthlyTable"><table>
    <thead><tr><th>Μήνας</th><th>Διαγωνισμοί</th><th>Συνολική αξία</th><th>CPV</th><th>Αναθέτουσες/Διενεργούσες Αρχές</th></tr></thead>
    <tbody>
      {months.map((item) => <tr key={item.month}><td>{monthLabel(item.month)}</td><td>{number.format(item.count)}</td><td>{euro.format(item.budget)}</td><td>{number.format(item.cpv)}</td><td>{number.format(item.authorities)}</td></tr>)}
      <tr className="tableTotal"><td>Σύνολο</td><td>{number.format(totals.count)}</td><td>{euro.format(totals.budget)}</td><td>—</td><td>—</td></tr>
    </tbody>
  </table></div>;
}

type TenderMarks = {
  followed: Set<string>;
  onFollow: (adam: string) => void;
  isNew: (tender: Tender) => boolean;
};

function TenderTable({ rows, expanded = false, title = "Λίστα διαγωνισμών", caption, onViewAll, marks, loading = false }: { rows: Tender[]; expanded?: boolean; title?: string; caption?: string; onViewAll?: () => void; marks?: TenderMarks; loading?: boolean }) {
  const [selected, setSelected] = useState<Tender | null>(null);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (key: string) => setOpenGroups((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  // Notices of the same tender (same authority and same budget, e.g. the
  // Διακήρυξη and a later Παράταση) hang together: the tender the user marked
  // an offer on leads, and the related notices follow right below it.
  const grouped = useMemo(() => {
    const groupKey = (tender: Tender) => tender.budget > 0 && tender.authority ? `${tender.authority}|${tender.budget}` : `solo|${tender.adam}`;
    const order: string[] = [];
    const byKey = new Map<string, Tender[]>();
    rows.forEach((tender) => {
      const key = groupKey(tender);
      if (!byKey.has(key)) { byKey.set(key, []); order.push(key); }
      byKey.get(key)?.push(tender);
    });
    const byPublication = (a: Tender, b: Tender) => (a.publicationDate ?? "").localeCompare(b.publicationDate ?? "");
    const result: { item: Tender; child: boolean; grouped: boolean; first: boolean; last: boolean; key: string; relatedCount: number }[] = [];
    order.forEach((key) => {
      const members = byKey.get(key) ?? [];
      const lead = members.find((tender) => marks?.followed.has(tender.adam))
        ?? members.find((tender) => marks?.followed.has(tender.adam))
        ?? [...members].sort((a, b) => (a.documentType === "declaration" ? 0 : 1) - (b.documentType === "declaration" ? 0 : 1) || byPublication(a, b))[0];
      result.push({ item: lead, child: false, grouped: members.length > 1, first: true, last: members.length === 1, key, relatedCount: members.length - 1 });
      members.filter((tender) => tender !== lead).sort(byPublication).forEach((tender, index, all) => result.push({ item: tender, child: true, grouped: true, first: false, last: index === all.length - 1, key, relatedCount: 0 }));
    });
    return result;
  }, [rows, marks]);
  const visibleRows = grouped.filter((entry) => !entry.child || openGroups.has(entry.key));
  if (selected) return <TenderDetail tender={selected} onBack={() => setSelected(null)} />;
  return <article className={`panel tablePanel ${expanded ? "expanded" : ""}`}><PanelHeader title={title} caption={caption ?? `${number.format(rows.length)} εγγραφές μετά τα φίλτρα`} onDownload={{ filename: title, title, headers: ["ΑΔΑΜ", "Τίτλος", "Αναθέτουσα/Διενεργούσα Αρχή", "CPV", "Περιγραφή CPV", "Π/Υ", "Τύπος σύμβασης", "Τύπος διαδικασίας", "Τύπος εγγράφου", "Κατάσταση", "Δημοσίευση"], rows: rows.map((item) => [item.adam, item.title, item.authority, item.cpv, item.cpvDescription ?? "", item.budget, item.contractType ?? "", item.procedureType ?? "", documentTypeLabels[item.documentType ?? ""] ?? item.documentType ?? "", item.status, item.publicationDate ?? ""]), columnTypes: ["text", "text", "text", "text", "text", "currency", "text", "text", "text", "text", "date"] }} /><div className={`tableScroll${loading ? " tableLoading" : ""}`}>{loading && <div className="tableLoadingNote">Φόρτωση…</div>}<table className="tendersTable"><thead><tr><th>ΑΔΑΜ</th><th>Τίτλος</th><th>Αναθέτουσα/Διενεργούσα Αρχή</th><th>Π/Υ</th><th>Κατάσταση</th><th>Δημοσίευση</th><th>Αποσφράγιση</th>{marks && <th title="Παρακολουθώ">★</th>}<th /></tr></thead><tbody>{visibleRows.map(({ item, child, grouped: inGroup, first, key, relatedCount }, index) => { const styled = inGroup && openGroups.has(key); const isLast = visibleRows[index + 1]?.key !== key; return <tr key={item.adam} className={[styled ? "groupRow" : "soloRow", child ? "relatedRow" : "", styled && first ? "groupFirst" : "", isLast ? "groupLast" : ""].filter(Boolean).join(" ")}><td>{child && <small className="relatedLabel" title="Σχετική ειδοποίηση του ίδιου διαγωνισμού">↳ {documentTypeLabels[item.documentType ?? ""] ?? "Σχετικό"}</small>}{!child && relatedCount > 0 && <button type="button" className="groupArrow" aria-expanded={openGroups.has(key)} title={openGroups.has(key) ? "Απόκρυψη σχετικών ειδοποιήσεων" : "Εμφάνιση σχετικών ειδοποιήσεων (παράταση, τροποποίηση)"} onClick={() => toggleGroup(key)}>{openGroups.has(key) ? "▾" : "▸"} {relatedCount}</button>}<AdamCopy adam={item.adam} className="adam adamCopy" />{marks?.isNew(item) && <b className="newBadge">ΝΕΟ</b>}{item.procedureType === DIRECT_AWARD_PROCEDURE && <b className="directAwardBadge directAwardBadgeAdam" title="Απευθείας ανάθεση - όχι ανοιχτός διαγωνισμός">Απευθείας</b>}</td><td>{item.title}</td><td>{item.authority}</td><td>{euro.format(item.budget)}</td><td><span className={`status ${statusTone[item.status]}`}>{item.status}</span></td><td>{formatDate(item.publicationDate)}</td><td>{item.openingDate ? formatDate(item.openingDate) : "—"}{!child && item.extendedOpeningDate && <small className="extendedNote" title="Μετατέθηκε με παράταση">→ {formatDate(item.extendedOpeningDate)}</small>}{item.dateIssue && <span className="dateWarn" title="Η ημερομηνία αποσφράγισης δεν φαίνεται σωστή (πριν τη δημοσίευση ή πάνω από 365 ημέρες μετά)">⚠</span>}</td>{marks && <td className="markCell">{!child && <button type="button" className={`tickCircle starBtn${marks.followed.has(item.adam) ? " active" : ""}`} aria-pressed={marks.followed.has(item.adam)} aria-label="Παρακολουθώ" title={marks.followed.has(item.adam) ? "Παρακολουθείς αυτόν τον διαγωνισμό (πάτα για διακοπή)" : "Παρακολούθηση διαγωνισμού"} onClick={() => marks.onFollow(item.adam)}>{marks.followed.has(item.adam) ? "★" : "☆"}</button>}</td>}<td>{!child && <button className="view" aria-label={`Προβολή ${item.adam}`} onClick={() => setSelected(item)}>→</button>}</td></tr>; })}</tbody></table></div>{!rows.length && <p className="noRows">Δεν βρέθηκαν διαγωνισμοί για τα επιλεγμένα φίλτρα.</p>}{onViewAll && <button className="viewAll" onClick={onViewAll}>Προβολή όλων των διαγωνισμών →</button>}</article>;
}

function TenderDetail({ tender, onBack }: { tender: Tender; onBack: () => void }) {
  const milestones = [
    ["Δημοσίευση", tender.publicationDate], ["Καταληκτική υποβολής", tender.openingDate], ["Καταληκτική μετά την παράταση", tender.extendedOpeningDate], ["Ανάθεση", tender.awardDate],
    ["Σύμβαση", tender.contractDates?.[0]], ["Παράδοση", tender.deliveryDates?.[0]],
  ].filter((item): item is [string, string] => Boolean(item[1]));
  const dates = milestones.map((item) => new Date(item[1]).getTime()).filter(Number.isFinite);
  const start = Math.min(...dates); const end = Math.max(...dates); const span = Math.max(end - start, 86400000);
  return <article className="panel tenderDetail"><button className="back" onClick={onBack}>← Πίσω στη λίστα</button><p className="eyebrow">ΚΑΡΤΕΛΑ ΔΙΑΓΩΝΙΣΜΟΥ</p><h2>{tender.title}</h2><p className="detailMeta"><AdamCopy adam={tender.adam} className="adamCopy" /> · {tender.authority} · {tender.cpv} {tender.cpvDescription}</p><div className="detailMetrics"><Metric label="Προϋπολογισμός" value={euro.format(tender.budget)} tone="sky" /><Metric label="Αξία ανάθεσης" value={euro.format(tender.awardValue ?? 0)} tone="sand" /><Metric label="Αξία σύμβασης" value={euro.format(tender.contractValue ?? 0)} tone="mint" /></div><section className="gantt"><h3>Χρονοδιάγραμμα διαγωνισμού</h3>{milestones.map(([label,date], index) => <div className="ganttRow" key={`${label}-${date}`}><span>{label}</span><div><i style={{left:`${((new Date(date).getTime()-start)/span)*88}%`,width:index === milestones.length-1 ? "12%" : `${Math.max(8,((new Date(milestones[Math.min(index+1,milestones.length-1)][1]).getTime()-new Date(date).getTime())/span)*88)}%`}} /></div><time>{formatDate(date)}</time></div>)}</section><div className="detailFacts"><p><b>Ανάδοχος:</b> {tender.contractors?.join(", ") || "Δεν έχει καταχωριστεί"}</p><p><b>Τύπος διαδικασίας:</b> {tender.procedureType || "—"}</p><p><b>NUTS:</b> {[tender.nutsCode,tender.nutsName].filter(Boolean).join(" · ") || "—"}</p></div></article>;
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
        const size = Math.round(18 + (item.count / max) * 14);
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

  return <article className="panel nutsPanel"><PanelHeader title="Διαγωνισμοί ανά NUTS" caption={`${number.format(total)} διαγωνισμοί με τα τρέχοντα φίλτρα`} onDownload={{ filename: "diagonismoi-ana-nuts", title: "Διαγωνισμοί ανά NUTS", headers: ["NUTS", "Περιοχή", "Πλήθος"], rows: regions.map((item) => [item.nuts_code, item.nuts_name, item.count]), columnTypes: ["text", "text", "number"] }} /><div className="nutsMap"><div className="realMap" ref={mapElRef} /><div className="nutsLegend">{regions.slice(0,6).map((item) => <div key={item.nuts_code}><span title={item.nuts_name}>{item.nuts_name}</span><i><b style={{width:`${(item.count/max)*100}%`}} /></i><strong>{number.format(item.count)}</strong></div>)}</div></div></article>;
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


type ContractorSummary = { key: string; name: string; awards: number; contracts: number; authorities: number; value: number; discount: number | null; discountCount: number };

// Average discount vs the tender budget, only over cases that compare cleanly:
// one award/contract for the tender (a consortium's amount is for the whole
// tender, so it counts), both amounts on the same VAT basis, and the awarded
// amount not above the budget.
function averageDiscount(rows: (Award | Contract)[]) {
  const byNotice = new Map<string, Map<number, Award | Contract>>();
  for (const row of rows) {
    if (!row.noticeAdam) continue;
    const values = byNotice.get(row.noticeAdam) ?? new Map<number, Award | Contract>();
    values.set(row.value, row);
    byNotice.set(row.noticeAdam, values);
  }
  const samples: number[] = [];
  for (const values of byNotice.values()) {
    if (values.size !== 1) continue;
    const row = [...values.values()][0];
    if (!row.noticeBudget || row.noticeBudget <= 0 || row.value <= 0 || row.value > row.noticeBudget) continue;
    if (!row.valueBasis || row.valueBasis === "unknown" || row.valueBasis !== row.noticeBudgetBasis) continue;
    samples.push((1 - row.value / row.noticeBudget) * 100);
  }
  return { average: samples.length ? samples.reduce((sum, item) => sum + item, 0) / samples.length : null, count: samples.length };
}

const formatDiscount = (value: number | null) => value === null ? "—" : `${value.toFixed(1).replace(".", ",")}%`;

const CONTRACTOR_ALIASES: Record<string, string> = { PWC: "PRICEWATERHOUSECOOPERS", EY: "ERNST" };

const awardGroupKey = (item: { noticeAdam?: string; adam: string; value: number }) => `${item.noticeAdam ?? item.adam}|${item.value}`;

// A republished award can end up with a different ADAM than the one copy a
// later contract actually cites as its award_adam, even though every
// republished copy is the exact same real award (same notice, same amount) -
// confirmed live (25PROC016185999: one copy correctly disappears once
// contracted, the other, identical in everything but its own ADAM, kept
// showing as a still-open Ανάθεση next to the real Σύμβαση). Matching by
// (notice, value) instead of the individual award's own adam recognizes
// every republished copy of an already-contracted award, not just the one a
// contract happens to point at.
function contractedAwardGroups(awards: Award[], contracts: Contract[]) {
  const awardsByAdam = new Map(awards.map((item) => [item.adam, item]));
  const groups = new Set<string>();
  for (const contract of contracts) {
    const award = contract.awardAdam ? awardsByAdam.get(contract.awardAdam) : undefined;
    if (award) groups.add(awardGroupKey(award));
  }
  return groups;
}

function MarketPanel({ awards, contracts, cpv, contractor, authority, year, contractType, documentType, loadedCount, totalCount, stillLoading, locked, selectedContractor, setSelectedContractor, contractorSearch, setContractorSearch, visibleCount, setVisibleCount }: {
  awards: Award[]; contracts: Contract[]; cpv: string[]; contractor: string[]; authority: string;
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
    // Only awards/contracts tied to a tender notice we actually have are shown:
    // the rest can't be compared with a budget and made the totals depend on
    // how much of the older notice history happens to be loaded.
    const hasNotice = (item: { noticeAdam?: string; noticeTitle?: string }) => Boolean(item.noticeAdam && item.noticeTitle);
    const relevantAwards = awards.filter((item) => hasNotice(item) && matchesCpv(item) && matchesContractor(item));
    const relevantContracts = contracts.filter((item) => hasNotice(item) && matchesCpv(item) && matchesContractor(item));

    // The same legal entity is often typed differently across notices ("Α.Ε." vs
    // "AE" vs an alternate registered name in quotes) - the VAT number is the one
    // stable identifier, so group by that and fall back to the raw name only when
    // a record has no VAT on file.
    // "Αναθέσεις" counts award records directly (not deduped by original
    // tender) - a contractor profile is about what this company was actually
    // given, so a 12-lot tender showing 12 awards is correct, not inflated.
    // Money per tender is the sum of its distinct contracts plus the distinct
    // awards that haven't become a contract yet - exactly what the Αναθέσεις
    // and Συμβάσεις tabs list, so the total can be checked against them.
    type ContractorGroup = { key: string; names: Map<string, number>; awardCount: number; contracts: Set<string>; authorities: Set<string>; valueByTender: Map<string, number>; awardSums: Map<string, number>; contractSums: Map<string, number> };
    const newGroup = (key: string): ContractorGroup => ({ key, names: new Map(), awardCount: 0, contracts: new Set(), authorities: new Set(), valueByTender: new Map(), awardSums: new Map(), contractSums: new Map() });
    const byContractor = new Map<string, ContractorGroup>();
    const groupKeyFor = (item: { contractor: string; contractorVat?: string }) => item.contractorVat?.trim() || item.contractor;
    const ensure = (item: { contractor: string; contractorVat?: string }) => {
      const key = groupKeyFor(item);
      let row = byContractor.get(key);
      if (!row) { row = newGroup(key); byContractor.set(key, row); }
      row.names.set(item.contractor, (row.names.get(item.contractor) ?? 0) + 1);
      return row;
    };
    // The same award/contract is often republished as separate records with an
    // identical contractor and amount - count each distinct one once.
    const seenAwards = new Set<string>();
    const seenContracts = new Set<string>();
    // An award that already led to a signed contract is counted as a contract,
    // not again as an award.
    const contractedGroups = contractedAwardGroups(relevantAwards, relevantContracts);
    for (const item of relevantAwards) {
      if (!item.contractor || item.contractor === "Χωρίς ανάδοχο") continue;
      const row = ensure(item);
      const tenderKey = item.noticeAdam ?? item.adam;
      const duplicateKey = `${groupKeyFor(item)}|${tenderKey}|${item.value}`;
      if (!seenAwards.has(duplicateKey)) {
        seenAwards.add(duplicateKey);
        if (!contractedGroups.has(awardGroupKey(item))) {
          row.awardCount += 1;
          row.awardSums.set(tenderKey, (row.awardSums.get(tenderKey) ?? 0) + item.value);
        }
      }
      row.authorities.add(item.authority);
    }
    for (const item of relevantContracts) {
      if (!item.contractor || item.contractor === "Χωρίς ανάδοχο") continue;
      const row = ensure(item);
      const tenderKey = item.noticeAdam ?? item.adam;
      const duplicateKey = `${groupKeyFor(item)}|${tenderKey}|${item.value}`;
      if (!seenContracts.has(duplicateKey)) {
        seenContracts.add(duplicateKey);
        row.contracts.add(item.adam);
        row.contractSums.set(tenderKey, (row.contractSums.get(tenderKey) ?? 0) + item.value);
      }
      row.authorities.add(item.authority);
    }
    for (const row of byContractor.values()) {
      for (const tenderKey of new Set([...row.awardSums.keys(), ...row.contractSums.keys()])) {
        row.valueByTender.set(tenderKey, (row.awardSums.get(tenderKey) ?? 0) + (row.contractSums.get(tenderKey) ?? 0));
      }
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
      if (!target) { target = newGroup(root); mergedGroups.set(root, target); }
      for (const [nameSeen, count] of row.names) target.names.set(nameSeen, (target.names.get(nameSeen) ?? 0) + count);
      target.awardCount += row.awardCount;
      for (const item of row.contracts) target.contracts.add(item);
      for (const item of row.authorities) target.authorities.add(item);
      for (const [tenderKey, amount] of row.valueByTender) if (!target.valueByTender.has(tenderKey)) target.valueByTender.set(tenderKey, amount);
    }

    const discountRowsByRoot = new Map<string, (Award | Contract)[]>();
    for (const item of [...relevantContracts, ...relevantAwards.filter((award) => !contractedGroups.has(awardGroupKey(award)))]) {
      const root = resolvedKeyFor(item);
      const list = discountRowsByRoot.get(root);
      if (list) list.push(item);
      else discountRowsByRoot.set(root, [item]);
    }

    const contractorRowsBase: ContractorSummary[] = [...mergedGroups.values()]
      .map((row) => ({
        key: row.key,
        ...(() => {
          const { average, count } = averageDiscount(discountRowsByRoot.get(row.key) ?? []);
          return { discount: average, discountCount: count };
        })(),
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
      <div><p className="eyebrow">COMPETITION MAPPING</p><h2>Ανάλυση ανταγωνισμού</h2><p>Επίλεξε CPV, ανάδοχο ή αναθέτουσα/διενεργούσα αρχή από το πλαϊνό φίλτρο για να δεις την αγορά, τους αναδόχους, και τις συνδεδεμένες συμβάσεις.</p></div>
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
        <PanelHeader title="Ανάδοχοι" caption="Ταξινομημένοι κατά αριθμό αναθέσεων. Πάτησε πάνω σε έναν ανάδοχο για να δεις τις αναθέσεις και τις συμβάσεις του." onDownload={locked ? undefined : { filename: "anadoxoi", title: "Ανάδοχοι", headers: ["Ανάδοχος", "Αναθέσεις", "Συμβάσεις", "Συνολική αξία", "Μέση έκπτωση", "Διαγωνισμοί στη μέση έκπτωση", "Αναθέτουσες/Διενεργούσες Αρχές"], rows: contractorRows.map((item) => [item.name, item.awards, item.contracts, item.value, formatDiscount(item.discount), item.discountCount, item.authorities]), columnTypes: ["text", "number", "number", "currency", "text", "number", "number"] }} />
        <div className="tableScroll"><table>
          <thead><tr><th /><th>Ανάδοχος</th><th>Αναθέσεις</th><th>Συμβάσεις</th><th>Συνολική αξία</th><th title="Μέσος όρος έκπτωσης της ανάθεσης/σύμβασης σε σχέση με τον Π/Υ της διακήρυξης">Μέση έκπτωση</th><th>Αναθέτουσες/Διενεργούσες Αρχές</th></tr></thead>
          <tbody>{visibleRows.map((item) => (
            <tr key={item.key} className={selectedContractor === item.key ? "selectedRow" : ""} onClick={() => !locked && setSelectedContractor(item.key === selectedContractor ? "" : item.key)}>
              <td><input type="checkbox" checked={selectedContractor === item.key} disabled={locked} readOnly /></td>
              <td><button className="contractorLink" type="button" disabled={locked}>{item.name}</button></td>
              <td>{number.format(item.awards)}</td>
              <td>{number.format(item.contracts)}</td>
              <td>{euro.format(item.value)}</td>
              <td>{formatDiscount(item.discount)}{item.discountCount > 0 && <small className="cellSub">από {number.format(item.discountCount)}</small>}</td>
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
  const [tab, setTab] = useState<"won" | "distribution">("won");
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
  // The same award/contract appears once per contractor row (consortium
  // members, spelling variants) and is often republished under new ADAMs with
  // identical tender and amount - show each of those once (the same rule the
  // Αναθέσεις/Συμβάσεις counters above use), with a count of the extra postings.
  const collapseRepeats = <T extends { adam: string; noticeAdam?: string; value: number }>(rows: T[]) => {
    const groups = new Map<string, { row: T; adams: Set<string> }>();
    for (const row of rows) {
      const key = `${row.noticeAdam ?? row.adam}|${row.value}`;
      const group = groups.get(key);
      if (group) group.adams.add(row.adam);
      else groups.set(key, { row, adams: new Set([row.adam]) });
    }
    return [...groups.values()].map(({ row, adams }) => ({ row, repeats: adams.size - 1 }));
  };
  const contractedGroups = contractedAwardGroups(awards, contracts);
  const awardRows = collapseRepeats([...awards].filter((item) => !contractedGroups.has(awardGroupKey(item))).sort((a, b) => (b.awardDate ?? "").localeCompare(a.awardDate ?? "")));
  const contractRows = collapseRepeats(contracts);
  // One row per tender actually won, whatever lifecycle stage it's at right
  // now - an award that already became a contract is the same win, not a
  // second one, which is why awardRows above already excludes it. Shown as a
  // single list with a status column instead of two tabs the user has to
  // flip between to see everything this contractor has won.
  const wonRows = [
    ...awardRows.map(({ row, repeats }) => ({ row, repeats, status: "Ανάθεση" as const, date: row.awardDate })),
    ...contractRows.map(({ row, repeats }) => ({ row, repeats, status: "Σύμβαση" as const, date: row.signedDate })),
  ].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  // Same rule as MarketPanel's per-contractor value: the total is the
  // contracts plus the awards that have no contract yet (the two tabs'
  // contents), with republished duplicates of the same amount counted once.
  const awardSums = new Map<string, { value: number; label: string }>();
  const contractSums = new Map<string, { value: number; label: string }>();
  const addDistinct = (target: Map<string, { value: number; label: string }>, seen: Set<string>, item: { noticeAdam?: string; adam: string; value: number; cpv: string; cpvDescription?: string }) => {
    const key = item.noticeAdam ?? item.adam;
    const duplicateKey = `${key}|${item.value}`;
    if (seen.has(duplicateKey)) return;
    seen.add(duplicateKey);
    const current = target.get(key);
    target.set(key, { value: (current?.value ?? 0) + item.value, label: current?.label ?? (item.cpvDescription ? `${item.cpv} — ${item.cpvDescription}` : item.cpv) });
  };
  const seenAwardKeys = new Set<string>();
  const seenContractKeys = new Set<string>();
  for (const item of awards) if (!contractedGroups.has(awardGroupKey(item))) addDistinct(awardSums, seenAwardKeys, item);
  for (const item of contracts) addDistinct(contractSums, seenContractKeys, item);
  const valueByTender = new Map<string, { value: number; label: string }>();
  for (const key of new Set([...awardSums.keys(), ...contractSums.keys()])) {
    const awardEntry = awardSums.get(key);
    const contractEntry = contractSums.get(key);
    valueByTender.set(key, {
      value: (awardEntry?.value ?? 0) + (contractEntry?.value ?? 0),
      label: contractEntry?.label ?? awardEntry!.label,
    });
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
      <Metric label="Αναθέτουσες/Διενεργούσες Αρχές" value={number.format(summary.authorities)} tone="sand" />
      <Metric label="Μέση έκπτωση" value={formatDiscount(summary.discount)} tone="sky" sub={summary.discount === null ? "Δεν υπάρχουν συγκρίσιμοι διαγωνισμοί" : `από ${summary.discountCount} ${summary.discountCount === 1 ? "διαγωνισμό" : "διαγωνισμούς"} με ίδια βάση ΦΠΑ`} />
    </div>
    <div className="tabRow">
      <button type="button" className={tab === "won" ? "active" : ""} onClick={() => setTab("won")}>Διακηρύξεις</button>
      <button type="button" className={tab === "distribution" ? "active" : ""} onClick={() => setTab("distribution")}>Κατανομή</button>
    </div>
    {tab === "won" && <><PanelHeader title="Διακηρύξεις" caption="Μία γραμμή ανά Ανάθεση/Σύμβαση - ένα tender με πολλά lots μπορεί να εμφανιστεί πάνω από μία φορά." onDownload={{ filename: "diakiryxeis", title: "Διακηρύξεις", headers: ["ΑΔΑΜ Διακήρυξης", "ΑΔΑΜ Ανάθεσης/Σύμβασης", "Τίτλος", "Αναθέτουσα/Διενεργούσα Αρχή", "Κατάσταση", "Ημερομηνία", "Αξία"], rows: wonRows.map(({ row: item, status, date }) => [Boolean(item.noticeAdam && item.noticeTitle) ? item.noticeAdam! : item.adam, item.adam, Boolean(item.noticeAdam && item.noticeTitle) ? item.noticeTitle! : item.title, item.authority, status, date ?? "", item.value]), columnTypes: ["text", "text", "text", "text", "text", "date", "currency"] }} /><div className="tableScroll"><table><thead><tr><th>ΑΔΑΜ Διακήρυξης</th><th>Τίτλος</th><th>Αναθέτουσα/Διενεργούσα Αρχή</th><th>Κατάσταση</th><th>Ημερομηνία</th><th>Αξία</th></tr></thead><tbody>{wonRows.map(({ row: item, repeats, status, date }) => {
      const hasNotice = Boolean(item.noticeAdam && item.noticeTitle);
      const unionNote = status === "Ανάθεση" ? "η αξία αφορά όλη την ανάθεση" : "η αξία αφορά όλη τη σύμβαση";
      const recordAdamLabel = status === "Σύμβαση" ? "ΑΔΑΜ Σύμβασης" : "ΑΔΑΜ Ανάθεσης";
      return <tr key={`${status}-${item.adam}`} className={hasNotice ? "clickableRow" : ""} onClick={hasNotice ? () => openTender(item.noticeAdam!) : undefined}>
        <td><AdamCopy adam={hasNotice ? item.noticeAdam! : item.adam} className="adam adamCopy" />{repeats > 0 && <small className="cellSub">+{repeats} επαναδημοσίευση</small>}<small className="cellSub">{recordAdamLabel}: {item.adam}</small></td>
        <td>{hasNotice ? item.noticeTitle : item.title}{item.partners && <small className="cellSub">Ένωση με: {item.partners.join(", ")} - {unionNote}</small>}</td>
        <td>{item.authority}</td>
        <td><span className={`status ${status === "Σύμβαση" ? "green" : "purple"}`}>{status}</span></td>
        <td>{formatDate(date)}</td>
        <td>{euro.format(item.value)}</td>
      </tr>;
    })}</tbody></table>{!wonRows.length && <p className="noRows">Δεν βρέθηκαν διακηρύξεις.</p>}{loadingTender && <p className="noRows">Φόρτωση στοιχείων διαγωνισμού…</p>}</div></>}
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
  procedureType?: string | null;
  publicationDate: string | null; openingDate: string | null; budget: number; hasAward: boolean;
  matchedCpv: string[]; cpvs: { code: string; description: string | null }[];
};

const DIRECT_AWARD_PROCEDURE = "Απευθείας ανάθεση";

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
const AVATAR_OPTIONS = ["👤", "🏢", "📊", "💼", "🔧", "⚡", "🌟", "🎯", "🚀", "💡", "📈", "🔍", "🏆", "💎", "🌐", "🧭"];

function useTeamCode() {
  const [code, setCode] = useState<string | null | undefined>(undefined);
  const [loginName, setLoginName] = useState("");
  const [inputCode, setInputCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [lockError, setLockError] = useState("");
  const [showCodeBox, setShowCodeBox] = useState(false);
  const [showSignupBox, setShowSignupBox] = useState(false);
  const [signupName, setSignupName] = useState("");
  const [signupPasscode, setSignupPasscode] = useState("");
  const [signupAvatar, setSignupAvatar] = useState(AVATAR_OPTIONS[0]);
  const [signupChecking, setSignupChecking] = useState(false);
  const [signupError, setSignupError] = useState("");

  // Name and avatar are both set once at signup and fixed after that (see
  // POST /api/teams) - neither is part of the localStorage session, only
  // the passcode is, so a fresh page load with an already-stored passcode
  // re-fetches both here. Avatar can still be changed later (PATCH), just
  // not the name.
  const [teamName, setTeamName] = useState("");
  const [teamAvatar, setTeamAvatar] = useState("");
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [avatarError, setAvatarError] = useState("");

  useEffect(() => {
    setCode(window.localStorage.getItem("alertAccessCode"));
  }, []);

  useEffect(() => {
    if (!code) { setTeamName(""); setTeamAvatar(""); return; }
    fetch("/api/teams", { headers: { "x-alert-code": code } })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (payload?.team?.name) setTeamName(payload.team.name);
        setTeamAvatar(payload?.team?.avatar ?? "");
      })
      .catch(() => {});
  }, [code]);

  // Login now checks name + passcode together (see api/teams/login), not
  // just the passcode - matches signup asking for both, and a half-remembered
  // passcode can't accidentally land in an unrelated account that shares it.
  const unlock = () => {
    if (!loginName.trim() || !inputCode.trim()) return;
    setChecking(true);
    setLockError("");
    fetch("/api/teams/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: loginName.trim(), passcode: inputCode.trim() }),
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (response.ok) {
          window.localStorage.setItem("alertAccessCode", inputCode.trim());
          setCode(inputCode.trim());
          setTeamName(payload.team?.name ?? "");
          setTeamAvatar(payload.team?.avatar ?? "");
          setShowCodeBox(false);
          setLoginName("");
          setInputCode("");
        } else {
          setLockError(payload.error ?? "Λάθος όνομα ή κωδικός.");
        }
      })
      .catch(() => setLockError("Σφάλμα σύνδεσης - δοκίμασε ξανά."))
      .finally(() => setChecking(false));
  };

  // Self-service team creation: pick a name, your own passcode, and an
  // avatar emoji, no email needed (see sql/teams.sql). Success logs the
  // creator straight into their new team, same as unlock() above - the new
  // passcode already works against every team-gated route the instant the
  // team row exists.
  const signup = () => {
    if (!signupName.trim() || !signupPasscode.trim()) return;
    setSignupChecking(true);
    setSignupError("");
    fetch("/api/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: signupName.trim(), passcode: signupPasscode.trim(), avatar: signupAvatar }),
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (response.ok) {
          window.localStorage.setItem("alertAccessCode", signupPasscode.trim());
          setCode(signupPasscode.trim());
          setTeamName(payload.team?.name ?? signupName.trim());
          setTeamAvatar(payload.team?.avatar ?? signupAvatar);
          setShowSignupBox(false);
          setSignupName("");
          setSignupPasscode("");
          setSignupAvatar(AVATAR_OPTIONS[0]);
        } else {
          setSignupError(payload.error ?? "Κάτι πήγε στραβά - δοκίμασε ξανά.");
        }
      })
      .catch(() => setSignupError("Σφάλμα σύνδεσης - δοκίμασε ξανά."))
      .finally(() => setSignupChecking(false));
  };

  // Avatar (unlike the name) can still be changed after signup, and it's
  // server-synced so the change shows up on every device/browser the next
  // time this account logs in - not a per-browser localStorage cosmetic.
  const updateAvatar = (avatar: string) => {
    if (!code || avatar === teamAvatar) return;
    setAvatarSaving(true);
    setAvatarError("");
    fetch("/api/teams", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-alert-code": code },
      body: JSON.stringify({ avatar }),
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (response.ok) setTeamAvatar(payload.team?.avatar ?? avatar);
        else setAvatarError(payload.error ?? "Κάτι πήγε στραβά.");
      })
      .catch(() => setAvatarError("Σφάλμα σύνδεσης - δοκίμασε ξανά."))
      .finally(() => setAvatarSaving(false));
  };

  const logout = () => {
    window.localStorage.removeItem("alertAccessCode");
    setCode(null);
    setLoginName("");
    setInputCode("");
    setTeamName("");
    setTeamAvatar("");
  };

  const onUnauthorized = useCallback(() => {
    window.localStorage.removeItem("alertAccessCode");
    setCode(null);
    setTeamName("");
    setTeamAvatar("");
    setLockError("Ο κωδικός δεν ισχύει πια.");
  }, []);

  return {
    code, loginName, setLoginName, inputCode, setInputCode, checking, lockError, setLockError, showCodeBox, setShowCodeBox, unlock, logout, onUnauthorized,
    showSignupBox, setShowSignupBox, signupName, setSignupName, signupPasscode, setSignupPasscode, signupAvatar, setSignupAvatar, signupChecking, signupError, setSignupError, signup,
    teamName, teamAvatar, avatarSaving, avatarError, updateAvatar,
  };
}

function TeamCodeBar({ team }: { team: ReturnType<typeof useTeamCode> }) {
  const {
    code, loginName, setLoginName, inputCode, setInputCode, checking, lockError, setLockError, showCodeBox, setShowCodeBox, unlock, logout,
    showSignupBox, setShowSignupBox, signupName, setSignupName, signupPasscode, setSignupPasscode, signupAvatar, setSignupAvatar, signupChecking, signupError, setSignupError, signup,
  } = team;
  const closeModal = () => { setShowCodeBox(false); setShowSignupBox(false); setLockError(""); setSignupError(""); };
  return <div className="teamCodeBar">
    {code
      ? <span className="teamCodeStatus">✓ Σύνδεση ενεργή<button type="button" onClick={logout}>Αποσύνδεση</button></span>
      : <span className="teamCodeStatus">
          <button type="button" className="teamCodeToggle" onClick={() => setShowCodeBox(true)}>Σύνδεση</button>
          <button type="button" className="teamCodeSignup" onClick={() => setShowSignupBox(true)}>Εγγραφή</button>
        </span>}
    {(showCodeBox || showSignupBox) && <div className="teamAuthOverlay" onClick={closeModal}>
      <div className="teamAuthModal" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="teamAuthClose" aria-label="Κλείσιμο" onClick={closeModal}>×</button>
        {showCodeBox ? <>
          <h3>Σύνδεση</h3>
          <div className="teamAuthField">
            <input value={loginName} onChange={(event) => { setLoginName(event.target.value); setLockError(""); }} placeholder="Όνομα λογαριασμού" autoFocus />
          </div>
          <div className="teamAuthField">
            <input type="password" value={inputCode} onChange={(event) => { setInputCode(event.target.value); setLockError(""); }} onKeyDown={(event) => { if (event.key === "Enter") unlock(); }} placeholder="Κωδικός πρόσβασης" />
          </div>
          <button type="button" className="teamAuthSubmit" onClick={unlock} disabled={checking}>{checking ? "…" : "Είσοδος"}</button>
          {lockError && <p className="recipientError">{lockError}</p>}
        </> : <>
          <h3>Δημιουργία Λογαριασμού</h3>
          <div className="teamAuthField">
            <input value={signupName} onChange={(event) => { setSignupName(event.target.value); setSignupError(""); }} placeholder="Όνομα λογαριασμού" autoFocus />
          </div>
          <div className="teamAuthField">
            <input type="password" value={signupPasscode} onChange={(event) => { setSignupPasscode(event.target.value); setSignupError(""); }} onKeyDown={(event) => { if (event.key === "Enter") signup(); }} placeholder="Διάλεξε κωδικό (4+ χαρακτήρες)" />
          </div>
          <p className="teamAuthAvatarLabel">Avatar</p>
          <div className="profileEmojiPicker">
            {AVATAR_OPTIONS.map((emoji) => (
              <button type="button" key={emoji} className={`profileEmojiOption ${signupAvatar === emoji ? "active" : ""}`} onClick={() => setSignupAvatar(emoji)}>{emoji}</button>
            ))}
          </div>
          <button type="button" className="teamAuthSubmit" onClick={signup} disabled={signupChecking}>{signupChecking ? "…" : "Δημιουργία Λογαριασμού"}</button>
          {signupError && <p className="recipientError">{signupError}</p>}
        </>}
      </div>
    </div>}
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
function ProfileTools({ code, onUnauthorized }: { code: string | null; onUnauthorized: () => void }) {
  const authFetch = useCallback((url: string, init: RequestInit = {}) => {
    return fetch(url, { ...init, headers: { ...(init.headers as Record<string, string> ?? {}), "x-alert-code": code ?? "" } })
      .then((response) => {
        if (response.status === 401) onUnauthorized();
        return response;
      });
  }, [code, onUnauthorized]);

  const [recipients, setRecipients] = useState<{ email: string }[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [recipientError, setRecipientError] = useState("");
  const [recipientNote, setRecipientNote] = useState("");
  const [apodeltiosiFile, setApodeltiosiFile] = useState<File | null>(null);
  const [apodeltiosiLoading, setApodeltiosiLoading] = useState(false);
  const [apodeltiosiError, setApodeltiosiError] = useState("");
  const [apodeltiosiResult, setApodeltiosiResult] = useState<Apodeltiosi | null>(null);

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

  return <>
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
  </>;
}
