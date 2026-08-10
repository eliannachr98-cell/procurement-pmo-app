"use client";

import { useEffect, useMemo, useState } from "react";

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

export default function Home() {
  const [tenders, setTenders] = useState<Tender[]>(fallbackTenders);
  const [awards, setAwards] = useState<Award[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState("");
  const [loadedPage, setLoadedPage] = useState(1);
  const [totalTenders, setTotalTenders] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState("overview");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Όλες");
  const [authority, setAuthority] = useState("Όλες");
  const [contractor, setContractor] = useState("");
  const [cpv, setCpv] = useState("");
  const [year, setYear] = useState("Όλα");
  const [contractType, setContractType] = useState("Όλοι");
  const [documentType, setDocumentType] = useState("Όλοι");

  const loadTenderPage = (nextPage: number, append = false) => {
    setLoading(true);
    fetch(`/api/procurement?page=${nextPage}&pageSize=500`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Δεν ήταν δυνατή η φόρτωση της Supabase");
        return response.json();
      })
      .then((payload) => {
        setTenders((current) => append ? [...current, ...(payload.tenders ?? [])] : (payload.tenders ?? []));
        setAwards((current) => append ? [...current, ...(payload.awards ?? [])] : (payload.awards ?? []));
        setLoadedPage(nextPage);
        setTotalTenders(payload.meta?.total ?? payload.tenders?.length ?? 0);
        setHasMore(Boolean(payload.meta?.hasMore));
        setDataError("");
      })
      .catch((error) => setDataError(error instanceof Error ? error.message : "Σφάλμα δεδομένων"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadTenderPage(1);
  }, []);

  const filtered = useMemo(() => tenders.filter((tender) => {
    const needle = query.trim().toLocaleLowerCase("el");
    const matchesQuery = page !== "tenders" || !needle || `${tender.adam} ${tender.title}`.toLocaleLowerCase("el").includes(needle);
    return matchesQuery && (status === "Όλες" || tender.status === status) &&
      (!authority || authority === "Όλες" || tender.authority.toLocaleLowerCase("el").includes(authority.toLocaleLowerCase("el"))) &&
      (!contractor || (tender.contractors ?? []).join(" ").toLocaleLowerCase("el").includes(contractor.toLocaleLowerCase("el"))) &&
      (!cpv || `${tender.cpv} ${tender.cpvDescription}`.toLocaleLowerCase("el").includes(cpv.toLocaleLowerCase("el"))) &&
      (year === "Όλα" || tender.publicationDate?.startsWith(year)) &&
      (contractType === "Όλοι" || tender.contractType === contractType) &&
      (documentType === "Όλοι" || tender.documentType === documentType);
  }), [tenders, query, status, authority, contractor, cpv, year, contractType, documentType, page]);

  const authorities = [...new Set(tenders.map((item) => item.authority).filter(Boolean))].sort();
  const contractors = [...new Set(tenders.flatMap((item) => item.contractors ?? []).filter(Boolean))].sort();
  const years = [...new Set(tenders.map((item) => item.publicationDate?.slice(0, 4)).filter(Boolean))].sort().reverse();
  const contractTypes = [...new Set(tenders.map((item) => item.contractType).filter(Boolean))].sort();
  const documentTypes = ["Διακήρυξη", "Τροποποίηση", "Απόφαση", "Διευκρίνιση", "Παράταση", "Ακύρωση", "Λοιπό"];
  const cpvOptions = [...new Map(tenders.filter((item) => item.cpv && item.cpv !== "—").map((item) => [item.cpv, item.cpvDescription || "Χωρίς περιγραφή"])).entries()].sort();
  const statusCount = (value: Status) => filtered.filter((item) => item.status === value).length;

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
          {loading && <div className="dataBanner">Φόρτωση πραγματικών δεδομένων από Supabase…</div>}
          {dataError && <div className="dataBanner error">{dataError} · εμφανίζεται προσωρινό δείγμα.</div>}

          {page === "overview" && <>
            <div className="metrics">
              <Metric label="Διαγωνισμοί" value={number.format(totalTenders || filtered.length)} tone="sky" />
              <Metric label="Ενεργοί" value={number.format(statusCount("Ενεργός"))} tone="mint" />
              <Metric label="Σε αξιολόγηση" value={number.format(statusCount("Αξιολόγηση"))} tone="sand" />
              <Metric label="Ανατεθειμένοι" value={number.format(statusCount("Ανατεθειμένος"))} tone="lilac" />
              <Metric label="Συνολικός Π/Υ" value={euro.format(filtered.reduce((sum, item) => sum + item.budget, 0))} tone="sage" />
            </div>
            <div className="chartGrid">
              <article className="panel"><PanelHeader title="Διαγωνισμοί ανά στάδιο" caption="Τρέχουσα εικόνα" /><StatusBars rows={filtered} /></article>
              <article className="panel"><PanelHeader title="CPV Distribution" caption="Κορυφαίες κατηγορίες" /><CpvDonut rows={filtered} /></article>
            </div>
            <NutsMap rows={filtered} />
            <TenderTable rows={[...filtered].sort((a,b) => (b.publicationDate || "").localeCompare(a.publicationDate || "")).slice(0,10)} title="Πρόσφατοι διαγωνισμοί" caption="Οι 10 πιο πρόσφατες εγγραφές" onViewAll={() => setPage("tenders")} />
          </>}

          {page === "tenders" && <>
            <TenderTable rows={filtered} expanded />
            {hasMore && <button className="viewAll" disabled={loading} onClick={() => loadTenderPage(loadedPage + 1, true)}>
              {loading ? "Φόρτωση…" : `Φόρτωση περισσότερων (${number.format(tenders.length)} από ${number.format(totalTenders)})`}
            </button>}
          </>}
          {page === "market" && <MarketPanel awards={awards} cpv={cpv} setCpv={setCpv} />}
          {page === "alerts" && <EmptyState icon="♢" title="Ειδοποιήσεις CPV" text="Οι ειδοποιήσεις θα ενεργοποιηθούν μαζί με τους λογαριασμούς χρηστών στη Supabase." />}
        </section>

        <aside className="filters">
          <div className="filterHeading"><div><span>Φίλτρα</span><small>{number.format(filtered.length)} εμφανίζονται · {number.format(totalTenders)} συνολικά</small></div><button onClick={() => { setStatus("Όλες"); setAuthority(""); setContractor(""); setCpv(""); setQuery(""); setYear("Όλα"); setContractType("Όλοι"); setDocumentType("Όλοι"); }}>↻</button></div>
          <label>Έτος<select value={year} onChange={(event) => setYear(event.target.value)}><option>Όλα</option>{years.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Αναθέτουσα Αρχή<input list="authority-options" value={authority === "Όλες" ? "" : authority} onChange={(event) => setAuthority(event.target.value)} placeholder="Γράψε ή επίλεξε αρχή" /><datalist id="authority-options">{authorities.map((item) => <option key={item} value={item} />)}</datalist></label>
          <label>Ανάδοχος<input list="contractor-options" value={contractor} onChange={(event) => setContractor(event.target.value)} placeholder="Γράψε ή επίλεξε ανάδοχο" /><datalist id="contractor-options">{contractors.map((item) => <option key={item} value={item} />)}</datalist></label>
          {page !== "market" && <label>CPV<input list="cpv-options" value={cpv} onChange={(event) => setCpv(event.target.value)} placeholder="Γράψε κωδικό ή περιγραφή" /><datalist id="cpv-options">{cpvOptions.map(([code,title]) => <option key={code} value={code} label={title} />)}</datalist></label>}
          <label>Τύπος σύμβασης<select value={contractType} onChange={(event) => setContractType(event.target.value)}><option>Όλοι</option>{contractTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Τύπος εγγράφου<select value={documentType} onChange={(event) => setDocumentType(event.target.value)}><option>Όλοι</option>{documentTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
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

function StatusBars({ rows }: { rows: Tender[] }) {
  const statuses: Status[] = ["Ενεργός", "Αξιολόγηση", "Ανατεθειμένος", "Ολοκληρωμένος", "Ακυρωμένος"];
  const maximum = Math.max(1, ...statuses.map((item) => rows.filter((row) => row.status === item).length));
  return <div className="bars">{statuses.map((item) => { const count = rows.filter((row) => row.status === item).length; return <div className="barRow" key={item}><span>{item}</span><div><i className={statusTone[item]} style={{ width: `${(count / maximum) * 100}%` }} /></div><strong>{number.format(count)}</strong></div>; })}</div>;
}

function CpvDonut({ rows }: { rows: Tender[] }) {
  const counts = [...rows.reduce((map, item) => map.set(item.cpv, (map.get(item.cpv) ?? 0) + 1), new Map<string, number>())]
    .sort((a, b) => b[1] - a[1]);
  const top = counts.slice(0, 3);
  const other = counts.slice(3).reduce((sum, item) => sum + item[1], 0);
  const total = Math.max(rows.length, 1);
  return <div className="donutWrap"><div className="donut"><span><strong>{number.format(counts.length)}</strong><small>CPV</small></span></div><ul>{top.map(([code, count], index) => { const row = rows.find((item) => item.cpv === code); return <li key={code} title={row?.cpvDescription}><i className={["navy", "teal", "gold"][index]} /><span><b>{code}</b><small>{row?.cpvDescription || "Χωρίς περιγραφή"}</small></span><b>{Math.round(count / total * 100)}%</b></li>; })}{other > 0 && <li><i className="pale" />Λοιπά <b>{Math.round(other / total * 100)}%</b></li>}</ul></div>;
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

function NutsMap({ rows }: { rows: Tender[] }) {
  const stats = rows.reduce((map, item) => { const key = item.nutsName || item.nutsCode || "Χωρίς NUTS"; const current = map.get(key) ?? { count: 0, authorities: new Set<string>(), cpvs: new Map<string,number>() }; current.count += 1; current.authorities.add(item.authority); current.cpvs.set(item.cpv,(current.cpvs.get(item.cpv) ?? 0)+1); map.set(key,current); return map; }, new Map<string,{count:number;authorities:Set<string>;cpvs:Map<string,number>}>());
  const regions = [...stats.entries()].sort((a,b) => b[1].count-a[1].count);
  const max = Math.max(1,...regions.map((item) => item[1].count));
  return <article className="panel nutsPanel"><PanelHeader title="Διαγωνισμοί ανά NUTS" caption={`${number.format(rows.length)} διαγωνισμοί με τα τρέχοντα φίλτρα`} /><div className="nutsMap"><div className="realMap"><iframe title="Χάρτης Ελλάδας" loading="lazy" src="https://www.openstreetmap.org/export/embed.html?bbox=18.4%2C34.4%2C30.4%2C42.2&amp;layer=mapnik" />{regions.slice(0,12).map(([name,data],index) => { const [left,top] = mapPosition(name,index); const topCpv=[...data.cpvs.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0] ?? "—"; return <span className="mapPin" key={name} style={{left:`${left}%`,top:`${top}%`,width:`${22+(data.count/max)*20}px`,height:`${22+(data.count/max)*20}px`}}><b>{data.count}</b><span className="mapTooltip"><strong>{name}</strong><em>{data.count} διαγωνισμοί</em><em>{data.authorities.size} αναθέτουσες αρχές</em><em>Κορυφαίο CPV: {topCpv}</em></span></span>; })}<a className="mapCredit" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a></div><div className="nutsLegend">{regions.slice(0,10).map(([name,data]) => <div key={name}><span title={name}>{name}</span><i><b style={{width:`${(data.count/max)*100}%`}} /></i><strong>{number.format(data.count)}</strong></div>)}</div></div></article>;
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

function MarketPanel({ awards, cpv, setCpv }: { awards: Award[]; cpv: string; setCpv: (value: string) => void }) {
  const [selectedContractor, setSelectedContractor] = useState("");
  const cpvOptions = [...new Map(awards.filter((item) => item.cpv !== "—").map((item) => [item.cpv, item.cpvDescription || "Χωρίς περιγραφή"])).entries()].sort();
  const relevant = cpv ? awards.filter((item) => `${item.cpv} ${item.cpvDescription}`.toLocaleLowerCase("el").includes(cpv.toLocaleLowerCase("el"))) : awards;
  const contractors = [...relevant.reduce((map, item) => {
    if (!item.contractor || item.contractor === "Χωρίς ανάδοχο") return map;
    const current = map.get(item.contractor) ?? { name: item.contractor, awards: 0, value: 0, authorities: new Set<string>() };
    current.awards += 1;
    current.value += item.value;
    current.authorities.add(item.authority);
    map.set(item.contractor, current);
    return map;
  }, new Map<string, { name: string; awards: number; value: number; authorities: Set<string> }>()).values()]
    .sort((a, b) => b.value - a.value).slice(0, 50);

  return <>
    <article className="panel marketHero">
      <div><p className="eyebrow">COMPETITION MAPPING</p><h2>Ανάλυση ανταγωνισμού ανά CPV</h2><p>Επίλεξε CPV για να δεις τους αναδόχους, τις αναθέσεις και τη συνολική αξία.</p></div>
      <label>CPV<input list="market-cpv-options" value={cpv} onChange={(event) => setCpv(event.target.value)} placeholder="Γράψε κωδικό ή περιγραφή CPV" /><datalist id="market-cpv-options">{cpvOptions.map(([code,title]) => <option key={code} value={code} label={title} />)}</datalist></label>
    </article>
    <div className="metrics marketMetrics">
      <Metric label="Αναθέσεις" value={number.format(relevant.length)} tone="sky" />
      <Metric label="Ανάδοχοι" value={number.format(contractors.length)} tone="mint" />
      <Metric label="Αναθέτουσες Αρχές" value={number.format(new Set(relevant.map((item) => item.authority)).size)} tone="sand" />
      <Metric label="Συνολική αξία" value={euro.format(relevant.reduce((sum, item) => sum + item.value, 0))} tone="lilac" />
    </div>
    <article className="panel tablePanel"><PanelHeader title="Κατάταξη αναδόχων" caption="Πάτησε έναν ανάδοχο για να δεις τις αναθέσεις του" /><div className="tableScroll"><table><thead><tr><th>Ανάδοχος</th><th>Αναθέσεις</th><th>Αναθέτουσες Αρχές</th><th>Συνολική αξία</th></tr></thead><tbody>{contractors.map((item) => <tr key={item.name} className={selectedContractor === item.name ? "selectedRow" : ""} onClick={() => setSelectedContractor(item.name)}><td><button className="contractorLink">{item.name}</button></td><td>{number.format(item.awards)}</td><td>{number.format(item.authorities.size)}</td><td>{euro.format(item.value)}</td></tr>)}</tbody></table></div>{!contractors.length && <p className="noRows">Δεν βρέθηκαν αναθέσεις για τον επιλεγμένο CPV.</p>}</article>
    {selectedContractor && <ContractorAwards name={selectedContractor} rows={relevant.filter((item) => item.contractor === selectedContractor)} onClose={() => setSelectedContractor("")} />}
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

