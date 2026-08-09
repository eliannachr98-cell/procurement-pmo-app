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
  status: Status;
  publicationDate: string;
  deadline?: string;
  openingDate?: string;
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
  const [page, setPage] = useState("overview");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Όλες");
  const [authority, setAuthority] = useState("Όλες");
  const [cpv, setCpv] = useState("");
  const [year, setYear] = useState("Όλα");
  const [contractType, setContractType] = useState("Όλοι");

  useEffect(() => {
    fetch("/api/procurement")
      .then(async (response) => {
        if (!response.ok) throw new Error("Δεν ήταν δυνατή η φόρτωση της Supabase");
        return response.json();
      })
      .then((payload) => {
        setTenders(payload.tenders ?? []);
        setAwards(payload.awards ?? []);
        setDataError("");
      })
      .catch((error) => setDataError(error instanceof Error ? error.message : "Σφάλμα δεδομένων"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => tenders.filter((tender) => {
    const needle = query.trim().toLocaleLowerCase("el");
    const matchesQuery = !needle || `${tender.adam} ${tender.title} ${tender.authority}`.toLocaleLowerCase("el").includes(needle);
    return matchesQuery && (status === "Όλες" || tender.status === status) &&
      (authority === "Όλες" || tender.authority === authority) && (!cpv || `${tender.cpv} ${tender.cpvDescription}`.toLocaleLowerCase("el").includes(cpv.toLocaleLowerCase("el"))) &&
      (year === "Όλα" || tender.publicationDate?.startsWith(year)) &&
      (contractType === "Όλοι" || tender.contractType === contractType);
  }), [tenders, query, status, authority, cpv, year, contractType]);

  const authorities = [...new Set(tenders.map((item) => item.authority).filter(Boolean))].sort();
  const years = [...new Set(tenders.map((item) => item.publicationDate?.slice(0, 4)).filter(Boolean))].sort().reverse();
  const contractTypes = [...new Set(tenders.map((item) => item.contractType).filter(Boolean))].sort();
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
            <label className="search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Αναζήτηση ΑΔΑΜ, τίτλου ή Αρχής…" /></label>
          </div>
          {loading && <div className="dataBanner">Φόρτωση πραγματικών δεδομένων από Supabase…</div>}
          {dataError && <div className="dataBanner error">{dataError} · εμφανίζεται προσωρινό δείγμα.</div>}

          {page === "overview" && <>
            <div className="metrics">
              <Metric label="Διαγωνισμοί" value={number.format(filtered.length)} tone="sky" />
              <Metric label="Ενεργοί" value={number.format(statusCount("Ενεργός"))} tone="mint" />
              <Metric label="Σε αξιολόγηση" value={number.format(statusCount("Αξιολόγηση"))} tone="sand" />
              <Metric label="Ανατεθειμένοι" value={number.format(statusCount("Ανατεθειμένος"))} tone="lilac" />
              <Metric label="Συνολικός Π/Υ" value={euro.format(filtered.reduce((sum, item) => sum + item.budget, 0))} tone="sage" />
            </div>
            <div className="chartGrid">
              <article className="panel"><PanelHeader title="Διαγωνισμοί ανά στάδιο" caption="Τρέχουσα εικόνα" /><StatusBars rows={filtered} /></article>
              <article className="panel"><PanelHeader title="CPV Distribution" caption="Κορυφαίες κατηγορίες" /><CpvDonut rows={filtered} /></article>
            </div>
            <TenderTable rows={filtered} />
          </>}

          {page === "tenders" && <TenderTable rows={filtered} expanded />}
          {page === "market" && <MarketPanel awards={awards} cpv={cpv} setCpv={setCpv} />}
          {page === "alerts" && <EmptyState icon="♢" title="Ειδοποιήσεις CPV" text="Οι ειδοποιήσεις θα ενεργοποιηθούν μαζί με τους λογαριασμούς χρηστών στη Supabase." />}
        </section>

        <aside className="filters">
          <div className="filterHeading"><div><span>Φίλτρα</span><small>{number.format(filtered.length)} αποτελέσματα</small></div><button onClick={() => { setStatus("Όλες"); setAuthority("Όλες"); setCpv(""); setQuery(""); setYear("Όλα"); setContractType("Όλοι"); }}>↻</button></div>
          <label>Έτος<select value={year} onChange={(event) => setYear(event.target.value)}><option>Όλα</option>{years.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Αναθέτουσα Αρχή<select value={authority} onChange={(event) => setAuthority(event.target.value)}><option>Όλες</option>{authorities.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>CPV<input value={cpv} onChange={(event) => setCpv(event.target.value)} placeholder="Κωδικός ή λέξη" /></label>
          <label>Τύπος σύμβασης<select value={contractType} onChange={(event) => setContractType(event.target.value)}><option>Όλοι</option>{contractTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
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
  return <div className="donutWrap"><div className="donut"><span><strong>{number.format(counts.length)}</strong><small>CPV</small></span></div><ul>{top.map(([code, count], index) => <li key={code}><i className={["navy", "teal", "gold"][index]} />{code} <b>{Math.round(count / total * 100)}%</b></li>)}{other > 0 && <li><i className="pale" />Λοιπά <b>{Math.round(other / total * 100)}%</b></li>}</ul></div>;
}

function TenderTable({ rows, expanded = false }: { rows: Tender[]; expanded?: boolean }) {
  return <article className={`panel tablePanel ${expanded ? "expanded" : ""}`}><PanelHeader title="Λίστα διαγωνισμών" caption={`${number.format(rows.length)} εγγραφές μετά τα φίλτρα`} /><div className="tableScroll"><table><thead><tr><th>ΑΔΑΜ</th><th>Τίτλος</th><th>Αναθέτουσα Αρχή</th><th>CPV</th><th>Κατάσταση</th><th>Δημοσίευση</th><th /></tr></thead><tbody>{rows.map((item) => <tr key={item.adam}><td className="adam">{item.adam}</td><td>{item.title}</td><td>{item.authority}</td><td title={item.cpvDescription}>{item.cpv}</td><td><span className={`status ${statusTone[item.status]}`}>{item.status}</span></td><td>{formatDate(item.publicationDate)}</td><td><button className="view" aria-label="Προβολή">→</button></td></tr>)}</tbody></table></div>{!rows.length && <p className="noRows">Δεν βρέθηκαν διαγωνισμοί για τα επιλεγμένα φίλτρα.</p>}</article>;
}

function MarketPanel({ awards, cpv, setCpv }: { awards: Award[]; cpv: string; setCpv: (value: string) => void }) {
  const cpvOptions = [...new Set(awards.map((item) => item.cpv).filter((item) => item !== "—"))].sort();
  const relevant = cpv ? awards.filter((item) => item.cpv.includes(cpv)) : awards;
  const contractors = [...relevant.reduce((map, item) => {
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
      <label>CPV<select value={cpv} onChange={(event) => setCpv(event.target.value)}><option value="">Όλοι οι διαθέσιμοι CPV</option>{cpvOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
    </article>
    <div className="metrics marketMetrics">
      <Metric label="Αναθέσεις" value={number.format(relevant.length)} tone="sky" />
      <Metric label="Ανάδοχοι" value={number.format(contractors.length)} tone="mint" />
      <Metric label="Αναθέτουσες Αρχές" value={number.format(new Set(relevant.map((item) => item.authority)).size)} tone="sand" />
      <Metric label="Συνολική αξία" value={euro.format(relevant.reduce((sum, item) => sum + item.value, 0))} tone="lilac" />
    </div>
    <article className="panel tablePanel"><PanelHeader title="Κατάταξη αναδόχων" caption={`${number.format(contractors.length)} ανάδοχοι στα τρέχοντα δεδομένα`} /><div className="tableScroll"><table><thead><tr><th>Ανάδοχος</th><th>Αναθέσεις</th><th>Αναθέτουσες Αρχές</th><th>Συνολική αξία</th></tr></thead><tbody>{contractors.map((item) => <tr key={item.name}><td><strong>{item.name}</strong></td><td>{number.format(item.awards)}</td><td>{number.format(item.authorities.size)}</td><td>{euro.format(item.value)}</td></tr>)}</tbody></table></div>{!contractors.length && <p className="noRows">Δεν βρέθηκαν αναθέσεις για τον επιλεγμένο CPV.</p>}</article>
  </>;
}

function formatDate(value?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("el-GR").format(new Date(value));
}

function EmptyState({ icon, title, text }: { icon: string; title: string; text: string }) {
  return <article className="panel empty"><span>{icon}</span><h2>{title}</h2><p>{text}</p><button>Σύντομα διαθέσιμο</button></article>;
}

