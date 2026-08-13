"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";

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

const navItems = [
  ["overview", "▦", "Επισκόπηση"],
  ["tenders", "☷", "Διαγωνισμοί"],
  ["market", "◉", "Αγορά & Ανταγωνισμός"],
  ["alerts", "♢", "Ειδοποιήσεις"],
] as const;

const statusTone: Record<Status, string> = {
  "Ενεργός": "green",
  "Αξιολόγηση": "amber",
  "Ανατεθειμένος": "blue",
  "Ολοκληρωμένος": "purple",
  "Ακυρωμένος": "red",
};

const number = new Intl.NumberFormat("el-GR");
const euro = new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

type DashboardBreakdown = {
  total: number;
  status: { status: string; count: number; budget: number }[];
  cpv: { cpv_code: string; cpv_description: string | null; count: number }[];
  nuts: { nuts_code: string; nuts_name: string; count: number }[];
  monthly: { month: string; count: number; budget: number; authorities: number; cpv: number }[];
};
const emptyDashboard: DashboardBreakdown = { total: 0, status: [], cpv: [], nuts: [], monthly: [] };

export default function Home() {
  const [tenders, setTenders] = useState<Tender[]>(fallbackTenders);
  const [awards, setAwards] = useState<Award[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [dashboard, setDashboard] = useState<DashboardBreakdown>(emptyDashboard);
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
  const latestRequest = useRef(0);
  const latestDashboardRequest = useRef(0);

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
    // The dashboard charts/tables always count "διαγωνισμοί" (declarations/
    // announcements only) - Τύπος εγγράφου and Τύπος σύμβασης describe a
    // different axis of the same records (and a broad, low-selectivity
    // value like "Προμήθειες" alone was slow enough to time this out
    // server-side), so only these four narrow what the dashboard shows.
    if (authority.trim() && authority !== "Όλες") params.set("authority", authority.trim());
    contractor.forEach((item) => params.append("contractor", item));
    cpv.forEach((item) => params.append("cpv", item));
    if (year !== "Όλα") params.set("year", year);
    fetch(`/api/dashboard?${params.toString()}`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("dashboard request failed")))
      .then((payload) => {
        if (requestId !== latestDashboardRequest.current) return;
        setDashboard(payload);
      })
      .catch(() => {
        // A very broad, unfiltered-by-year combination can still time out
        // server-side -- show nothing rather than silently stale numbers
        // from the previous filter selection.
        if (requestId === latestDashboardRequest.current) setDashboard(emptyDashboard);
      });
  }, [authority, contractor, cpv, year]);

  useEffect(() => {
    const timer = window.setTimeout(() => { loadTenderPage(1); loadDashboard(); }, 350);
    return () => window.clearTimeout(timer);
  }, [loadTenderPage, loadDashboard]);

  const filtered = useMemo(() => tenders.filter((tender) => {
    const needle = query.trim().toLocaleLowerCase("el");
    const contractorTerms = contractor.map((item) => item.toLocaleLowerCase("el"));
    const cpvTerms = cpv.map((item) => item.toLocaleLowerCase("el"));
    const matchesQuery = page !== "tenders" || !needle || `${tender.adam} ${tender.title}`.toLocaleLowerCase("el").includes(needle);
    return matchesQuery && (status === "Όλες" || tender.status === status) &&
      (!authority || authority === "Όλες" || tender.authority.toLocaleLowerCase("el").includes(authority.toLocaleLowerCase("el"))) &&
      (!contractorTerms.length || contractorTerms.some((item) => (tender.contractors ?? []).join(" ").toLocaleLowerCase("el").includes(item))) &&
      (!cpvTerms.length || cpvTerms.some((item) => `${tender.cpv} ${tender.cpvDescription}`.toLocaleLowerCase("el").includes(item))) &&
      (year === "Όλα" || tender.publicationDate?.startsWith(year)) &&
      (contractType.length === 0 || contractType.includes(tender.contractType ?? "")) &&
      (documentType === "Όλοι" || tender.documentType === documentType);
  }), [tenders, query, status, authority, contractor, cpv, year, contractType, documentType, page]);

  const authorities = [...new Set(tenders.map((item) => item.authority).filter(Boolean))].sort();
  const documentTypes = [
    ["declaration", "Διακήρυξη"],
    ["announcement", "Προκήρυξη"],
    ["summary", "Περίληψη"],
    ["clarification", "Διευκρίνιση"],
    ["extension", "Παράταση / μετάθεση"],
    ["amendment", "Τροποποίηση"],
    ["decision", "Απόφαση / έγκριση"],
  ];
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
          {navItems.map(([id, icon, label]) => (
            <button key={id} className={page === id ? "active" : ""} onClick={() => setPage(id)}>
              <span>{icon}</span>{label}
            </button>
          ))}
        </nav>
      </header>

      <div className={`workspace${page === "alerts" ? " workspaceFull" : ""}`}>
        <section className="content">
          <div className="pageTitle">
            <div><p className="eyebrow">PROCUREMENT INTELLIGENCE</p><h1>{page === "overview" ? "Επισκόπηση" : page === "tenders" ? "Διαγωνισμοί" : page === "market" ? "Αγορά & Ανταγωνισμός" : "Ειδοποιήσεις"}</h1></div>
            {page !== "alerts" && <label className="search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Αναζήτηση με ΑΔΑΜ ή τίτλο…" /></label>}
          </div>
          {loading && tenders.length === 0 && <div className="dataBanner">Φόρτωση πραγματικών δεδομένων από Supabase…</div>}
          {dataError && <div className="dataBanner error">{dataError} · εμφανίζεται προσωρινό δείγμα.</div>}

          {page === "overview" && <>
            <div className="metrics">
              <Metric label="Διαγωνισμοί" value={number.format(dashboard.total)} sub={`Π/Υ ${euro.format(totalBudget)}`} tone="sky" />
              <Metric label="Ενεργοί" value={number.format(statusCount("Ενεργός"))} sub={`Π/Υ ${euro.format(statusBudget("Ενεργός"))}`} tone="mint" />
              <Metric label="Σε αξιολόγηση" value={number.format(statusCount("Αξιολόγηση"))} sub={`Π/Υ ${euro.format(statusBudget("Αξιολόγηση"))}`} tone="sand" />
              <Metric label="Ανατεθειμένοι" value={number.format(statusCount("Ανατεθειμένος"))} sub={`Π/Υ ${euro.format(statusBudget("Ανατεθειμένος"))}`} tone="lilac" />
              <Metric label="Ολοκληρωμένοι" value={number.format(statusCount("Ολοκληρωμένος"))} sub={`Π/Υ ${euro.format(statusBudget("Ολοκληρωμένος"))}`} tone="sage" />
              <Metric label="Ακυρωμένοι" value={number.format(statusCount("Ακυρωμένος"))} sub={`Π/Υ ${euro.format(statusBudget("Ακυρωμένος"))}`} tone="rose" />
            </div>
            <div className="chartGrid">
              <article className="panel"><PanelHeader title="Διαγωνισμοί ανά στάδιο" caption={`Σύνολο ${number.format(dashboard.total)} διαγωνισμών`} /><StatusBars counts={dashboard.status} /></article>
              <article className="panel"><PanelHeader title="CPV Distribution" caption="Κορυφαίες κατηγορίες (σύνολο βάσης)" /><CpvDonut counts={dashboard.cpv} total={dashboard.total} /></article>
            </div>
            <article className="panel"><PanelHeader title="Διαγωνισμοί ανά μήνα" caption="Πλήθος, Π/Υ, CPV και αναθέτουσες αρχές ανά μήνα δημοσίευσης" /><MonthlyTable months={dashboard.monthly} /></article>
            <NutsMap counts={dashboard.nuts} />
            <TenderTable rows={[...filtered].sort((a,b) => (b.publicationDate || "").localeCompare(a.publicationDate || "")).slice(0,10)} title="Πρόσφατοι διαγωνισμοί" caption="Οι 10 πιο πρόσφατες εγγραφές" onViewAll={() => setPage("tenders")} />
          </>}

          {page === "tenders" && <>
            <TenderTable rows={filtered} expanded />
            {hasMore && <button className="viewAll" disabled={loading} onClick={() => loadTenderPage(loadedPage + 1, true)}>
              {loading ? "Φόρτωση…" : `Φόρτωση περισσότερων (${number.format(tenders.length)} από ${number.format(totalTenders)})`}
            </button>}
          </>}
          {page === "market" && <MarketPanel awards={awards} contracts={contracts} cpv={cpv} setCpv={setCpv} contractor={contractor} authority={authority} query={query} year={year} contractType={contractType} documentType={documentType} />}
          {page === "alerts" && <AlertsPanel />}
        </section>

        {/* Ειδοποιήσεις is a CPV watch-list/alert feed, not a filtered view of the
            database - the regular filters don't apply to it at all. */}
        {page !== "alerts" && <aside className="filters">
          <div className="filterHeading"><div><span>Φίλτρα</span><small>{number.format(tenders.length)} φορτωμένα · {number.format(dashboard.total || totalTenders)} συνολικά</small></div><button onClick={() => { setStatus("Όλες"); setAuthority(""); setContractor([]); setCpv([]); setQuery(""); setYear("Όλα"); setContractType([]); setDocumentType("Όλοι"); }}>↻</button></div>
          <label>Έτος<select value={year} onChange={(event) => setYear(event.target.value)}><option>Όλα</option>{years.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Αναθέτουσα Αρχή<input list="authority-options" value={authority === "Όλες" ? "" : authority} onChange={(event) => setAuthority(event.target.value)} placeholder="Γράψε ή επίλεξε αρχή" /><datalist id="authority-options">{authorities.map((item) => <option key={item} value={item} />)}</datalist></label>
          <MultiSearchInput label="Ανάδοχος" type="contractor" values={contractor} onChange={setContractor} placeholder="Αναζήτησε και επίλεξε αναδόχους" />
          {page !== "market" && <MultiSearchInput label="CPV" type="cpv" values={cpv} onChange={setCpv} placeholder="Αναζήτησε κωδικό ή περιγραφή CPV" />}
          <CheckboxDropdown label="Τύπος σύμβασης" options={contractTypeOptions} values={contractType} onChange={setContractType} />
          {/* A tender's document-type/status describe the notice's own lifecycle - awards and
              contracts always attach to the original declaration, never to a follow-up document
              or a not-yet-awarded status, so these two never apply anything meaningful here. */}
          {page !== "market" && <label>Τύπος εγγράφου<select value={documentType} onChange={(event) => setDocumentType(event.target.value)}><option value="Όλοι">Όλοι</option>{documentTypes.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
          {page !== "market" && <label>Κατάσταση<select value={status} onChange={(event) => setStatus(event.target.value)}><option>Όλες</option>{Object.keys(statusTone).map((item) => <option key={item}>{item}</option>)}</select></label>}
          <div className="filterNote"><span>i</span><p>Τα ίδια φίλτρα εφαρμόζονται στην Επισκόπηση και στους Διαγωνισμούς.</p></div>
        </aside>}
      </div>
    </main>
  );
}

function Metric({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: string }) {
  return <article className={`metric ${tone}`}><span>{label}</span><strong>{value}</strong>{sub && <small>{sub}</small>}</article>;
}

function PanelHeader({ title, caption }: { title: string; caption: string }) {
  return <header className="panelHeader"><div><h2>{title}</h2><p>{caption}</p></div><button>•••</button></header>;
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

function CpvDonut({ counts, total }: { counts: { cpv_code: string; cpv_description: string | null; count: number }[]; total: number }) {
  const top = counts.slice(0, 3);
  const topSum = top.reduce((sum, item) => sum + item.count, 0);
  const other = Math.max(0, counts.reduce((sum, item) => sum + item.count, 0) - topSum);
  const denominator = Math.max(total, 1);
  return <div className="donutWrap"><div className="donut"><span><strong>{number.format(counts.length)}</strong><small>CPV</small></span></div><ul>{top.map((item, index) => <li key={item.cpv_code} title={item.cpv_description ?? undefined}><i className={["navy", "teal", "gold"][index]} /><span><b>{item.cpv_code}</b><small>{item.cpv_description || "Χωρίς περιγραφή"}</small></span><b>{Math.round(item.count / denominator * 100)}%</b></li>)}{other > 0 && <li><i className="pale" />Λοιπά <b>{Math.round(other / denominator * 100)}%</b></li>}</ul></div>;
}

function monthLabel(ym: string) {
  const [year, month] = ym.split("-");
  const names = ["Ιαν","Φεβ","Μαρ","Απρ","Μαϊ","Ιουν","Ιουλ","Αυγ","Σεπ","Οκτ","Νοε","Δεκ"];
  return `${names[Number(month) - 1] ?? month} '${year.slice(2)}`;
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

function TenderTable({ rows, expanded = false, title = "Λίστα διαγωνισμών", caption, onViewAll }: { rows: Tender[]; expanded?: boolean; title?: string; caption?: string; onViewAll?: () => void }) {
  const [selected, setSelected] = useState<Tender | null>(null);
  if (selected) return <TenderDetail tender={selected} onBack={() => setSelected(null)} />;
  return <article className={`panel tablePanel ${expanded ? "expanded" : ""}`}><PanelHeader title={title} caption={caption ?? `${number.format(rows.length)} εγγραφές μετά τα φίλτρα`} /><div className="tableScroll"><table><thead><tr><th>ΑΔΑΜ</th><th>Τίτλος</th><th>Αναθέτουσα Αρχή</th><th>CPV / Τίτλος</th><th>Κατάσταση</th><th>Δημοσίευση</th><th /></tr></thead><tbody>{rows.map((item) => <tr key={item.adam}><td className="adam">{item.adam}</td><td>{item.title}</td><td>{item.authority}</td><td><strong>{item.cpv}</strong><small className="cellSub">{item.cpvDescription}</small></td><td><span className={`status ${statusTone[item.status]}`}>{item.status}</span></td><td>{formatDate(item.publicationDate)}</td><td><button className="view" aria-label={`Προβολή ${item.adam}`} onClick={() => setSelected(item)}>→</button></td></tr>)}</tbody></table></div>{!rows.length && <p className="noRows">Δεν βρέθηκαν διαγωνισμοί για τα επιλεγμένα φίλτρα.</p>}{onViewAll && <button className="viewAll" onClick={onViewAll}>Προβολή όλων των διαγωνισμών →</button>}</article>;
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
        const size = Math.round(24 + (item.count / max) * 22);
        const icon = L.divIcon({
          html: `<span class="mapPinBadge">${number.format(item.count)}</span>`,
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

  return <article className="panel nutsPanel"><PanelHeader title="Διαγωνισμοί ανά NUTS" caption={`${number.format(total)} διαγωνισμοί με τα τρέχοντα φίλτρα`} /><div className="nutsMap"><div className="realMap" ref={mapElRef} /><div className="nutsLegend">{regions.slice(0,10).map((item) => <div key={item.nuts_code}><span title={item.nuts_name}>{item.nuts_name}</span><i><b style={{width:`${(item.count/max)*100}%`}} /></i><strong>{number.format(item.count)}</strong></div>)}</div></div></article>;
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

function MultiSearchInput({ label, type, values, onChange, placeholder, onSelectOption }: {
  label: string;
  type: "contractor" | "cpv";
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  onSelectOption?: (option: SearchOption) => void;
}) {
  const [text, setText] = useState("");
  const [options, setOptions] = useState<SearchOption[]>([]);
  const [searching, setSearching] = useState(false);
  // Contractor values are sometimes a VAT number (to match precisely), not a
  // readable name, so chips need their own label separate from the filter value.
  const [labelByValue, setLabelByValue] = useState<Record<string, string>>({});

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
      {values.map((value) => <span className="filterChip" key={value}>{labelByValue[value] ?? value}<button type="button" aria-label={`Αφαίρεση ${labelByValue[value] ?? value}`} onClick={() => onChange(values.filter((item) => item !== value))}>×</button></span>)}
      <input value={text} onChange={(event) => setText(event.target.value)} placeholder={values.length ? "Πρόσθεσε ακόμη μία επιλογή" : placeholder} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} />
    </div>
    {(searching || options.length > 0) && <div className="suggestions">
      {searching && <span>Αναζήτηση…</span>}
      {!searching && options.map((option) => <button type="button" key={option.value} onMouseDown={(event) => { event.preventDefault(); select(option); }}>{option.label}</button>)}
    </div>}
  </div>;
}

type ContractorSummary = { key: string; name: string; tenders: number; contracts: number; authorities: number; value: number };

const CONTRACTOR_ALIASES: Record<string, string> = { PWC: "PRICEWATERHOUSECOOPERS", EY: "ERNST" };

function MarketPanel({ awards, contracts, cpv, setCpv, contractor, authority, query, year, contractType, documentType }: {
  awards: Award[]; contracts: Contract[]; cpv: string[]; setCpv: (value: string[]) => void; contractor: string[]; authority: string; query: string;
  year: string; contractType: string[]; documentType: string;
}) {
  const [selectedContractor, setSelectedContractor] = useState("");
  const [contractorSearch, setContractorSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(10);
  useEffect(() => { setVisibleCount(10); }, [contractor, cpv, authority, query, year, contractType, documentType, contractorSearch]);
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
  type ContractorGroup = { key: string; names: Map<string, number>; tenders: Set<string>; contracts: Set<string>; authorities: Set<string>; valueByTender: Map<string, number> };
  const byContractor = new Map<string, ContractorGroup>();
  const groupKeyFor = (item: { contractor: string; contractorVat?: string }) => item.contractorVat?.trim() || item.contractor;
  const ensure = (item: { contractor: string; contractorVat?: string }) => {
    const key = groupKeyFor(item);
    let row = byContractor.get(key);
    if (!row) { row = { key, names: new Map(), tenders: new Set(), contracts: new Set(), authorities: new Set(), valueByTender: new Map() }; byContractor.set(key, row); }
    row.names.set(item.contractor, (row.names.get(item.contractor) ?? 0) + 1);
    return row;
  };
  for (const item of relevantAwards) {
    if (!item.contractor || item.contractor === "Χωρίς ανάδοχο") continue;
    const row = ensure(item);
    const tenderKey = item.noticeAdam ?? item.adam;
    row.tenders.add(tenderKey);
    row.authorities.add(item.authority);
    // A contract for the same tender (added below) overrides this placeholder.
    if (!row.valueByTender.has(tenderKey)) row.valueByTender.set(tenderKey, item.value);
  }
  for (const item of relevantContracts) {
    if (!item.contractor || item.contractor === "Χωρίς ανάδοχο") continue;
    const row = ensure(item);
    const tenderKey = item.noticeAdam ?? item.adam;
    row.tenders.add(tenderKey);
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
    if (!target) { target = { key: root, names: new Map(), tenders: new Set(), contracts: new Set(), authorities: new Set(), valueByTender: new Map() }; mergedGroups.set(root, target); }
    for (const [nameSeen, count] of row.names) target.names.set(nameSeen, (target.names.get(nameSeen) ?? 0) + count);
    for (const item of row.tenders) target.tenders.add(item);
    for (const item of row.contracts) target.contracts.add(item);
    for (const item of row.authorities) target.authorities.add(item);
    for (const [tenderKey, amount] of row.valueByTender) if (!target.valueByTender.has(tenderKey)) target.valueByTender.set(tenderKey, amount);
  }

  const search = contractorSearch.trim().toLocaleLowerCase("el");
  const contractorRows: ContractorSummary[] = [...mergedGroups.values()]
    .map((row) => ({
      key: row.key,
      // Show the spelling that shows up most often across the matched records.
      name: [...row.names.entries()].sort((a, b) => b[1] - a[1])[0][0],
      tenders: row.tenders.size,
      contracts: row.contracts.size,
      authorities: row.authorities.size,
      value: [...row.valueByTender.values()].reduce((sum, item) => sum + item, 0),
    }))
    .filter((row) => !search || row.name.toLocaleLowerCase("el").includes(search))
    .sort((a, b) => b.tenders - a.tenders);
  const visibleRows = contractorRows.slice(0, visibleCount);

  const hasSelection = cpv.length > 0 || contractor.length > 0 || (authority.trim() !== "" && authority !== "Όλες") || query.trim().length > 0 ||
    year !== "Όλα" || contractType.length > 0 || documentType !== "Όλοι";
  const selectedSummary = contractorRows.find((row) => row.key === selectedContractor);

  return <>
    <article className="panel marketHero">
      <div><p className="eyebrow">COMPETITION MAPPING</p><h2>Ανάλυση ανταγωνισμού ανά CPV</h2><p>Επίλεξε ένα ή περισσότερα CPV για να δεις την αγορά, τους αναδόχους, και τις συνδεδεμένες συμβάσεις.</p></div>
      <MultiSearchInput label="CPV" type="cpv" values={cpv} onChange={setCpv} placeholder="Αναζήτησε και επίλεξε CPV" />
    </article>
    {!hasSelection && <article className="panel empty marketStart"><span>⌕</span><h2>Επίλεξε CPV ή ανάδοχο</h2><p>Τα αποτελέσματα ανταγωνισμού θα εμφανιστούν μόνο μετά τη δική σου επιλογή.</p></article>}
    {hasSelection && <>
      <label className="search marketContractorSearch"><span>⌕</span><input value={contractorSearch} onChange={(event) => setContractorSearch(event.target.value)} placeholder="Αναζήτηση αναδόχου" /></label>
      <article className="panel tablePanel">
        <PanelHeader title="Ανάδοχοι" caption="Ταξινομημένοι κατά αριθμό διαγωνισμών. Πάτησε πάνω σε έναν ανάδοχο για να δεις τους διαγωνισμούς και τις συμβάσεις του." />
        <div className="tableScroll"><table>
          <thead><tr><th /><th>Ανάδοχος</th><th>Διαγωνισμοί</th><th>Συμβάσεις</th><th>Συνολική αξία</th><th>Αναθέτουσες Αρχές</th></tr></thead>
          <tbody>{visibleRows.map((item) => (
            <tr key={item.key} className={selectedContractor === item.key ? "selectedRow" : ""} onClick={() => setSelectedContractor(item.key === selectedContractor ? "" : item.key)}>
              <td><input type="checkbox" checked={selectedContractor === item.key} readOnly /></td>
              <td><button className="contractorLink" type="button">{item.name}</button></td>
              <td>{number.format(item.tenders)}</td>
              <td>{number.format(item.contracts)}</td>
              <td>{euro.format(item.value)}</td>
              <td>{number.format(item.authorities)}</td>
            </tr>
          ))}</tbody>
        </table></div>
        {!contractorRows.length && <p className="noRows">Δεν βρέθηκαν αποτελέσματα για τις επιλογές σου.</p>}
        {contractorRows.length > visibleRows.length && <button className="viewAll" type="button" onClick={() => setVisibleCount((current) => current + 10)}>
          Φόρτωση περισσότερων ({visibleRows.length} από {number.format(contractorRows.length)})
        </button>}
      </article>
      {selectedContractor && selectedSummary && <ContractorProfile
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
  const [tab, setTab] = useState<"tenders" | "contracts" | "distribution">("tenders");
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

  // Award/contract titles are the title of that document itself (a decision,
  // a signed contract, an amendment...), not of the original tender it came
  // from - showing them here as if they were the tender's own title made
  // amendments and award decisions look like separate tenders. Only take
  // rows where the real declaration is known, and use its own title.
  const tenderMap = new Map<string, { adam: string; title: string; authority: string; cpv: string; cpvDescription?: string }>();
  for (const item of awards) {
    if (!item.noticeAdam || !item.noticeTitle) continue;
    if (!tenderMap.has(item.noticeAdam)) tenderMap.set(item.noticeAdam, { adam: item.noticeAdam, title: item.noticeTitle, authority: item.authority, cpv: item.cpv, cpvDescription: item.cpvDescription });
  }
  for (const item of contracts) {
    if (!item.noticeAdam || !item.noticeTitle) continue;
    tenderMap.set(item.noticeAdam, { adam: item.noticeAdam, title: item.noticeTitle, authority: item.authority, cpv: item.cpv, cpvDescription: item.cpvDescription });
  }
  const tenderRows = [...tenderMap.values()];

  const distribution = [...[...awards, ...contracts].reduce((map, item) => {
    const label = item.cpvDescription ? `${item.cpv} — ${item.cpvDescription}` : item.cpv;
    map.set(label, (map.get(label) ?? 0) + item.value);
    return map;
  }, new Map<string, number>())].sort((a, b) => b[1] - a[1]);
  const distributionTotal = distribution.reduce((sum, [, value]) => sum + value, 0) || 1;

  return <article className="panel contractorProfile">
    <header><div><p className="eyebrow">ΠΡΟΦΙΛ ΑΝΑΔΟΧΟΥ</p><h2>{name}</h2></div><button onClick={onClose}>Κλείσιμο ×</button></header>
    <div className="metrics marketMetrics">
      <Metric label="Διαγωνισμοί" value={number.format(summary.tenders)} tone="sky" />
      <Metric label="Συμβάσεις" value={number.format(summary.contracts)} tone="mint" />
      <Metric label="Αναθέτουσες Αρχές" value={number.format(summary.authorities)} tone="sand" />
      <Metric label="Συνολική αξία" value={euro.format(summary.value)} tone="lilac" />
    </div>
    <div className="tabRow">
      <button type="button" className={tab === "tenders" ? "active" : ""} onClick={() => setTab("tenders")}>Διαγωνισμοί</button>
      <button type="button" className={tab === "contracts" ? "active" : ""} onClick={() => setTab("contracts")}>Συμβάσεις</button>
      <button type="button" className={tab === "distribution" ? "active" : ""} onClick={() => setTab("distribution")}>Κατανομή</button>
    </div>
    {tab === "tenders" && <div className="tableScroll"><table><thead><tr><th>ΑΔΑΜ Διακήρυξης</th><th>Τίτλος διαγωνισμού</th><th>Αναθέτουσα Αρχή</th><th>CPV</th></tr></thead><tbody>{tenderRows.map((row) => <tr key={row.adam} className="clickableRow" onClick={() => openTender(row.adam)}><td className="adam">{row.adam}</td><td>{row.title}</td><td>{row.authority}</td><td><strong>{row.cpv}</strong><small className="cellSub">{row.cpvDescription}</small></td></tr>)}</tbody></table>{!tenderRows.length && <p className="noRows">Δεν βρέθηκαν διαγωνισμοί.</p>}{loadingTender && <p className="noRows">Φόρτωση στοιχείων διαγωνισμού…</p>}</div>}
    {tab === "contracts" && <div className="tableScroll"><table><thead><tr><th>ΑΔΑΜ Σύμβασης</th><th>Τίτλος</th><th>Αναθέτουσα Αρχή</th><th>Ημ. υπογραφής</th><th>Αξία</th></tr></thead><tbody>{contracts.map((item) => <tr key={item.adam}><td className="adam">{item.adam}</td><td>{item.title}</td><td>{item.authority}</td><td>{formatDate(item.signedDate)}</td><td>{euro.format(item.value)}</td></tr>)}</tbody></table>{!contracts.length && <p className="noRows">Δεν βρέθηκαν συμβάσεις.</p>}</div>}
    {tab === "distribution" && <div className="bars">{distribution.slice(0, 10).map(([label, value]) => <div className="barRow" key={label}><span title={label}>{label}</span><div><i className="teal" style={{ width: `${(value / distributionTotal) * 100}%` }} /></div><strong>{euro.format(value)}</strong></div>)}{!distribution.length && <p className="noRows">Δεν υπάρχουν δεδομένα κατανομής.</p>}</div>}
  </article>;
}

function formatDate(value?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("el-GR").format(new Date(value));
}

type WatchlistItem = { cpv_code: string; cpv_label: string | null };
type AlertItem = {
  adam: string; title: string; authority: string; contractType?: string; documentType?: string | null;
  publicationDate: string | null; openingDate: string | null; budget: number;
  matchedCpv: string[]; cpvs: { code: string; description: string | null }[];
};

const ALERT_DOC_TYPE_LABELS: Record<string, string> = {
  declaration: "Διακήρυξη",
  announcement: "Προκήρυξη",
  summary: "Περίληψη",
  clarification: "Διευκρίνιση",
  extension: "Παράταση / μετάθεση",
  amendment: "Τροποποίηση",
  decision: "Απόφαση / έγκριση",
};

const ALERT_URGENT_DAYS = 15;

function alertUrgency(openingDate: string | null): "open" | "urgent" | "passed" | "unknown" {
  if (!openingDate) return "unknown";
  const diffDays = (new Date(openingDate).getTime() - Date.now()) / 86400000;
  if (diffDays < 0) return "passed";
  if (diffDays < ALERT_URGENT_DAYS) return "urgent";
  return "open";
}

function AlertsPanel() {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPassed, setShowPassed] = useState(false);
  const [error, setError] = useState("");
  const [selectedTender, setSelectedTender] = useState<Tender | null>(null);
  const [loadingTender, setLoadingTender] = useState(false);

  const load = useCallback(() => {
    // A cold Vercel/Supabase connection occasionally 500s the first request
    // right after a page load; one silent retry clears most of those.
    const attemptFetch = (attempt: number) => {
      setLoading(true);
      fetch("/api/alerts")
        .then((response) => response.ok ? response.json() : Promise.reject(new Error("alerts request failed")))
        .then((payload) => { setWatchlist(payload.watchlist ?? []); setAlerts(payload.alerts ?? []); setError(""); setLoading(false); })
        .catch(() => {
          if (attempt < 2) { window.setTimeout(() => attemptFetch(attempt + 1), 900); return; }
          setError("Δεν ήταν δυνατή η φόρτωση των ειδοποιήσεων.");
          setLoading(false);
        });
    };
    attemptFetch(0);
  }, []);

  useEffect(() => { load(); }, [load]);

  const removeCpv = (code: string) => {
    setWatchlist((current) => current.filter((item) => item.cpv_code !== code));
    fetch(`/api/watchlist?cpv_code=${encodeURIComponent(code)}`, { method: "DELETE" }).then(load);
  };

  const openTender = (adam: string) => {
    setLoadingTender(true);
    fetch(`/api/procurement?q=${encodeURIComponent(adam)}&pageSize=5`)
      .then((response) => response.ok ? response.json() : { tenders: [] })
      .then((payload) => setSelectedTender((payload.tenders ?? []).find((item: Tender) => item.adam === adam) ?? null))
      .catch(() => setSelectedTender(null))
      .finally(() => setLoadingTender(false));
  };

  if (selectedTender) return <TenderDetail tender={selectedTender} onBack={() => setSelectedTender(null)} />;

  return <>
    <article className="panel watchlistPanel">
      <div className="watchlistRow">
        <div><p className="eyebrow">CPV ALERTS</p><h2>Παρακολούθηση CPV</h2></div>
        <MultiSearchInput
          label="CPV"
          type="cpv"
          values={watchlist.map((item) => item.cpv_code)}
          onChange={(nextValues) => {
            const removed = watchlist.map((item) => item.cpv_code).find((code) => !nextValues.includes(code));
            if (removed) removeCpv(removed);
          }}
          onSelectOption={(option) => {
            fetch("/api/watchlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cpv_code: option.value, cpv_label: option.label }) })
              .then(load);
          }}
          placeholder="Αναζήτησε και πρόσθεσε CPV στην παρακολούθηση"
        />
      </div>
      <p className="watchlistCaption">Οι νέοι διαγωνισμοί που δημοσιεύονται σε αυτά τα CPV εμφανίζονται παρακάτω, με αποδελτίωση των βασικών στοιχείων.</p>
    </article>
    {!watchlist.length && <article className="panel empty"><span>♢</span><h2>Δεν παρακολουθείς κανένα CPV</h2><p>Πρόσθεσε έναν ή περισσότερους κωδικούς CPV παραπάνω για να ξεκινήσεις να βλέπεις εδώ τους νέους διαγωνισμούς που ταιριάζουν.</p></article>}
    {error && <div className="dataBanner error">{error}</div>}
    {watchlist.length > 0 && (() => {
      const passedCount = alerts.filter((item) => alertUrgency(item.openingDate) === "passed").length;
      const visibleAlerts = showPassed ? alerts : alerts.filter((item) => alertUrgency(item.openingDate) !== "passed");
      return <article className="panel tablePanel">
      <PanelHeader title="Νέοι διαγωνισμοί" caption={`${number.format(visibleAlerts.length)} διαγωνισμοί τις τελευταίες 45 ημέρες στα CPV που παρακολουθείς`} />
      {loading && <p className="noRows">Φόρτωση ειδοποιήσεων…</p>}
      {!loading && !alerts.length && <p className="noRows">Δεν βρέθηκαν νέοι διαγωνισμοί ακόμη.</p>}
      {!loading && visibleAlerts.length > 0 && <div className="alertList">
        {visibleAlerts.map((item) => {
          const urgency = alertUrgency(item.openingDate);
          const docType = item.documentType ?? "declaration";
          return <button type="button" className={`alertCard is-${urgency}`} key={item.adam} onClick={() => openTender(item.adam)}>
          <span className="alertCardHead"><strong>{item.title}</strong><span>{formatDate(item.publicationDate ?? undefined)}</span></span>
          <span className="alertCardAuthority"><span className="alertCardAuthorityName">{item.authority}</span><span className={`alertCardDocType docType-${docType}`}>{ALERT_DOC_TYPE_LABELS[docType] ?? docType}</span></span>
          <span className="alertCardFacts">
            <span><b>ΑΔΑΜ</b>{item.adam}</span>
            <span><b>CPV</b>{item.cpvs.map((cpv) => cpv.code).join(", ") || "—"}</span>
            <span><b>Π/Υ</b>{euro.format(item.budget)}</span>
            <span><b>Αποσφράγιση</b>{formatDate(item.openingDate ?? undefined)}</span>
            <span><b>Τύπος σύμβασης</b>{item.contractType ?? "—"}</span>
          </span>
        </button>;
        })}
      </div>}
      {!loading && !showPassed && passedCount > 0 && <button type="button" className="loadMoreBtn" onClick={() => setShowPassed(true)}>
        Εμφάνιση {number.format(passedCount)} ακόμη (έχει παρέλθει η αποσφράγιση)
      </button>}
      {loadingTender && <p className="noRows">Φόρτωση στοιχείων διαγωνισμού…</p>}
    </article>;
    })()}
  </>;
}

