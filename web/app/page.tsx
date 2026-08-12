"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  title: string;
  authority: string;
  cpv: string;
  cpvDescription?: string;
  contractor: string;
  contractorVat?: string;
  awardDate?: string;
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
  status: { status: string; count: number }[];
  cpv: { cpv_code: string; cpv_description: string | null; count: number }[];
  nuts: { nuts_name: string; count: number }[];
};
const emptyDashboard: DashboardBreakdown = { total: 0, status: [], cpv: [], nuts: [] };

export default function Home() {
  const [tenders, setTenders] = useState<Tender[]>(fallbackTenders);
  const [awards, setAwards] = useState<Award[]>([]);
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
    if (query.trim()) params.set("q", query.trim());
    if (authority.trim() && authority !== "Όλες") params.set("authority", authority.trim());
    contractor.forEach((item) => params.append("contractor", item));
    cpv.forEach((item) => params.append("cpv", item));
    if (year !== "Όλα") params.set("year", year);
    contractType.forEach((item) => params.append("contractType", item));
    if (documentType !== "Όλοι") params.set("documentType", documentType);
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
  }, [query, authority, contractor, cpv, year, contractType, documentType]);

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

      <div className="workspace">
        <section className="content">
          <div className="pageTitle">
            <div><p className="eyebrow">PROCUREMENT INTELLIGENCE</p><h1>{page === "overview" ? "Επισκόπηση" : page === "tenders" ? "Διαγωνισμοί" : page === "market" ? "Αγορά & Ανταγωνισμός" : "Ειδοποιήσεις"}</h1></div>
            {page === "tenders" && <label className="search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Αναζήτηση με ΑΔΑΜ ή τίτλο…" /></label>}
          </div>
          {loading && tenders.length === 0 && <div className="dataBanner">Φόρτωση πραγματικών δεδομένων από Supabase…</div>}
          {dataError && <div className="dataBanner error">{dataError} · εμφανίζεται προσωρινό δείγμα.</div>}

          {page === "overview" && <>
            <div className="metrics">
              <Metric label="Διαγωνισμοί" value={number.format(dashboard.total)} tone="sky" />
              <Metric label="Ενεργοί" value={number.format(statusCount("Ενεργός"))} tone="mint" />
              <Metric label="Σε αξιολόγηση" value={number.format(statusCount("Αξιολόγηση"))} tone="sand" />
              <Metric label="Ανατεθειμένοι" value={number.format(statusCount("Ανατεθειμένος"))} tone="lilac" />
              <Metric label="Συνολικός Π/Υ (τρέχουσα σελίδα)" value={euro.format(filtered.reduce((sum, item) => sum + item.budget, 0))} tone="sage" />
            </div>
            <div className="chartGrid">
              <article className="panel"><PanelHeader title="Διαγωνισμοί ανά στάδιο" caption={`Σύνολο ${number.format(dashboard.total)} διαγωνισμών`} /><StatusBars counts={dashboard.status} /></article>
              <article className="panel"><PanelHeader title="CPV Distribution" caption="Κορυφαίες κατηγορίες (σύνολο βάσης)" /><CpvDonut counts={dashboard.cpv} total={dashboard.total} /></article>
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
          {page === "market" && <MarketPanel awards={awards} cpv={cpv} setCpv={setCpv} contractor={contractor} />}
          {page === "alerts" && <EmptyState icon="♢" title="Ειδοποιήσεις CPV" text="Οι ειδοποιήσεις θα ενεργοποιηθούν μαζί με τους λογαριασμούς χρηστών στη Supabase." />}
        </section>

        <aside className="filters">
          <div className="filterHeading"><div><span>Φίλτρα</span><small>{number.format(tenders.length)} φορτωμένα · {number.format(dashboard.total || totalTenders)} συνολικά</small></div><button onClick={() => { setStatus("Όλες"); setAuthority(""); setContractor([]); setCpv([]); setQuery(""); setYear("Όλα"); setContractType([]); setDocumentType("Όλοι"); }}>↻</button></div>
          <label>Έτος<select value={year} onChange={(event) => setYear(event.target.value)}><option>Όλα</option>{years.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Αναθέτουσα Αρχή<input list="authority-options" value={authority === "Όλες" ? "" : authority} onChange={(event) => setAuthority(event.target.value)} placeholder="Γράψε ή επίλεξε αρχή" /><datalist id="authority-options">{authorities.map((item) => <option key={item} value={item} />)}</datalist></label>
          <MultiSearchInput label="Ανάδοχος" type="contractor" values={contractor} onChange={setContractor} placeholder="Αναζήτησε και επίλεξε αναδόχους" />
          {page !== "market" && <MultiSearchInput label="CPV" type="cpv" values={cpv} onChange={setCpv} placeholder="Αναζήτησε κωδικό ή περιγραφή CPV" />}
          <CheckboxDropdown label="Τύπος σύμβασης" options={contractTypeOptions} values={contractType} onChange={setContractType} />
          <label>Τύπος εγγράφου<select value={documentType} onChange={(event) => setDocumentType(event.target.value)}><option value="Όλοι">Όλοι</option>{documentTypes.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Κατάσταση<select value={status} onChange={(event) => setStatus(event.target.value)}><option>Όλες</option>{Object.keys(statusTone).map((item) => <option key={item}>{item}</option>)}</select></label>
          <div className="filterNote"><span>i</span><p>Τα ίδια φίλτρα εφαρμόζονται στην Επισκόπηση και στους Διαγωνισμούς.</p></div>
        </aside>
      </div>
    </main>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: string }) {
  return <article className={`metric ${tone}`}><span>{label}</span><strong>{value}</strong></article>;
}

function PanelHeader({ title, caption }: { title: string; caption: string }) {
  return <header className="panelHeader"><div><h2>{title}</h2><p>{caption}</p></div><button>•••</button></header>;
}

function StatusBars({ counts }: { counts: { status: string; count: number }[] }) {
  const statuses: Status[] = ["Ενεργός", "Αξιολόγηση", "Ανατεθειμένος", "Ολοκληρωμένος", "Ακυρωμένος"];
  const byStatus = new Map(counts.map((item) => [item.status, item.count]));
  const maximum = Math.max(1, ...statuses.map((item) => byStatus.get(item) ?? 0));
  return <div className="bars">{statuses.map((item) => { const count = byStatus.get(item) ?? 0; return <div className="barRow" key={item}><span>{item}</span><div><i className={statusTone[item]} style={{ width: `${(count / maximum) * 100}%` }} /></div><strong>{number.format(count)}</strong></div>; })}</div>;
}

function CpvDonut({ counts, total }: { counts: { cpv_code: string; cpv_description: string | null; count: number }[]; total: number }) {
  const top = counts.slice(0, 3);
  const topSum = top.reduce((sum, item) => sum + item.count, 0);
  const other = Math.max(0, counts.reduce((sum, item) => sum + item.count, 0) - topSum);
  const denominator = Math.max(total, 1);
  return <div className="donutWrap"><div className="donut"><span><strong>{number.format(counts.length)}</strong><small>CPV</small></span></div><ul>{top.map((item, index) => <li key={item.cpv_code} title={item.cpv_description ?? undefined}><i className={["navy", "teal", "gold"][index]} /><span><b>{item.cpv_code}</b><small>{item.cpv_description || "Χωρίς περιγραφή"}</small></span><b>{Math.round(item.count / denominator * 100)}%</b></li>)}{other > 0 && <li><i className="pale" />Λοιπά <b>{Math.round(other / denominator * 100)}%</b></li>}</ul></div>;
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

function NutsMap({ counts }: { counts: { nuts_name: string; count: number }[] }) {
  const regions = [...counts].sort((a, b) => b.count - a.count);
  const total = regions.reduce((sum, item) => sum + item.count, 0);
  const max = Math.max(1, ...regions.map((item) => item.count));
  return <article className="panel nutsPanel"><PanelHeader title="Διαγωνισμοί ανά NUTS" caption={`${number.format(total)} διαγωνισμοί με τα τρέχοντα φίλτρα`} /><div className="nutsMap"><div className="realMap"><iframe title="Χάρτης Ελλάδας" loading="lazy" src="https://www.openstreetmap.org/export/embed.html?bbox=18.4%2C34.4%2C30.4%2C42.2&amp;layer=mapnik" />{regions.slice(0,12).map((item,index) => { const [left,top] = mapPosition(item.nuts_name,index); return <span className="mapPin" key={item.nuts_name} style={{left:`${left}%`,top:`${top}%`,width:`${22+(item.count/max)*20}px`,height:`${22+(item.count/max)*20}px`}}><b>{item.count}</b><span className="mapTooltip"><strong>{item.nuts_name}</strong><em>{item.count} διαγωνισμοί</em></span></span>; })}<a className="mapCredit" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a></div><div className="nutsLegend">{regions.slice(0,10).map((item) => <div key={item.nuts_name}><span title={item.nuts_name}>{item.nuts_name}</span><i><b style={{width:`${(item.count/max)*100}%`}} /></i><strong>{number.format(item.count)}</strong></div>)}</div></div></article>;
}

function mapPosition(name: string, index: number): [number, number] {
  const value = name.toLocaleLowerCase("el");
  if (value.includes("θεσσαλον")) return [47,22]; if (value.includes("μακεδον") || value.includes("δράμα") || value.includes("έβρ")) return [58,16];
  if (value.includes("αθην") || value.includes("αττικ")) return [48,59]; if (value.includes("πειρ")) return [45,64];
  if (value.includes("κρήτ") || value.includes("χανι")) return [48,88]; if (value.includes("εύβ")) return [53,49];
  if (value.includes("αχα") || value.includes("πάτρ")) return [34,65]; if (value.includes("κοριν")) return [41,62];
  if (value.includes("θεσσαλ")) return [43,39]; if (value.includes("νησ") || value.includes("αιγα")) return [70,61];
  return [[36,31],[54,35],[38,51],[62,43],[51,72]][index % 5] as [number,number];
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

function MultiSearchInput({ label, type, values, onChange, placeholder }: {
  label: string;
  type: "contractor" | "cpv";
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
}) {
  const [text, setText] = useState("");
  const [options, setOptions] = useState<SearchOption[]>([]);
  const [searching, setSearching] = useState(false);

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
    setText("");
    setOptions([]);
  };

  return <label className="multiSearch"><span className="multiSearchLabel">{label}{values.length > 0 && <span className="multiSearchCount">{values.length} επιλεγμέν{values.length === 1 ? "ος" : "οι"}</span>}</span>
    <div className="multiBox">
      {values.map((value) => <span className="filterChip" key={value}>{value}<button type="button" aria-label={`Αφαίρεση ${value}`} onClick={() => onChange(values.filter((item) => item !== value))}>×</button></span>)}
      <input value={text} onChange={(event) => setText(event.target.value)} placeholder={values.length ? "Πρόσθεσε ακόμη μία επιλογή" : placeholder} />
    </div>
    {(searching || options.length > 0) && <div className="suggestions">
      {searching && <span>Αναζήτηση…</span>}
      {!searching && options.map((option) => <button type="button" key={option.value} onClick={() => select(option)}>{option.label}</button>)}
    </div>}
  </label>;
}

function MarketPanel({ awards, cpv, setCpv, contractor }: { awards: Award[]; cpv: string[]; setCpv: (value: string[]) => void; contractor: string[] }) {
  const [selectedContractor, setSelectedContractor] = useState("");
  const cpvTerms = cpv.map((item) => item.toLocaleLowerCase("el"));
  const relevant = cpvTerms.length ? awards.filter((item) => cpvTerms.some((term) => `${item.cpv} ${item.cpvDescription}`.toLocaleLowerCase("el").includes(term))) : awards;
  const contractors = [...relevant.reduce((map, item) => {
    if (!item.contractor || item.contractor === "Χωρίς ανάδοχο") return map;
    const current = map.get(item.contractor) ?? { name: item.contractor, awards: 0, value: 0, authorities: new Set<string>() };
    current.awards += 1;
    current.value += item.value;
    current.authorities.add(item.authority);
    map.set(item.contractor, current);
    return map;
  }, new Map<string, { name: string; awards: number; value: number; authorities: Set<string> }>()).values()]
    .sort((a, b) => a.name.localeCompare(b.name, "el")).slice(0, 50);

  const hasSelection = cpv.length > 0 || contractor.length > 0;

  return <>
    <article className="panel marketHero">
      <div><p className="eyebrow">COMPETITION MAPPING</p><h2>Ανάλυση ανταγωνισμού ανά CPV ή ανάδοχο</h2><p>Βάλε ένα ή περισσότερα CPV για να δεις αναδόχους ή επίλεξε αναδόχους από τα φίλτρα για να δεις τα στοιχεία τους.</p></div>
      <MultiSearchInput label="CPV" type="cpv" values={cpv} onChange={setCpv} placeholder="Αναζήτησε και επίλεξε CPV" />
    </article>
    {!hasSelection && <article className="panel empty marketStart"><span>⌕</span><h2>Επίλεξε CPV ή ανάδοχο</h2><p>Τα αποτελέσματα ανταγωνισμού θα εμφανιστούν μόνο μετά τη δική σου επιλογή.</p></article>}
    {hasSelection && <>
    <div className="metrics marketMetrics">
      <Metric label="Ανάδοχοι" value={number.format(contractors.length)} tone="mint" />
      <Metric label="Αναθέτουσες Αρχές" value={number.format(new Set(relevant.map((item) => item.authority)).size)} tone="sand" />
      <Metric label="Συνολική αξία" value={euro.format(relevant.reduce((sum, item) => sum + item.value, 0))} tone="lilac" />
    </div>
    <article className="panel tablePanel"><PanelHeader title="Ανάδοχοι και στοιχεία" caption="Πάτησε έναν ανάδοχο για να δεις τις σχετικές εγγραφές" /><div className="tableScroll"><table><thead><tr><th>Ανάδοχος</th><th>Σχετικές εγγραφές</th><th>Αναθέτουσες Αρχές</th><th>Συνολική αξία</th></tr></thead><tbody>{contractors.map((item) => <tr key={item.name} className={selectedContractor === item.name ? "selectedRow" : ""} onClick={() => setSelectedContractor(item.name)}><td><button className="contractorLink">{item.name}</button></td><td>{number.format(item.awards)}</td><td>{number.format(item.authorities.size)}</td><td>{euro.format(item.value)}</td></tr>)}</tbody></table></div>{!contractors.length && <p className="noRows">Δεν βρέθηκαν αποτελέσματα για τις επιλογές σου.</p>}</article>
    {selectedContractor && <ContractorAwards name={selectedContractor} rows={relevant.filter((item) => item.contractor === selectedContractor)} onClose={() => setSelectedContractor("")} />}
    </>}
  </>;
}

function ContractorAwards({ name, rows, onClose }: { name: string; rows: Award[]; onClose: () => void }) {
  return <article className="panel contractorAwards"><header><div><p className="eyebrow">ΑΝΑΘΕΣΕΙΣ ΑΝΑΔΟΧΟΥ</p><h2>{name}</h2><p>{number.format(rows.length)} εγγραφές · {euro.format(rows.reduce((sum,item) => sum + item.value,0))}</p></div><button onClick={onClose}>Κλείσιμο ×</button></header><div className="tableScroll"><table><thead><tr><th>ΑΔΑΜ</th><th>Τίτλος ανάθεσης / διαγωνισμού</th><th>Αναθέτουσα Αρχή</th><th>CPV</th><th>Ημερομηνία</th><th>Αξία</th></tr></thead><tbody>{rows.map((item) => <tr key={`${item.adam}-${item.title}`}><td className="adam">{item.adam}</td><td>{item.title}</td><td>{item.authority}</td><td><strong>{item.cpv}</strong><small className="cellSub">{item.cpvDescription}</small></td><td>{formatDate(item.awardDate)}</td><td>{euro.format(item.value)}</td></tr>)}</tbody></table></div></article>;
}

function formatDate(value?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("el-GR").format(new Date(value));
}

function EmptyState({ icon, title, text }: { icon: string; title: string; text: string }) {
  return <article className="panel empty"><span>{icon}</span><h2>{title}</h2><p>{text}</p><button>Σύντομα διαθέσιμο</button></article>;
}

