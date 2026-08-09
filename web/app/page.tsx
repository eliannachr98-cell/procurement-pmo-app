"use client";

import { useMemo, useState } from "react";

type Status = "Ενεργός" | "Αξιολόγηση" | "Ανατεθειμένος" | "Ολοκληρωμένος" | "Ακυρωμένος";
type Tender = {
  adam: string;
  title: string;
  authority: string;
  cpv: string;
  status: Status;
  date: string;
  budget: number;
};

const tenders: Tender[] = [
  { adam: "25PROC017081252", title: "Υπηρεσίες συμβούλου για τον ψηφιακό μετασχηματισμό", authority: "Υπουργείο Ψηφιακής Διακυβέρνησης", cpv: "72262000-9", status: "Ενεργός", date: "24/06/2025", budget: 860000 },
  { adam: "25PROC016957654", title: "Παροχή υπηρεσιών προληπτικής και κατασταλτικής συντήρησης", authority: "Υπουργείο Ψηφιακής Διακυβέρνησης", cpv: "50730000-1", status: "Αξιολόγηση", date: "04/06/2025", budget: 1240000 },
  { adam: "25PROC016959892", title: "Υπηρεσίες υποστήριξης πληροφοριακών συστημάτων", authority: "Κοινωνία της Πληροφορίας Α.Ε.", cpv: "79411000-8", status: "Ανατεθειμένος", date: "04/06/2025", budget: 2150000 },
  { adam: "25PROC016940656", title: "Διεθνής ηλεκτρονικός ανοικτός διαγωνισμός υπηρεσιών", authority: "Εθνική Κεντρική Αρχή Προμηθειών", cpv: "72267000-4", status: "Ενεργός", date: "02/06/2025", budget: 490000 },
  { adam: "25PROC016898222", title: "Υπηρεσίες καθαριότητας δημόσιων κτιρίων", authority: "Περιφέρεια Αττικής", cpv: "90911200-8", status: "Ολοκληρωμένος", date: "27/05/2025", budget: 770000 },
  { adam: "25PROC016839029", title: "Συμβουλευτικές υπηρεσίες οργανωτικού ανασχεδιασμού", authority: "Δήμος Αθηναίων", cpv: "72220000-3", status: "Ακυρωμένος", date: "19/05/2025", budget: 340000 },
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
  const [page, setPage] = useState("overview");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Όλες");
  const [authority, setAuthority] = useState("Όλες");
  const [cpv, setCpv] = useState("");

  const filtered = useMemo(() => tenders.filter((tender) => {
    const needle = query.trim().toLocaleLowerCase("el");
    const matchesQuery = !needle || `${tender.adam} ${tender.title} ${tender.authority}`.toLocaleLowerCase("el").includes(needle);
    return matchesQuery && (status === "Όλες" || tender.status === status) &&
      (authority === "Όλες" || tender.authority === authority) && (!cpv || tender.cpv.includes(cpv));
  }), [query, status, authority, cpv]);

  const authorities = [...new Set(tenders.map((item) => item.authority))];
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
              <article className="panel"><PanelHeader title="CPV Distribution" caption="Κορυφαίες κατηγορίες" /><CpvDonut /></article>
            </div>
            <TenderTable rows={filtered} />
          </>}

          {page === "tenders" && <TenderTable rows={filtered} expanded />}
          {page === "market" && <EmptyState icon="◉" title="Ανάλυση αγοράς και ανταγωνισμού" text="Η επόμενη οθόνη θα συνδέει CPV, αναδόχους, διαγωνισμούς και συμβάσεις." />}
          {page === "alerts" && <EmptyState icon="♢" title="Ειδοποιήσεις CPV" text="Οι ειδοποιήσεις θα ενεργοποιηθούν μαζί με τους λογαριασμούς χρηστών στη Supabase." />}
        </section>

        <aside className="filters">
          <div className="filterHeading"><div><span>Φίλτρα</span><small>{number.format(filtered.length)} αποτελέσματα</small></div><button onClick={() => { setStatus("Όλες"); setAuthority("Όλες"); setCpv(""); setQuery(""); }}>↻</button></div>
          <label>Έτος<select defaultValue="2025"><option>Όλα τα έτη</option><option>2025</option><option>2024</option><option>2023</option></select></label>
          <label>Αναθέτουσα Αρχή<select value={authority} onChange={(event) => setAuthority(event.target.value)}><option>Όλες</option>{authorities.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>CPV<input value={cpv} onChange={(event) => setCpv(event.target.value)} placeholder="Κωδικός ή λέξη" /></label>
          <label>Τύπος σύμβασης<select><option>Όλοι</option><option>Υπηρεσίες</option><option>Προμήθειες</option><option>Έργα</option><option>Μελέτες</option></select></label>
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

function CpvDonut() {
  return <div className="donutWrap"><div className="donut"><span><strong>6</strong><small>CPV</small></span></div><ul><li><i className="navy" />72262000-9 <b>31%</b></li><li><i className="teal" />50730000-1 <b>24%</b></li><li><i className="gold" />79411000-8 <b>18%</b></li><li><i className="pale" />Λοιπά <b>27%</b></li></ul></div>;
}

function TenderTable({ rows, expanded = false }: { rows: Tender[]; expanded?: boolean }) {
  return <article className={`panel tablePanel ${expanded ? "expanded" : ""}`}><PanelHeader title="Λίστα διαγωνισμών" caption={`${number.format(rows.length)} εγγραφές μετά τα φίλτρα`} /><div className="tableScroll"><table><thead><tr><th>ΑΔΑΜ</th><th>Τίτλος</th><th>Αναθέτουσα Αρχή</th><th>CPV</th><th>Κατάσταση</th><th>Δημοσίευση</th><th /></tr></thead><tbody>{rows.map((item) => <tr key={item.adam}><td className="adam">{item.adam}</td><td>{item.title}</td><td>{item.authority}</td><td>{item.cpv}</td><td><span className={`status ${statusTone[item.status]}`}>{item.status}</span></td><td>{item.date}</td><td><button className="view" aria-label="Προβολή">→</button></td></tr>)}</tbody></table></div>{!rows.length && <p className="noRows">Δεν βρέθηκαν διαγωνισμοί για τα επιλεγμένα φίλτρα.</p>}</article>;
}

function EmptyState({ icon, title, text }: { icon: string; title: string; text: string }) {
  return <article className="panel empty"><span>{icon}</span><h2>{title}</h2><p>{text}</p><button>Σύντομα διαθέσιμο</button></article>;
}

