from pathlib import Path
import sqlite3
from datetime import date, datetime

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

BASE = Path(__file__).resolve().parent
DB_PATH = BASE / "procurement.db"

st.set_page_config(page_title="Procurement PMO Intelligence", page_icon="📊", layout="wide")

# ---------- Styling ----------
st.markdown("""
<style>
.block-container {padding-top: 1.4rem; padding-bottom: 2rem;}
[data-testid="stMetric"] {border:1px solid #e7e7e7; border-radius:12px; padding:12px 14px; background:white;}
.small-muted {color:#6b7280; font-size:0.88rem;}
.stage {border:1px solid #e5e7eb; border-radius:12px; padding:12px; min-height:110px; background:#fff;}
.stage-title {font-size:.82rem; color:#6b7280; margin-bottom:4px;}
.stage-date {font-size:1.02rem; font-weight:700;}
.stage-note {font-size:.78rem; color:#6b7280; margin-top:6px;}
</style>
""", unsafe_allow_html=True)

@st.cache_resource
def get_conn():
    return sqlite3.connect(DB_PATH, check_same_thread=False)

@st.cache_data(show_spinner=False)
def load_all():
    return pd.read_sql_query("SELECT * FROM tenders", get_conn())

@st.cache_data(show_spinner=False)
def distinct_values(col):
    allowed = {"authority", "cpv_code", "procedure", "contract_type"}
    if col not in allowed:
        return []
    q = f'SELECT DISTINCT "{col}" FROM tenders WHERE "{col}" IS NOT NULL AND TRIM("{col}") <> "" ORDER BY "{col}"'
    return [r[0] for r in get_conn().execute(q).fetchall()]

def parse_dates(df):
    for c in ["publication_date","opening_date","cancellation_date","award_date",
              "contract_date_1","contract_date_2","contract_date_3","contract_date_4",
              "delivery_date_1","delivery_date_2","delivery_date_3","delivery_date_4"]:
        if c in df:
            df[c] = pd.to_datetime(df[c], errors="coerce")
    return df

def first_non_null(row, cols):
    for c in cols:
        v = row.get(c)
        if pd.notna(v) and str(v).strip() not in ("", "None", "nan"):
            return v
    return None

def lifecycle_status(row, today=None):
    today = pd.Timestamp(today or date.today())
    if bool(row.get("cancelled", 0)):
        return "Ματαιωμένος"
    deliveries = [row.get(f"delivery_date_{i}") for i in range(1,5)]
    deliveries = [x for x in deliveries if pd.notna(x)]
    contracts = [row.get(f"contract_date_{i}") for i in range(1,5)]
    contracts = [x for x in contracts if pd.notna(x)]
    if deliveries:
        if max(deliveries) <= today:
            return "Ολοκληρωμένος"
        return "Σε υλοποίηση"
    if contracts:
        return "Σε υλοποίηση"
    if pd.notna(row.get("award_date")):
        return "Ανατεθειμένος"
    if pd.notna(row.get("opening_date")) and row.get("opening_date") <= today:
        return "Αξιολόγηση"
    return "Ενεργός / πριν την αποσφράγιση"

def add_status(df):
    if df.empty:
        df["status"] = []
        return df
    df = df.copy()
    df["status"] = df.apply(lifecycle_status, axis=1)
    return df

def eur(x):
    if pd.isna(x): return "—"
    return f"€{x:,.0f}".replace(",", ".")

def fmt_date(x):
    if pd.isna(x): return "—"
    return pd.Timestamp(x).strftime("%d/%m/%Y")

def days_between(a, b):
    if pd.isna(a) or pd.isna(b): return None
    d = (pd.Timestamp(b) - pd.Timestamp(a)).days
    return d if d >= 0 else None

def render_stage(title, value, note=""):
    st.markdown(f'<div class="stage"><div class="stage-title">{title}</div><div class="stage-date">{value}</div><div class="stage-note">{note}</div></div>', unsafe_allow_html=True)

# ---------- Data ----------
if not DB_PATH.exists():
    st.error("Δεν βρέθηκε η βάση procurement.db. Τρέξε πρώτα το preprocess_master.py.")
    st.stop()

df = parse_dates(load_all())
df = add_status(df)

# ---------- Header ----------
st.title("Procurement PMO Intelligence")
st.caption("Παρακολούθηση δημόσιων διαγωνισμών • lifecycle • CPV competition mapping")

# ---------- Global filters ----------
with st.sidebar:
    st.header("Φίλτρα")
    authority_opts = distinct_values("authority")
    authority = st.selectbox("Αναθέτουσα Αρχή", ["Όλες"] + authority_opts)

    cpv_search = st.text_input("CPV (κωδικός ή λέξη)", placeholder="π.χ. 72000000 ή λογισμικό")
    status_opts = ["Όλα", "Ενεργοί μόνο", "Ενεργός / πριν την αποσφράγιση", "Αξιολόγηση", "Ανατεθειμένος", "Σε υλοποίηση", "Ολοκληρωμένος", "Ματαιωμένος"]
    status_filter = st.selectbox("Κατάσταση", status_opts)

    min_date = df["publication_date"].min().date() if df["publication_date"].notna().any() else date(2024,1,1)
    max_date = df["publication_date"].max().date() if df["publication_date"].notna().any() else date.today()
    date_range = st.date_input("Ημ. δημοσίευσης", value=(min_date, max_date), min_value=min_date, max_value=max_date)

    st.divider()
    st.caption("Πηγή: ενοποιημένο φύλλο Δ-2024 του Master File")

f = df.copy()
if authority != "Όλες":
    f = f[f["authority"] == authority]
if cpv_search.strip():
    s = cpv_search.strip().lower()
    f = f[
        f["cpv_code"].fillna("").astype(str).str.lower().str.contains(s, regex=False) |
        f["cpv_description"].fillna("").astype(str).str.lower().str.contains(s, regex=False)
    ]
if isinstance(date_range, (tuple,list)) and len(date_range)==2:
    start,end = pd.Timestamp(date_range[0]), pd.Timestamp(date_range[1])
    f = f[(f["publication_date"] >= start) & (f["publication_date"] <= end)]
if status_filter == "Ενεργοί μόνο":
    f = f[~f["status"].isin(["Ολοκληρωμένος", "Ματαιωμένος"])]
elif status_filter != "Όλα":
    f = f[f["status"] == status_filter]

# ---------- Navigation ----------
page = st.radio("", ["Dashboard", "Διαγωνισμοί", "Καρτέλα Διαγωνισμού", "Competition Mapping"], horizontal=True, label_visibility="collapsed")
st.divider()

if page == "Dashboard":
    c1,c2,c3,c4,c5 = st.columns(5)
    c1.metric("Διαγωνισμοί", f"{f['tender_adam'].nunique():,}".replace(",","."))
    active = (~f["status"].isin(["Ολοκληρωμένος","Ματαιωμένος"])).sum()
    c2.metric("Ενεργοί", f"{active:,}".replace(",","."))
    c3.metric("Συνολικός Π/Υ", eur(f["budget_vat"].sum()))
    c4.metric("Συμβασιοποιημένη αξία", eur(f["total_contract_value"].sum()))
    cancelled = (f["status"]=="Ματαιωμένος").mean()*100 if len(f) else 0
    c5.metric("Ματαιώσεις", f"{cancelled:.1f}%")

    left,right = st.columns(2)
    with left:
        st.subheader("Διαγωνισμοί ανά στάδιο")
        s = f["status"].value_counts().reset_index()
        s.columns=["Στάδιο","Πλήθος"]
        fig=px.bar(s, x="Στάδιο", y="Πλήθος", text_auto=True)
        fig.update_layout(xaxis_title=None, yaxis_title=None, height=390)
        st.plotly_chart(fig, use_container_width=True)
    with right:
        st.subheader("Top CPV")
        cp = (f.assign(cpv_label=f["cpv_code"].fillna("—")+" · "+f["cpv_description"].fillna(""))
                .groupby("cpv_label")["tender_adam"].nunique().sort_values(ascending=False).head(12).reset_index(name="Πλήθος"))
        fig=px.bar(cp.sort_values("Πλήθος"), x="Πλήθος", y="cpv_label", orientation="h")
        fig.update_layout(xaxis_title=None, yaxis_title=None, height=390)
        st.plotly_chart(fig, use_container_width=True)

    st.subheader("Χρόνοι lifecycle")
    dd=f.copy()
    dd["pub_to_open"]=(dd["opening_date"]-dd["publication_date"]).dt.days
    dd["open_to_award"]=(dd["award_date"]-dd["opening_date"]).dt.days
    dd["award_to_contract"]=(dd["contract_date_1"]-dd["award_date"]).dt.days
    t1,t2,t3 = st.columns(3)
    for box,col,label in [(t1,"pub_to_open","Δημοσίευση → Αποσφράγιση"),(t2,"open_to_award","Αποσφράγιση → Ανάθεση"),(t3,"award_to_contract","Ανάθεση → Σύμβαση")]:
        vals=dd.loc[dd[col]>=0,col]
        box.metric(label, "—" if vals.empty else f"{vals.mean():.0f} ημέρες")

elif page == "Διαγωνισμοί":
    st.subheader("Λίστα διαγωνισμών")
    st.caption(f"{len(f):,} εγγραφές μετά τα φίλτρα".replace(",","."))
    show = f[["tender_adam","title","authority","cpv_code","publication_date","opening_date","award_date","contract_date_1","status","budget_vat","total_contract_value"]].copy()
    show.columns=["ΑΔΑΜ","Τίτλος","Αναθέτουσα Αρχή","CPV","Δημοσίευση","Αποσφράγιση","Ανάθεση","1η Σύμβαση","Κατάσταση","Π/Υ με ΦΠΑ","Αξία Συμβάσεων"]
    show=show.sort_values("Δημοσίευση",ascending=False)
    st.dataframe(show, use_container_width=True, hide_index=True, height=620,
                 column_config={"Π/Υ με ΦΠΑ":st.column_config.NumberColumn(format="€ %.2f"),"Αξία Συμβάσεων":st.column_config.NumberColumn(format="€ %.2f")})

elif page == "Καρτέλα Διαγωνισμού":
    st.subheader("Καρτέλα Διαγωνισμού")
    options = f[["tender_adam","title"]].dropna(subset=["tender_adam"]).drop_duplicates("tender_adam")
    options["label"] = options["tender_adam"] + " — " + options["title"].fillna("").str.slice(0,100)
    if options.empty:
        st.info("Δεν υπάρχουν διαγωνισμοί με τα επιλεγμένα φίλτρα.")
        st.stop()
    selected = st.selectbox("Επίλεξε διαγωνισμό", options["label"].tolist())
    adam = selected.split(" — ",1)[0]
    r = f[f["tender_adam"]==adam].iloc[0]

    st.markdown(f"### {r['title']}")
    st.caption(f"{r['tender_adam']} • {r['authority']} • {r['cpv_code']} {r['cpv_description'] or ''}")
    m1,m2,m3,m4=st.columns(4)
    m1.metric("Κατάσταση",r["status"])
    m2.metric("Προϋπολογισμός",eur(r["budget_vat"]))
    m3.metric("Αξία ανάθεσης",eur(r["award_value"]))
    m4.metric("Σύνολο συμβάσεων",eur(r["total_contract_value"]))

    st.markdown("#### Lifecycle")
    first_contract = first_non_null(r,[f"contract_date_{i}" for i in range(1,5)])
    first_delivery = first_non_null(r,[f"delivery_date_{i}" for i in range(1,5)])
    a,b,c,d,e,fstage,g = st.columns(7)
    with a: render_stage("Δημοσίευση",fmt_date(r["publication_date"]),"Έναρξη procurement lifecycle")
    with b: render_stage("Υποβολή","Μη διαθέσιμο","Δεν υπάρχει ξεχωριστή ημερομηνία στο Master")
    with c: render_stage("Αποσφράγιση",fmt_date(r["opening_date"]),f"{days_between(r['publication_date'],r['opening_date']) or '—'} ημέρες από δημοσίευση")
    with d: render_stage("Αξιολόγηση","Proxy περίοδος", "Αποσφράγιση → Ανάθεση")
    with e: render_stage("Ανάθεση",fmt_date(r["award_date"]),f"{days_between(r['opening_date'],r['award_date']) or '—'} ημέρες αξιολόγησης")
    with fstage: render_stage("Σύμβαση",fmt_date(first_contract),f"{days_between(r['award_date'],first_contract) or '—'} ημέρες μετά την ανάθεση")
    with g: render_stage("Παράδοση",fmt_date(first_delivery),f"{days_between(first_contract,first_delivery) or '—'} ημέρες μετά τη σύμβαση")

    gantt=[]
    def add_phase(name,start,end):
        if pd.notna(start) and pd.notna(end) and pd.Timestamp(end)>=pd.Timestamp(start):
            gantt.append({"Στάδιο":name,"Έναρξη":pd.Timestamp(start),"Λήξη":pd.Timestamp(end)})
    add_phase("Προκήρυξη / προετοιμασία",r["publication_date"],r["opening_date"])
    add_phase("Αξιολόγηση (proxy)",r["opening_date"],r["award_date"])
    add_phase("Συμβασιοποίηση",r["award_date"],first_contract)
    add_phase("Υλοποίηση / Παράδοση",first_contract,first_delivery)
    if gantt:
        fig=px.timeline(pd.DataFrame(gantt),x_start="Έναρξη",x_end="Λήξη",y="Στάδιο",text="Στάδιο")
        fig.update_yaxes(autorange="reversed",title=None)
        fig.update_layout(xaxis_title=None,height=360,showlegend=False)
        st.plotly_chart(fig,use_container_width=True)

    st.markdown("#### Συμβάσεις & ανάδοχοι")
    contracts=[]
    for i in range(1,5):
        ca=r.get(f"contract_adam_{i}")
        if pd.notna(ca) and str(ca).strip():
            contracts.append({
                "ΑΔΑΜ Σύμβασης":ca,
                "Ημ. Σύμβασης":r.get(f"contract_date_{i}"),
                "Ημ. Παράδοσης":r.get(f"delivery_date_{i}"),
                "Ανάδοχος":r.get(f"contractor_{i}"),
                "Αξία":r.get(f"contract_value_{i}")
            })
    if contracts:
        st.dataframe(pd.DataFrame(contracts),use_container_width=True,hide_index=True,
                     column_config={"Αξία":st.column_config.NumberColumn(format="€ %.2f")})
    else:
        st.info("Δεν έχει συνδεθεί σύμβαση με αυτόν τον διαγωνισμό.")

elif page == "Competition Mapping":
    st.subheader("Competition Mapping ανά CPV")
    st.caption("Ποιος έχει πάρει συμβάσεις, από ποιες Αναθέτουσες Αρχές, για τι αντικείμενο και με ποια αξία.")

    cpv_base = df[["cpv_code","cpv_description"]].dropna(subset=["cpv_code"]).drop_duplicates()
    cpv_base["label"] = cpv_base["cpv_code"].astype(str)+" — "+cpv_base["cpv_description"].fillna("")
    if cpv_search.strip():
        ss=cpv_search.strip().lower()
        cpv_base=cpv_base[cpv_base["label"].str.lower().str.contains(ss,regex=False)]
    cpv_label=st.selectbox("Επίλεξε CPV",cpv_base.sort_values("label")["label"].tolist()) if not cpv_base.empty else None
    if not cpv_label:
        st.info("Δεν βρέθηκε CPV.")
        st.stop()
    cpv=cpv_label.split(" — ",1)[0]
    cdf=df[df["cpv_code"].astype(str)==cpv].copy()
    if authority != "Όλες":
        cdf=cdf[cdf["authority"]==authority]

    deals=[]
    for _,r in cdf.iterrows():
        for i in range(1,5):
            contractor=r.get(f"contractor_{i}")
            cadam=r.get(f"contract_adam_{i}")
            value=r.get(f"contract_value_{i}")
            if pd.notna(contractor) and str(contractor).strip():
                deals.append({"Ανάδοχος":contractor,"Αξία":value,"Αναθέτουσα Αρχή":r["authority"],"Τίτλος":r["title"],"ΑΔΑΜ Διακήρυξης":r["tender_adam"],"ΑΔΑΜ Σύμβασης":cadam,"Ημ. Σύμβασης":r.get(f"contract_date_{i}")})
    deals=pd.DataFrame(deals)
    if deals.empty:
        st.info("Δεν βρέθηκαν συνδεδεμένες συμβάσεις/ανάδοχοι για αυτόν τον CPV.")
        st.stop()

    k1,k2,k3,k4=st.columns(4)
    k1.metric("Ανάδοχοι",deals["Ανάδοχος"].nunique())
    k2.metric("Συμβάσεις",deals["ΑΔΑΜ Σύμβασης"].nunique())
    k3.metric("Συνολική αξία",eur(deals["Αξία"].sum()))
    k4.metric("Αναθέτουσες Αρχές",deals["Αναθέτουσα Αρχή"].nunique())

    summary=(deals.groupby("Ανάδοχος",dropna=False)
             .agg(Συμβάσεις=("ΑΔΑΜ Σύμβασης","nunique"),Συνολική_Αξία=("Αξία","sum"),Αναθέτουσες_Αρχές=("Αναθέτουσα Αρχή","nunique"))
             .reset_index().sort_values("Συνολική_Αξία",ascending=False))
    left,right=st.columns([1.2,1])
    with left:
        st.markdown("#### Ανάδοχοι")
        st.dataframe(summary,use_container_width=True,hide_index=True,
                     column_config={"Συνολική_Αξία":st.column_config.NumberColumn("Συνολική Αξία",format="€ %.2f"),"Αναθέτουσες_Αρχές":st.column_config.NumberColumn("Αναθέτουσες Αρχές")})
    with right:
        top=summary.head(12).sort_values("Συνολική_Αξία")
        fig=px.bar(top,x="Συνολική_Αξία",y="Ανάδοχος",orientation="h")
        fig.update_layout(xaxis_title="Αξία (€)",yaxis_title=None,height=430)
        st.plotly_chart(fig,use_container_width=True)

    st.markdown("#### Τι αφορά")
    st.dataframe(deals.sort_values("Αξία",ascending=False),use_container_width=True,hide_index=True,height=500,
                 column_config={"Αξία":st.column_config.NumberColumn(format="€ %.2f")})

st.divider()
st.caption("MVP v0.2 • Data source: Master-File_06082026.xlsx / Δ-2024 • Submission date and a distinct evaluation milestone are not available as separate source fields.")
