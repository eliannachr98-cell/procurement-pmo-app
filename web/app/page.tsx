"use client";

import { useEffect, useMemo, useState } from "react";

type Status = "Ξ•Ξ½ΞµΟΞ³ΟΟ‚" | "Ξ‘ΞΎΞΉΞΏΞ»ΟΞ³Ξ·ΟƒΞ·" | "Ξ‘Ξ½Ξ±Ο„ΞµΞΈΞµΞΉΞΌΞ­Ξ½ΞΏΟ‚" | "ΞΞ»ΞΏΞΊΞ»Ξ·ΟΟ‰ΞΌΞ­Ξ½ΞΏΟ‚" | "Ξ‘ΞΊΟ…ΟΟ‰ΞΌΞ­Ξ½ΞΏΟ‚";
type Tender = {
  adam: string;
  title: string;
  authority: string;
  cpv: string;
  cpvDescription?: string;
  contractType?: string;
  procedureType?: string;
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
  { adam: "25PROC017081252", title: "Ξ¥Ο€Ξ·ΟΞµΟƒΞ―ΞµΟ‚ ΟƒΟ…ΞΌΞ²ΞΏΟΞ»ΞΏΟ… Ξ³ΞΉΞ± Ο„ΞΏΞ½ ΟΞ·Ο†ΞΉΞ±ΞΊΟ ΞΌΞµΟ„Ξ±ΟƒΟ‡Ξ·ΞΌΞ±Ο„ΞΉΟƒΞΌΟ", authority: "Ξ¥Ο€ΞΏΟ…ΟΞ³ΞµΞ―ΞΏ Ξ¨Ξ·Ο†ΞΉΞ±ΞΊΞ®Ο‚ Ξ”ΞΉΞ±ΞΊΟ…Ξ²Ξ­ΟΞ½Ξ·ΟƒΞ·Ο‚", cpv: "72262000-9", status: "Ξ•Ξ½ΞµΟΞ³ΟΟ‚", publicationDate: "2025-06-24", budget: 860000 },
];

const navItems = [
  ["overview", "β–¦", "Ξ•Ο€ΞΉΟƒΞΊΟΟ€Ξ·ΟƒΞ·"],
  ["tenders", "β·", "Ξ”ΞΉΞ±Ξ³Ο‰Ξ½ΞΉΟƒΞΌΞΏΞ―"],
  ["market", "β—‰", "Ξ‘Ξ³ΞΏΟΞ¬ & Ξ‘Ξ½Ο„Ξ±Ξ³Ο‰Ξ½ΞΉΟƒΞΌΟΟ‚"],
  ["alerts", "β™Ά", "Ξ•ΞΉΞ΄ΞΏΟ€ΞΏΞΉΞ®ΟƒΞµΞΉΟ‚"],
] as const;

const statusTone: Record<Status, string> = {
  "Ξ•Ξ½ΞµΟΞ³ΟΟ‚": "green",
  "Ξ‘ΞΎΞΉΞΏΞ»ΟΞ³Ξ·ΟƒΞ·": "amber",
  "Ξ‘Ξ½Ξ±Ο„ΞµΞΈΞµΞΉΞΌΞ­Ξ½ΞΏΟ‚": "blue",
  "ΞΞ»ΞΏΞΊΞ»Ξ·ΟΟ‰ΞΌΞ­Ξ½ΞΏΟ‚": "purple",
  "Ξ‘ΞΊΟ…ΟΟ‰ΞΌΞ­Ξ½ΞΏΟ‚": "red",
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
  const [status, setStatus] = useState("ΞΞ»ΞµΟ‚");
  const [authority, setAuthority] = useState("ΞΞ»ΞµΟ‚");
  const [contractor, setContractor] = useState("");
  const [cpv, setCpv] = useState("");
  const [year, setYear] = useState("ΞΞ»Ξ±");
  const [contractType, setContractType] = useState("ΞΞ»ΞΏΞΉ");

  useEffect(() => {
    fetch("/api/procurement")
      .then(async (response) => {
        if (!response.ok) throw new Error("Ξ”ΞµΞ½ Ξ®Ο„Ξ±Ξ½ Ξ΄Ο…Ξ½Ξ±Ο„Ξ® Ξ· Ο†ΟΟΟ„Ο‰ΟƒΞ· Ο„Ξ·Ο‚ Supabase");
        return response.json();
      })
      .then((payload) => {
        setTenders(payload.tenders ?? []);
        setAwards(payload.awards ?? []);
        setDataError("");
      })
      .catch((error) => setDataError(error instanceof Error ? error.message : "Ξ£Ο†Ξ¬Ξ»ΞΌΞ± Ξ΄ΞµΞ΄ΞΏΞΌΞ­Ξ½Ο‰Ξ½"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => tenders.filter((tender) => {
    const needle = query.trim().toLocaleLowerCase("el");
    const matchesQuery = !needle || `${tender.adam} ${tender.title} ${tender.authority}`.toLocaleLowerCase("el").includes(needle);
    return matchesQuery && (status === "ΞΞ»ΞµΟ‚" || tender.status === status) &&
      (!authority || authority === "ΞΞ»ΞµΟ‚" || tender.authority.toLocaleLowerCase("el").includes(authority.toLocaleLowerCase("el"))) &&
      (!contractor || (tender.contractors ?? []).join(" ").toLocaleLowerCase("el").includes(contractor.toLocaleLowerCase("el"))) &&
      (!cpv || `${tender.cpv} ${tender.cpvDescription}`.toLocaleLowerCase("el").includes(cpv.toLocaleLowerCase("el"))) &&
      (year === "ΞΞ»Ξ±" || tender.publicationDate?.startsWith(year)) &&
      (contractType === "ΞΞ»ΞΏΞΉ" || tender.contractType === contractType);
  }), [tenders, query, status, authority, contractor, cpv, year, contractType]);

  const authorities = [...new Set(tenders.map((item) => item.authority).filter(Boolean))].sort();
  const contractors = [...new Set(tenders.flatMap((item) => item.contractors ?? []).filter(Boolean))].sort();
  const years = [...new Set(tenders.map((item) => item.publicationDate?.slice(0, 4)).filter(Boolean))].sort().reverse();
  const contractTypes = [...new Set(tenders.map((item) => item.contractType).filter(Boolean))].sort();
  const statusCount = (value: Status) => filtered.filter((item) => item.status === value).length;

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brandMark">β–</span>
          <span><strong>TenderScope</strong><small>Ξ•Ξ»Ξ»Ξ·Ξ½ΞΉΞΊΟ Ξ Ξ±ΟΞ±Ο„Ξ·ΟΞ·Ο„Ξ®ΟΞΉΞΏ Ξ”Ξ·ΞΌΞΏΟƒΞ―Ο‰Ξ½ Ξ£Ο…ΞΌΞ²Ξ¬ΟƒΞµΟ‰Ξ½</small></span>
        </div>
        <nav aria-label="ΞΟΟΞΉΞ± Ο€Ξ»ΞΏΞ®Ξ³Ξ·ΟƒΞ·">
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
            <div><p className="eyebrow">PROCUREMENT INTELLIGENCE</p><h1>{page === "overview" ? "Ξ•Ο€ΞΉΟƒΞΊΟΟ€Ξ·ΟƒΞ·" : page === "tenders" ? "Ξ”ΞΉΞ±Ξ³Ο‰Ξ½ΞΉΟƒΞΌΞΏΞ―" : page === "market" ? "Ξ‘Ξ³ΞΏΟΞ¬ & Ξ‘Ξ½Ο„Ξ±Ξ³Ο‰Ξ½ΞΉΟƒΞΌΟΟ‚" : "Ξ•ΞΉΞ΄ΞΏΟ€ΞΏΞΉΞ®ΟƒΞµΞΉΟ‚"}</h1></div>
            <label className="search"><span>β•</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ξ‘Ξ½Ξ±Ξ¶Ξ®Ο„Ξ·ΟƒΞ· Ξ‘Ξ”Ξ‘Ξ, Ο„Ξ―Ο„Ξ»ΞΏΟ… Ξ® Ξ‘ΟΟ‡Ξ®Ο‚β€¦" /></label>
          </div>
          {loading && <div className="dataBanner">Ξ¦ΟΟΟ„Ο‰ΟƒΞ· Ο€ΟΞ±Ξ³ΞΌΞ±Ο„ΞΉΞΊΟΞ½ Ξ΄ΞµΞ΄ΞΏΞΌΞ­Ξ½Ο‰Ξ½ Ξ±Ο€Ο Supabaseβ€¦</div>}
          {dataError && <div className="dataBanner error">{dataError} Β· ΞµΞΌΟ†Ξ±Ξ½Ξ―Ξ¶ΞµΟ„Ξ±ΞΉ Ο€ΟΞΏΟƒΟ‰ΟΞΉΞ½Ο Ξ΄ΞµΞ―Ξ³ΞΌΞ±.</div>}

          {page === "overview" && <>
            <div className="metrics">
              <Metric label="Ξ”ΞΉΞ±Ξ³Ο‰Ξ½ΞΉΟƒΞΌΞΏΞ―" value={number.format(filtered.length)} tone="sky" />
              <Metric label="Ξ•Ξ½ΞµΟΞ³ΞΏΞ―" value={number.format(statusCount("Ξ•Ξ½ΞµΟΞ³ΟΟ‚"))} tone="mint" />
              <Metric label="Ξ£Ξµ Ξ±ΞΎΞΉΞΏΞ»ΟΞ³Ξ·ΟƒΞ·" value={number.format(statusCount("Ξ‘ΞΎΞΉΞΏΞ»ΟΞ³Ξ·ΟƒΞ·"))} tone="sand" />
              <Metric label="Ξ‘Ξ½Ξ±Ο„ΞµΞΈΞµΞΉΞΌΞ­Ξ½ΞΏΞΉ" value={number.format(statusCount("Ξ‘Ξ½Ξ±Ο„ΞµΞΈΞµΞΉΞΌΞ­Ξ½ΞΏΟ‚"))} tone="lilac" />
              <Metric label="Ξ£Ο…Ξ½ΞΏΞ»ΞΉΞΊΟΟ‚ Ξ /Ξ¥" value={euro.format(filtered.reduce((sum, item) => sum + item.budget, 0))} tone="sage" />
            </div>
            <div className="chartGrid">
              <article className="panel"><PanelHeader title="Ξ”ΞΉΞ±Ξ³Ο‰Ξ½ΞΉΟƒΞΌΞΏΞ― Ξ±Ξ½Ξ¬ ΟƒΟ„Ξ¬Ξ΄ΞΉΞΏ" caption="Ξ¤ΟΞ­Ο‡ΞΏΟ…ΟƒΞ± ΞµΞΉΞΊΟΞ½Ξ±" /><StatusBars rows={filtered} /></article>
              <article className="panel"><PanelHeader title="CPV Distribution" caption="ΞΞΏΟΟ…Ο†Ξ±Ξ―ΞµΟ‚ ΞΊΞ±Ο„Ξ·Ξ³ΞΏΟΞ―ΞµΟ‚" /><CpvDonut rows={filtered} /></article>
            </div>
            <NutsMap rows={filtered.filter((item) => item.status === "Ξ•Ξ½ΞµΟΞ³ΟΟ‚")} />
            <TenderTable rows={filtered} />
          </>}

          {page === "tenders" && <TenderTable rows={filtered} expanded />}
          {page === "market" && <MarketPanel awards={awards} cpv={cpv} setCpv={setCpv} />}
          {page === "alerts" && <EmptyState icon="β™Ά" title="Ξ•ΞΉΞ΄ΞΏΟ€ΞΏΞΉΞ®ΟƒΞµΞΉΟ‚ CPV" text="ΞΞΉ ΞµΞΉΞ΄ΞΏΟ€ΞΏΞΉΞ®ΟƒΞµΞΉΟ‚ ΞΈΞ± ΞµΞ½ΞµΟΞ³ΞΏΟ€ΞΏΞΉΞ·ΞΈΞΏΟΞ½ ΞΌΞ±Ξ¶Ξ― ΞΌΞµ Ο„ΞΏΟ…Ο‚ Ξ»ΞΏΞ³Ξ±ΟΞΉΞ±ΟƒΞΌΞΏΟΟ‚ Ο‡ΟΞ·ΟƒΟ„ΟΞ½ ΟƒΟ„Ξ· Supabase." />}
        </section>

        <aside className="filters">
          <div className="filterHeading"><div><span>Ξ¦Ξ―Ξ»Ο„ΟΞ±</span><small>{number.format(filtered.length)} Ξ±Ο€ΞΏΟ„ΞµΞ»Ξ­ΟƒΞΌΞ±Ο„Ξ±</small></div><button onClick={() => { setStatus("ΞΞ»ΞµΟ‚"); setAuthority(""); setContractor(""); setCpv(""); setQuery(""); setYear("ΞΞ»Ξ±"); setContractType("ΞΞ»ΞΏΞΉ"); }}>β†»</button></div>
          <label>ΞΟ„ΞΏΟ‚<select value={year} onChange={(event) => setYear(event.target.value)}><option>ΞΞ»Ξ±</option>{years.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Ξ‘Ξ½Ξ±ΞΈΞ­Ο„ΞΏΟ…ΟƒΞ± Ξ‘ΟΟ‡Ξ®<input list="authority-options" value={authority === "ΞΞ»ΞµΟ‚" ? "" : authority} onChange={(event) => setAuthority(event.target.value)} placeholder="Ξ“ΟΞ¬ΟΞµ Ξ® ΞµΟ€Ξ―Ξ»ΞµΞΎΞµ Ξ±ΟΟ‡Ξ®" /><datalist id="authority-options">{authorities.map((item) => <option key={item} value={item} />)}</datalist></label>
          <label>Ξ‘Ξ½Ξ¬Ξ΄ΞΏΟ‡ΞΏΟ‚<input list="contractor-options" value={contractor} onChange={(event) => setContractor(event.target.value)} placeholder="Ξ“ΟΞ¬ΟΞµ Ξ® ΞµΟ€Ξ―Ξ»ΞµΞΎΞµ Ξ±Ξ½Ξ¬Ξ΄ΞΏΟ‡ΞΏ" /><datalist id="contractor-options">{contractors.map((item) => <option key={item} value={item} />)}</datalist></label>
          <label>CPV<input value={cpv} onChange={(event) => setCpv(event.target.value)} placeholder="ΞΟ‰Ξ΄ΞΉΞΊΟΟ‚ Ξ® Ξ»Ξ­ΞΎΞ·" /></label>
          <label>Ξ¤ΟΟ€ΞΏΟ‚ ΟƒΟΞΌΞ²Ξ±ΟƒΞ·Ο‚<select value={contractType} onChange={(event) => setContractType(event.target.value)}><option>ΞΞ»ΞΏΞΉ</option>{contractTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>ΞΞ±Ο„Ξ¬ΟƒΟ„Ξ±ΟƒΞ·<select value={status} onChange={(event) => setStatus(event.target.value)}><option>ΞΞ»ΞµΟ‚</option>{Object.keys(statusTone).map((item) => <option key={item}>{item}</option>)}</select></label>
          <div className="filterNote"><span>i</span><p>Ξ¤Ξ± Ξ―Ξ΄ΞΉΞ± Ο†Ξ―Ξ»Ο„ΟΞ± ΞµΟ†Ξ±ΟΞΌΟΞ¶ΞΏΞ½Ο„Ξ±ΞΉ ΟƒΟ„Ξ·Ξ½ Ξ•Ο€ΞΉΟƒΞΊΟΟ€Ξ·ΟƒΞ· ΞΊΞ±ΞΉ ΟƒΟ„ΞΏΟ…Ο‚ Ξ”ΞΉΞ±Ξ³Ο‰Ξ½ΞΉΟƒΞΌΞΏΟΟ‚.</p></div>
        </aside>
      </div>
    </main>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: string }) {
  return <article className={`metric ${tone}`}><span>{label}</span><strong>{value}</strong></article>;
}

function PanelHeader({ title, caption }: { title: string; caption: string }) {
  return <header className="panelHeader"><div><h2>{title}</h2><p>{caption}</p></div><button>β€Άβ€Άβ€Ά</button></header>;
}

function StatusBars({ rows }: { rows: Tender[] }) {
  const statuses: Status[] = ["Ξ•Ξ½ΞµΟΞ³ΟΟ‚", "Ξ‘ΞΎΞΉΞΏΞ»ΟΞ³Ξ·ΟƒΞ·", "Ξ‘Ξ½Ξ±Ο„ΞµΞΈΞµΞΉΞΌΞ­Ξ½ΞΏΟ‚", "ΞΞ»ΞΏΞΊΞ»Ξ·ΟΟ‰ΞΌΞ­Ξ½ΞΏΟ‚", "Ξ‘ΞΊΟ…ΟΟ‰ΞΌΞ­Ξ½ΞΏΟ‚"];
  const maximum = Math.max(1, ...statuses.map((item) => rows.filter((row) => row.status === item).length));
  return <div className="bars">{statuses.map((item) => { const count = rows.filter((row) => row.status === item).length; return <div className="barRow" key={item}><span>{item}</span><div><i className={statusTone[item]} style={{ width: `${(count / maximum) * 100}%` }} /></div><strong>{number.format(count)}</strong></div>; })}</div>;
}

function CpvDonut({ rows }: { rows: Tender[] }) {
  const counts = [...rows.reduce((map, item) => map.set(item.cpv, (map.get(item.cpv) ?? 0) + 1), new Map<string, number>())]
    .sort((a, b) => b[1] - a[1]);
  const top = counts.slice(0, 3);
  const other = counts.slice(3).reduce((sum, item) => sum + item[1], 0);
  const total = Math.max(rows.length, 1);
  return <div className="donutWrap"><div className="donut"><span><strong>{number.format(counts.length)}</strong><small>CPV</small></span></div><ul>{top.map(([code, count], index) => { const row = rows.find((item) => item.cpv === code); return <li key={code} title={row?.cpvDescription}><i className={["navy", "teal", "gold"][index]} /><span><b>{code}</b><small>{row?.cpvDescription || "Ξ§Ο‰ΟΞ―Ο‚ Ο€ΞµΟΞΉΞ³ΟΞ±Ο†Ξ®"}</small></span><b>{Math.round(count / total * 100)}%</b></li>; })}{other > 0 && <li><i className="pale" />Ξ›ΞΏΞΉΟ€Ξ¬ <b>{Math.round(other / total * 100)}%</b></li>}</ul></div>;
}

function TenderTable({ rows, expanded = false }: { rows: Tender[]; expanded?: boolean }) {
  const [selected, setSelected] = useState<Tender | null>(null);
  if (selected) return <TenderDetail tender={selected} onBack={() => setSelected(null)} />;
  return <article className={`panel tablePanel ${expanded ? "expanded" : ""}`}><PanelHeader title="Ξ›Ξ―ΟƒΟ„Ξ± Ξ΄ΞΉΞ±Ξ³Ο‰Ξ½ΞΉΟƒΞΌΟΞ½" caption={`${number.format(rows.length)} ΞµΞ³Ξ³ΟΞ±Ο†Ξ­Ο‚ ΞΌΞµΟ„Ξ¬ Ο„Ξ± Ο†Ξ―Ξ»Ο„ΟΞ±`} /><div className="tableScroll"><table><thead><tr><th>Ξ‘Ξ”Ξ‘Ξ</th><th>Ξ¤Ξ―Ο„Ξ»ΞΏΟ‚</th><th>Ξ‘Ξ½Ξ±ΞΈΞ­Ο„ΞΏΟ…ΟƒΞ± Ξ‘ΟΟ‡Ξ®</th><th>CPV / Ξ¤Ξ―Ο„Ξ»ΞΏΟ‚</th><th>ΞΞ±Ο„Ξ¬ΟƒΟ„Ξ±ΟƒΞ·</th><th>Ξ”Ξ·ΞΌΞΏΟƒΞ―ΞµΟ…ΟƒΞ·</th><th /></tr></thead><tbody>{rows.map((item) => <tr key={item.adam}><td className="adam">{item.adam}</td><td>{item.title}</td><td>{item.authority}</td><td><strong>{item.cpv}</strong><small className="cellSub">{item.cpvDescription}</small></td><td><span className={`status ${statusTone[item.status]}`}>{item.status}</span></td><td>{formatDate(item.publicationDate)}</td><td><button className="view" aria-label={`Ξ ΟΞΏΞ²ΞΏΞ»Ξ® ${item.adam}`} onClick={() => setSelected(item)}>β†’</button></td></tr>)}</tbody></table></div>{!rows.length && <p className="noRows">Ξ”ΞµΞ½ Ξ²ΟΞ­ΞΈΞ·ΞΊΞ±Ξ½ Ξ΄ΞΉΞ±Ξ³Ο‰Ξ½ΞΉΟƒΞΌΞΏΞ― Ξ³ΞΉΞ± Ο„Ξ± ΞµΟ€ΞΉΞ»ΞµΞ³ΞΌΞ­Ξ½Ξ± Ο†Ξ―Ξ»Ο„ΟΞ±.</p>}</article>;
}

function TenderDetail({ tender, onBack }: { tender: Tender; onBack: () => void }) {
  const milestones = [
    ["Ξ”Ξ·ΞΌΞΏΟƒΞ―ΞµΟ…ΟƒΞ·", tender.publicationDate], ["Ξ‘Ο€ΞΏΟƒΟ†ΟΞ¬Ξ³ΞΉΟƒΞ·", tender.openingDate], ["Ξ‘Ξ½Ξ¬ΞΈΞµΟƒΞ·", tender.awardDate],
    ["Ξ£ΟΞΌΞ²Ξ±ΟƒΞ·", tender.contractDates?.[0]], ["Ξ Ξ±ΟΞ¬Ξ΄ΞΏΟƒΞ·", tender.deliveryDates?.[0]],
  ].filter((item): item is [string, string] => Boolean(item[1]));
  const dates = milestones.map((item) => new Date(item[1]).getTime()).filter(Number.isFinite);
  const start = Math.min(...dates); const end = Math.max(...dates); const span = Math.max(end - start, 86400000);
  return <article className="panel tenderDetail"><button className="back" onClick={onBack}>β† Ξ Ξ―ΟƒΟ‰ ΟƒΟ„Ξ· Ξ»Ξ―ΟƒΟ„Ξ±</button><p className="eyebrow">ΞΞ‘Ξ΅Ξ¤Ξ•Ξ›Ξ‘ Ξ”Ξ™Ξ‘Ξ“Ξ©ΞΞ™Ξ£ΞΞΞ¥</p><h2>{tender.title}</h2><p className="detailMeta">{tender.adam} Β· {tender.authority} Β· {tender.cpv} {tender.cpvDescription}</p><div className="detailMetrics"><Metric label="Ξ ΟΞΏΟ‹Ο€ΞΏΞ»ΞΏΞ³ΞΉΟƒΞΌΟΟ‚" value={euro.format(tender.budget)} tone="sky" /><Metric label="Ξ‘ΞΎΞ―Ξ± Ξ±Ξ½Ξ¬ΞΈΞµΟƒΞ·Ο‚" value={euro.format(tender.awardValue ?? 0)} tone="sand" /><Metric label="Ξ‘ΞΎΞ―Ξ± ΟƒΟΞΌΞ²Ξ±ΟƒΞ·Ο‚" value={euro.format(tender.contractValue ?? 0)} tone="mint" /></div><section className="gantt"><h3>Ξ§ΟΞΏΞ½ΞΏΞ΄ΞΉΞ¬Ξ³ΟΞ±ΞΌΞΌΞ± Ξ΄ΞΉΞ±Ξ³Ο‰Ξ½ΞΉΟƒΞΌΞΏΟ</h3>{milestones.map(([label,date], index) => <div className="ganttRow" key={`${label}-${date}`}><span>{label}</span><div><i style={{left:`${((new Date(date).getTime()-start)/span)*88}%`,width:index === milestones.length-1 ? "12%" : `${Math.max(8,((new Date(milestones[Math.min(index+1,milestones.length-1)][1]).getTime()-new Date(date).getTime())/span)*88)}%`}} /></div><time>{formatDate(date)}</time></div>)}</section><div className="detailFacts"><p><b>Ξ‘Ξ½Ξ¬Ξ΄ΞΏΟ‡ΞΏΟ‚:</b> {tender.contractors?.join(", ") || "Ξ”ΞµΞ½ Ξ­Ο‡ΞµΞΉ ΞΊΞ±Ο„Ξ±Ο‡Ο‰ΟΞΉΟƒΟ„ΞµΞ―"}</p><p><b>Ξ¤ΟΟ€ΞΏΟ‚ Ξ΄ΞΉΞ±Ξ΄ΞΉΞΊΞ±ΟƒΞ―Ξ±Ο‚:</b> {tender.procedureType || "β€”"}</p><p><b>NUTS:</b> {[tender.nutsCode,tender.nutsName].filter(Boolean).join(" Β· ") || "β€”"}</p></div></article>;
}

function NutsMap({ rows }: { rows: Tender[] }) {
  const regions = [...rows.reduce((map, item) => { const key = item.nutsName || item.nutsCode || "Ξ§Ο‰ΟΞ―Ο‚ NUTS"; map.set(key, (map.get(key) ?? 0) + 1); return map; }, new Map<string, number>())].sort((a,b) => b[1]-a[1]);
  const max = Math.max(1,...regions.map((item) => item[1]));
  return <article className="panel nutsPanel"><PanelHeader title="Ξ•Ξ½ΞµΟΞ³ΞΏΞ― Ξ΄ΞΉΞ±Ξ³Ο‰Ξ½ΞΉΟƒΞΌΞΏΞ― Ξ±Ξ½Ξ¬ NUTS" caption={`${number.format(rows.length)} ΞµΞ½ΞµΟΞ³ΞΏΞ― Ξ΄ΞΉΞ±Ξ³Ο‰Ξ½ΞΉΟƒΞΌΞΏΞ―`} /><div className="nutsMap"><div className="greeceShape"><span className="north">Ξ’ΟΟΞµΞΉΞ± Ξ•Ξ»Ξ»Ξ¬Ξ΄Ξ±</span><span className="central">ΞΞµΞ½Ο„ΟΞΉΞΊΞ® Ξ•Ξ»Ξ»Ξ¬Ξ΄Ξ±</span><span className="attica">Ξ‘Ο„Ο„ΞΉΞΊΞ®</span><span className="islands">ΞΞ·ΟƒΞΉΞ¬</span><span className="crete">ΞΟΞ®Ο„Ξ·</span></div><div className="nutsLegend">{regions.slice(0,10).map(([name,count]) => <div key={name}><span title={name}>{name}</span><i><b style={{width:`${(count/max)*100}%`}} /></i><strong>{number.format(count)}</strong></div>)}</div></div></article>;
}

function MarketPanel({ awards, cpv, setCpv }: { awards: Award[]; cpv: string; setCpv: (value: string) => void }) {
  const cpvOptions = [...new Map(awards.filter((item) => item.cpv !== "β€”").map((item) => [item.cpv, item.cpvDescription || "Ξ§Ο‰ΟΞ―Ο‚ Ο€ΞµΟΞΉΞ³ΟΞ±Ο†Ξ®"])).entries()].sort();
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
      <div><p className="eyebrow">COMPETITION MAPPING</p><h2>Ξ‘Ξ½Ξ¬Ξ»Ο…ΟƒΞ· Ξ±Ξ½Ο„Ξ±Ξ³Ο‰Ξ½ΞΉΟƒΞΌΞΏΟ Ξ±Ξ½Ξ¬ CPV</h2><p>Ξ•Ο€Ξ―Ξ»ΞµΞΎΞµ CPV Ξ³ΞΉΞ± Ξ½Ξ± Ξ΄ΞµΞΉΟ‚ Ο„ΞΏΟ…Ο‚ Ξ±Ξ½Ξ±Ξ΄ΟΟ‡ΞΏΟ…Ο‚, Ο„ΞΉΟ‚ Ξ±Ξ½Ξ±ΞΈΞ­ΟƒΞµΞΉΟ‚ ΞΊΞ±ΞΉ Ο„Ξ· ΟƒΟ…Ξ½ΞΏΞ»ΞΉΞΊΞ® Ξ±ΞΎΞ―Ξ±.</p></div>
      <label>CPV<select value={cpv} onChange={(event) => setCpv(event.target.value)}><option value="">ΞΞ»ΞΏΞΉ ΞΏΞΉ Ξ΄ΞΉΞ±ΞΈΞ­ΟƒΞΉΞΌΞΏΞΉ CPV</option>{cpvOptions.map(([code,title]) => <option key={code} value={code}>{code} β€” {title}</option>)}</select></label>
    </article>
    <div className="metrics marketMetrics">
      <Metric label="Ξ‘Ξ½Ξ±ΞΈΞ­ΟƒΞµΞΉΟ‚" value={number.format(relevant.length)} tone="sky" />
      <Metric label="Ξ‘Ξ½Ξ¬Ξ΄ΞΏΟ‡ΞΏΞΉ" value={number.format(contractors.length)} tone="mint" />
      <Metric label="Ξ‘Ξ½Ξ±ΞΈΞ­Ο„ΞΏΟ…ΟƒΞµΟ‚ Ξ‘ΟΟ‡Ξ­Ο‚" value={number.format(new Set(relevant.map((item) => item.authority)).size)} tone="sand" />
      <Metric label="Ξ£Ο…Ξ½ΞΏΞ»ΞΉΞΊΞ® Ξ±ΞΎΞ―Ξ±" value={euro.format(relevant.reduce((sum, item) => sum + item.value, 0))} tone="lilac" />
    </div>
    <article className="panel tablePanel"><PanelHeader title="ΞΞ±Ο„Ξ¬Ο„Ξ±ΞΎΞ· Ξ±Ξ½Ξ±Ξ΄ΟΟ‡Ο‰Ξ½" caption={`${number.format(contractors.length)} Ξ±Ξ½Ξ¬Ξ΄ΞΏΟ‡ΞΏΞΉ ΟƒΟ„Ξ± Ο„ΟΞ­Ο‡ΞΏΞ½Ο„Ξ± Ξ΄ΞµΞ΄ΞΏΞΌΞ­Ξ½Ξ±`} /><div className="tableScroll"><table><thead><tr><th>Ξ‘Ξ½Ξ¬Ξ΄ΞΏΟ‡ΞΏΟ‚</th><th>Ξ‘Ξ½Ξ±ΞΈΞ­ΟƒΞµΞΉΟ‚</th><th>Ξ‘Ξ½Ξ±ΞΈΞ­Ο„ΞΏΟ…ΟƒΞµΟ‚ Ξ‘ΟΟ‡Ξ­Ο‚</th><th>Ξ£Ο…Ξ½ΞΏΞ»ΞΉΞΊΞ® Ξ±ΞΎΞ―Ξ±</th></tr></thead><tbody>{contractors.map((item) => <tr key={item.name}><td><strong>{item.name}</strong></td><td>{number.format(item.awards)}</td><td>{number.format(item.authorities.size)}</td><td>{euro.format(item.value)}</td></tr>)}</tbody></table></div>{!contractors.length && <p className="noRows">Ξ”ΞµΞ½ Ξ²ΟΞ­ΞΈΞ·ΞΊΞ±Ξ½ Ξ±Ξ½Ξ±ΞΈΞ­ΟƒΞµΞΉΟ‚ Ξ³ΞΉΞ± Ο„ΞΏΞ½ ΞµΟ€ΞΉΞ»ΞµΞ³ΞΌΞ­Ξ½ΞΏ CPV.</p>}</article>
  </>;
}

function formatDate(value?: string) {
  if (!value) return "β€”";
  return new Intl.DateTimeFormat("el-GR").format(new Date(value));
}

function EmptyState({ icon, title, text }: { icon: string; title: string; text: string }) {
  return <article className="panel empty"><span>{icon}</span><h2>{title}</h2><p>{text}</p><button>Ξ£ΟΞ½Ο„ΞΏΞΌΞ± Ξ΄ΞΉΞ±ΞΈΞ­ΟƒΞΉΞΌΞΏ</button></article>;
}

