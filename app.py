from __future__ import annotations

from datetime import date
from io import BytesIO
from pathlib import Path
import sqlite3

import pandas as pd
import plotly.express as px
import streamlit as st


BASE = Path(__file__).resolve().parent
DB_PATH = BASE / "procurement.db"
TODAY = pd.Timestamp(date.today())
STATUS_COLORS = {
    "Ενεργός": "#168C8C",
    "Αξιολόγηση": "#E9A23B",
    "Ανατεθειμένος": "#2F6B9A",
    "Σε υλοποίηση": "#6257A8",
    "Ολοκληρωμένος": "#2E8B57",
    "Ακυρωμένος": "#D9534F",
}
CHART_COLORS = ["#17324D", "#168C8C", "#2E8B57", "#E9A23B", "#6257A8", "#D9534F"]
px.defaults.color_discrete_sequence = CHART_COLORS
px.defaults.template = "plotly_white"

st.set_page_config(
    page_title="TenderScope",
    page_icon="🔭",
    layout="wide",
    initial_sidebar_state="collapsed",
)

st.markdown(
    """
    <style>
    :root { --ts-blue:#17324d; --ts-teal:#168c8c; --ts-warning:#e9a23b; --ts-danger:#d9534f; --ts-ink:#1f2937; --ts-muted:#6b7280; }
    [data-testid="stAppViewContainer"] {background:linear-gradient(180deg,#eef4f8 0,#f7f9fb 260px,#f6f8fb 100%);}
    [data-testid="stHeader"] {background:transparent;}
    .block-container {padding-top:1rem; padding-bottom:2rem; max-width:1480px;}
    [data-testid="stSidebar"] {background:#f5f7fa; border-right:1px solid #e5e7eb;}
    [data-testid="stMetric"] {border:1px solid #e5e7eb; border-radius:12px; padding:10px 12px; background:#fff; box-shadow:0 4px 14px rgba(15,23,42,.04); min-height:112px;}
    [data-testid="stMetricLabel"] {color:var(--ts-muted); font-size:.82rem;}
    [data-testid="stMetricValue"] {font-size:1.35rem; line-height:1.2; letter-spacing:-.02em; white-space:normal; overflow-wrap:anywhere;}
    [data-testid="stMetricDelta"] {font-size:.75rem;}
    .ts-header {background:linear-gradient(120deg,#0b3854 0%,#164f70 62%,#24738a 100%); border-radius:18px 18px 8px 8px; padding:22px 26px 18px; box-shadow:0 12px 30px rgba(12,56,84,.18);}
    .ts-header-row {display:flex; align-items:center; gap:14px;}
    .ts-logo {width:45px; height:45px; border:2px solid rgba(255,255,255,.82); border-radius:50%; display:flex; align-items:center; justify-content:center; color:#fff; font-size:1.45rem;}
    .ts-brand {font-size:2rem; font-weight:800; color:#fff; letter-spacing:-.035em; line-height:1.05;}
    .ts-subtitle {color:rgba(255,255,255,.78); margin:.35rem 0 0; font-size:.94rem;}
    .ts-kicker {font-size:.78rem; font-weight:700; color:var(--ts-teal); letter-spacing:.08em; text-transform:uppercase;}
    .ts-card {border:1px solid #e5e7eb; border-radius:14px; padding:14px; background:#fff; min-height:116px;}
    .ts-card-label {font-size:.78rem; color:var(--ts-muted); margin-bottom:6px;}
    .ts-card-value {font-size:1.02rem; color:var(--ts-ink); font-weight:700;}
    .ts-card-note {font-size:.76rem; color:var(--ts-muted); margin-top:7px;}
    .ts-pill {display:inline-block; padding:4px 9px; border-radius:999px; font-size:.78rem; font-weight:650; background:#eef2f7; color:#334155;}
    .ts-note {border-left:4px solid var(--ts-warning); background:#fffaf0; border-radius:8px; padding:11px 13px; color:#4b5563;}
    [data-testid="stExpander"] {background:#e8f1f6; border:1px solid #c6dbe6; border-radius:14px; box-shadow:0 6px 18px rgba(23,50,77,.07); margin-top:.35rem;}
    [data-testid="stExpander"] summary {font-weight:750; color:#17324d;}
    [data-testid="stDataFrame"] {background:#fff; border:1px solid #e1e8ee; border-radius:12px; box-shadow:0 5px 16px rgba(15,23,42,.05); padding:3px;}
    div[data-testid="stRadio"] {background:linear-gradient(120deg,#0b3854 0%,#164f70 62%,#24738a 100%); padding:7px 13px 12px; border-radius:0 0 16px 16px; box-shadow:0 12px 30px rgba(12,56,84,.18);}
    div[data-testid="stRadio"] > div {gap:.4rem; justify-content:flex-end;}
    div[data-testid="stRadio"] label {background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.15); border-radius:9px; padding:.42rem .72rem; transition:.15s ease;}
    div[data-testid="stRadio"] label:hover {background:rgba(255,255,255,.13);}
    div[data-testid="stRadio"] label:has(input:checked) {background:rgba(255,255,255,.2); border-color:rgba(255,255,255,.55); box-shadow:0 3px 10px rgba(0,0,0,.12);}
    div[data-testid="stRadio"] label p {color:#fff !important; font-weight:650;}
    div[data-testid="stRadio"] [data-testid="stMarkdownContainer"] {color:#fff;}
    div[data-testid="stRadio"] input {accent-color:#fff;}
    h1, h2, h3 {color:#17324d; letter-spacing:-.02em;}
    .stButton button, .stDownloadButton button {border-radius:9px; font-weight:650;}
    @media (max-width: 800px) {
      .ts-header {padding:18px 17px 14px;}
      .ts-brand {font-size:1.55rem;}
      div[data-testid="stRadio"] > div {justify-content:flex-start; overflow-x:auto; flex-wrap:nowrap;}
      div[data-testid="stRadio"] label {white-space:nowrap;}
    }
    </style>
    """,
    unsafe_allow_html=True,
)


@st.cache_resource
def get_conn():
    return sqlite3.connect(DB_PATH, check_same_thread=False)


@st.cache_data(show_spinner=False)
def load_all():
    return pd.read_sql_query("SELECT * FROM tenders", get_conn())


def existing(df: pd.DataFrame, *names: str) -> str | None:
    return next((name for name in names if name in df.columns), None)


def value(row: pd.Series, *names: str):
    col = next((name for name in names if name in row.index), None)
    return row.get(col) if col else None


def parse_dates(df: pd.DataFrame) -> pd.DataFrame:
    candidates = [
        "publication_date", "final_submission_date", "opening_date", "cancellation_date",
        "award_date", "contract_signed_date", "start_date", "end_date",
    ]
    candidates += [f"contract_date_{i}" for i in range(1, 5)]
    candidates += [f"delivery_date_{i}" for i in range(1, 5)]
    for col in candidates:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors="coerce")
    return df


def first_non_null(row: pd.Series, columns: list[str]):
    for col in columns:
        if col not in row.index:
            continue
        item = row.get(col)
        if pd.notna(item) and str(item).strip() not in {"", "None", "nan"}:
            return item
    return None


def tender_id_col(df: pd.DataFrame) -> str:
    return existing(df, "tender_adam", "reference_number") or "tender_adam"


def deadline_col(df: pd.DataFrame) -> str | None:
    return existing(df, "final_submission_date", "opening_date")


def lifecycle_status(row: pd.Series) -> str:
    if bool(value(row, "cancelled") or False):
        return "Ακυρωμένος"

    delivery = first_non_null(row, [f"delivery_date_{i}" for i in range(1, 5)] + ["end_date"])
    contract = first_non_null(row, [f"contract_date_{i}" for i in range(1, 5)] + ["contract_signed_date"])
    award = value(row, "award_date")
    deadline = value(row, "final_submission_date", "opening_date")

    if pd.notna(delivery):
        return "Ολοκληρωμένος" if pd.Timestamp(delivery) <= TODAY else "Σε υλοποίηση"
    if pd.notna(contract):
        return "Σε υλοποίηση"
    if pd.notna(award):
        return "Ανατεθειμένος"
    if pd.notna(deadline) and pd.Timestamp(deadline) < TODAY:
        return "Αξιολόγηση"
    return "Ενεργός"


def add_status(df: pd.DataFrame) -> pd.DataFrame:
    result = df.copy()
    result["status"] = result.apply(lifecycle_status, axis=1) if not result.empty else pd.Series(dtype=str)
    return result


def fmt_date(item) -> str:
    return "—" if pd.isna(item) else pd.Timestamp(item).strftime("%d/%m/%Y")


def eur(item) -> str:
    if item is None or pd.isna(item):
        return "—"
    return f"€{float(item):,.0f}".replace(",", ".")


def days_between(start, end):
    if pd.isna(start) or pd.isna(end):
        return None
    result = (pd.Timestamp(end) - pd.Timestamp(start)).days
    return result if result >= 0 else None


def contractor_columns(df: pd.DataFrame) -> list[str]:
    columns = [col for col in df.columns if col.startswith("contractor_")]
    if "contractor_name" in df.columns:
        columns.append("contractor_name")
    return columns


def contractor_options(df: pd.DataFrame) -> list[str]:
    values: set[str] = set()
    for col in contractor_columns(df):
        values.update(df[col].dropna().astype(str).str.strip().loc[lambda s: s.ne("")].tolist())
    return sorted(values, key=str.casefold)


def contract_summary(row: pd.Series) -> tuple[int, float | None]:
    references: set[str] = set()
    amounts: list[float] = []
    for index in range(1, 5):
        reference = row.get(f"contract_adam_{index}")
        if pd.notna(reference) and str(reference).strip():
            references.add(str(reference).strip())
        amount = pd.to_numeric(row.get(f"contract_value_{index}"), errors="coerce")
        if pd.notna(amount):
            amounts.append(float(amount))
    return len(references), sum(amounts) if amounts else None


def row_has_contractor(row: pd.Series, selected: list[str]) -> bool:
    if not selected:
        return True
    available = {str(row.get(col)).strip() for col in contractor_columns(row.to_frame().T) if pd.notna(row.get(col))}
    return bool(available.intersection(selected))


def render_stage(title: str, item, note: str = ""):
    st.markdown(
        f'<div class="ts-card"><div class="ts-card-label">{title}</div>'
        f'<div class="ts-card-value">{fmt_date(item) if not isinstance(item, str) else item}</div>'
        f'<div class="ts-card-note">{note}</div></div>',
        unsafe_allow_html=True,
    )


def build_export(filtered: pd.DataFrame, applied_filters: dict[str, str]) -> bytes:
    output = BytesIO()
    id_col = tender_id_col(filtered)
    summary = pd.DataFrame(
        [
            ["Ημερομηνία εξαγωγής", pd.Timestamp.now().strftime("%d/%m/%Y %H:%M")],
            ["Διαγωνισμοί", filtered[id_col].nunique() if id_col in filtered else len(filtered)],
            *[[label, selection] for label, selection in applied_filters.items()],
        ],
        columns=["Στοιχείο", "Τιμή"],
    )

    contracts = []
    awards = []
    for _, row in filtered.iterrows():
        tender_adam = row.get(id_col)
        if pd.notna(row.get("award_date")) or pd.notna(row.get("award_value")):
            awards.append({
                "ΑΔΑΜ Διακήρυξης": tender_adam,
                "Ημερομηνία Ανάθεσης": row.get("award_date"),
                "Αξία Ανάθεσης": row.get("award_value"),
            })
        for index in range(1, 5):
            contract_adam = row.get(f"contract_adam_{index}")
            if pd.notna(contract_adam) and str(contract_adam).strip():
                contracts.append({
                    "ΑΔΑΜ Διακήρυξης": tender_adam,
                    "ΑΔΑΜ Σύμβασης": contract_adam,
                    "Ημερομηνία Σύμβασης": row.get(f"contract_date_{index}"),
                    "Ημερομηνία Λήξης": row.get(f"delivery_date_{index}"),
                    "Ανάδοχος": row.get(f"contractor_{index}"),
                    "Αξία": row.get(f"contract_value_{index}"),
                })

    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        summary.to_excel(writer, sheet_name="Σύνοψη", index=False)
        filtered.to_excel(writer, sheet_name="Διαγωνισμοί", index=False)
        pd.DataFrame(awards).to_excel(writer, sheet_name="Αναθέσεις", index=False)
        pd.DataFrame(contracts).to_excel(writer, sheet_name="Συμβάσεις", index=False)
        for sheet in writer.book.worksheets:
            sheet.freeze_panes = "A2"
            sheet.auto_filter.ref = sheet.dimensions
            for column in sheet.columns:
                width = min(max(len(str(cell.value or "")) for cell in column) + 2, 55)
                sheet.column_dimensions[column[0].column_letter].width = max(width, 11)
    output.seek(0)
    return output.getvalue()


def render_tender_detail(filtered: pd.DataFrame, selected_id: str):
    id_col = tender_id_col(filtered)
    selected_rows = filtered[filtered[id_col].astype(str).eq(str(selected_id))]
    if selected_rows.empty:
        st.info("Ο επιλεγμένος διαγωνισμός δεν υπάρχει πλέον στα ενεργά φίλτρα.")
        return
    row = selected_rows.iloc[0]
    deadline = value(row, "final_submission_date", "opening_date")
    first_contract = first_non_null(row, [f"contract_date_{i}" for i in range(1, 5)] + ["contract_signed_date"])
    first_delivery = first_non_null(row, [f"delivery_date_{i}" for i in range(1, 5)] + ["end_date"])
    contract_count, contracted_value = contract_summary(row)

    st.markdown(f"### {row.get('title', 'Χωρίς τίτλο')}")
    st.caption(f"{selected_id} • {row.get('authority', '—')} • {row.get('cpv_code', '—')}")
    metrics = st.columns(5)
    metrics[0].metric("Κατάσταση", row.get("status", "—"))
    metrics[1].metric("Προϋπολογισμός", eur(value(row, "budget_vat", "total_cost")))
    metrics[2].metric("Αξία ανάθεσης", eur(value(row, "award_value")))
    metrics[3].metric("Αριθμός συμβάσεων", contract_count)
    metrics[4].metric("Συμβασιοποιημένη αξία", eur(contracted_value))

    phases = []
    for label, start, end in [
        ("Υποβολή προσφορών", value(row, "publication_date"), deadline),
        ("Αξιολόγηση", deadline, value(row, "award_date")),
        ("Συμβασιοποίηση", value(row, "award_date"), first_contract),
        ("Υλοποίηση", first_contract, first_delivery),
    ]:
        if pd.notna(start) and pd.notna(end) and pd.Timestamp(end) >= pd.Timestamp(start):
            phases.append({
                "Στάδιο": label,
                "Έναρξη": pd.Timestamp(start),
                "Λήξη": pd.Timestamp(end),
                "Ημέρες": (pd.Timestamp(end) - pd.Timestamp(start)).days,
            })

    details_tab, gantt_tab, analytics_tab = st.tabs(["Στοιχεία", "Gantt", "Αναλύσεις"])
    with details_tab:
        st.markdown("#### Κύκλος ζωής")
        stages = st.columns(5)
        with stages[0]: render_stage("Δημοσίευση", value(row, "publication_date"))
        with stages[1]: render_stage("Προθεσμία υποβολής", deadline)
        with stages[2]: render_stage("Ανάθεση", value(row, "award_date"))
        with stages[3]: render_stage("Σύμβαση", first_contract)
        with stages[4]: render_stage("Ολοκλήρωση", first_delivery)

        st.markdown("#### Βασικά στοιχεία")
        detail_data = pd.DataFrame([
            ["ΑΔΑΜ", selected_id],
            ["Αναθέτουσα Αρχή", row.get("authority", "—")],
            ["CPV", f"{row.get('cpv_code', '—')} · {row.get('cpv_description', '')}"],
            ["Τύπος διαδικασίας", value(row, "procedure_type_name", "procedure") or "—"],
            ["Τύπος σύμβασης", row.get("contract_type", "—")],
        ], columns=["Πεδίο", "Τιμή"])
        st.dataframe(detail_data, use_container_width=True, hide_index=True)

    with gantt_tab:
        st.markdown("#### Χρονοδιάγραμμα επιλεγμένου διαγωνισμού")
        if phases:
            fig = px.timeline(
                pd.DataFrame(phases), x_start="Έναρξη", x_end="Λήξη", y="Στάδιο",
                color="Στάδιο", color_discrete_sequence=CHART_COLORS,
            )
            fig.add_vline(x=TODAY, line_dash="dash", line_color="#ef5b5b")
            fig.update_yaxes(autorange="reversed", title=None)
            fig.update_layout(height=390, xaxis_title=None, showlegend=False, margin=dict(l=10, r=10, t=20, b=10))
            st.plotly_chart(fig, use_container_width=True)
        else:
            st.info("Δεν υπάρχουν ακόμη αρκετές ημερομηνίες για τη δημιουργία Gantt.")

    with analytics_tab:
        st.markdown("#### Αναλύσεις επιλεγμένου διαγωνισμού")
        left, right = st.columns(2)
        with left:
            if phases:
                phase_df = pd.DataFrame(phases)
                fig = px.pie(
                    phase_df, names="Στάδιο", values="Ημέρες", hole=.48,
                    title="Κατανομή διάρκειας lifecycle", color_discrete_sequence=CHART_COLORS,
                )
                fig.update_layout(height=390, legend_title=None)
                st.plotly_chart(fig, use_container_width=True)
            else:
                st.info("Δεν υπάρχουν αρκετές ημερομηνίες για ανάλυση διάρκειας.")

        contract_values = []
        for index in range(1, 5):
            contractor = row.get(f"contractor_{index}")
            contract_value = row.get(f"contract_value_{index}")
            if pd.notna(contract_value) and float(contract_value) > 0:
                contract_values.append({
                    "Ανάδοχος": str(contractor) if pd.notna(contractor) else f"Σύμβαση {index}",
                    "Αξία": float(contract_value),
                })
        with right:
            if contract_values:
                fig = px.pie(
                    pd.DataFrame(contract_values), names="Ανάδοχος", values="Αξία", hole=.48,
                    title="Κατανομή συμβασιοποιημένης αξίας", color_discrete_sequence=CHART_COLORS,
                )
                fig.update_layout(height=390, legend_title=None)
                st.plotly_chart(fig, use_container_width=True)
            else:
                st.info("Δεν υπάρχουν ακόμη συνδεδεμένες αξίες συμβάσεων.")


if not DB_PATH.exists():
    st.error("Δεν βρέθηκε η προσωρινή βάση procurement.db. Η σύνδεση της οθόνης με τη Supabase είναι το επόμενο στάδιο.")
    st.stop()

df = add_status(parse_dates(load_all()))
id_col = tender_id_col(df)
deadline = deadline_col(df)

st.markdown(
    '<div class="ts-header"><div class="ts-header-row"><div class="ts-logo">⌖</div><div>'
    '<div class="ts-brand">TenderScope</div>'
    '<div class="ts-subtitle">Ελληνικό Παρατηρητήριο Δημοσίων Συμβάσεων · Procurement Intelligence</div>'
    '</div></div></div>',
    unsafe_allow_html=True,
)

page = st.radio(
    "Κύρια πλοήγηση",
    ["Επισκόπηση", "Διαγωνισμοί", "Αγορά & Ανταγωνισμός", "🔔"],
    horizontal=True,
    label_visibility="collapsed",
)
st.write("")

selected_authorities = []
selected_cpvs = []
procedure = "Όλοι"
contract_type = "Όλοι"
status_filter = "Όλες"
selected_years = []
procedure_col = existing(df, "procedure_type_name", "procedure")
contract_type_col = existing(df, "contract_type")

def clear_shared_filters():
    for key, default in {
        "shared_years": [],
        "shared_authorities": [],
        "shared_cpvs": [],
        "shared_contract_type": "Όλοι",
        "shared_procedure": "Όλοι",
        "shared_status": "Όλες",
    }.items():
        st.session_state[key] = default


if page in {"Επισκόπηση", "Διαγωνισμοί"}:
    with st.expander("Φίλτρα", expanded=True):
        filter_title, filter_action = st.columns([5, 1])
        filter_title.caption("Οι ίδιες επιλογές εφαρμόζονται στην Επισκόπηση και στους Διαγωνισμούς.")
        filter_action.button("Καθαρισμός", on_click=clear_shared_filters, use_container_width=True)

        year_values = sorted(df["publication_date"].dropna().dt.year.astype(int).unique(), reverse=True)
        authority_values = sorted(df.get("authority", pd.Series(dtype=str)).dropna().astype(str).unique(), key=str.casefold)
        cpv_catalog = df[["cpv_code", "cpv_description"]].dropna(subset=["cpv_code"]).drop_duplicates().copy()
        cpv_catalog["label"] = cpv_catalog["cpv_code"].astype(str) + " — " + cpv_catalog["cpv_description"].fillna("")
        cpv_values = cpv_catalog.sort_values("label")["label"].tolist()
        procedure_values = sorted(df[procedure_col].dropna().astype(str).unique(), key=str.casefold) if procedure_col else []
        contract_type_values = sorted(df[contract_type_col].dropna().astype(str).unique(), key=str.casefold) if contract_type_col else []

        f1, f2, f3 = st.columns(3)
        selected_years = f1.multiselect("Έτος", year_values, key="shared_years", placeholder="Όλα τα έτη")
        selected_authorities = f2.multiselect(
            "Αναθέτουσα Αρχή", authority_values, key="shared_authorities", placeholder="Όλες οι Αρχές"
        )
        selected_cpvs = f3.multiselect("CPV", cpv_values, key="shared_cpvs", placeholder="Όλοι οι CPV")

        f4, f5, f6 = st.columns(3)
        contract_type = f4.selectbox(
            "Τύπος σύμβασης", ["Όλοι"] + contract_type_values,
            key="shared_contract_type", disabled=not contract_type_values,
        )
        procedure = f5.selectbox(
            "Τύπος διαδικασίας", ["Όλοι"] + procedure_values,
            key="shared_procedure", disabled=not procedure_values,
        )
        status_filter = f6.selectbox(
            "Κατάσταση",
            ["Όλες", "Ενεργοί μόνο", "Ενεργός", "Αξιολόγηση", "Ανατεθειμένος", "Σε υλοποίηση", "Ολοκληρωμένος", "Ακυρωμένος"],
            key="shared_status",
        )
    st.divider()

filtered = df.copy()
if selected_years:
    filtered = filtered[filtered["publication_date"].dt.year.isin(selected_years)]
if selected_authorities:
    filtered = filtered[filtered["authority"].isin(selected_authorities)]
if selected_cpvs:
    selected_cpv_codes = [item.split(" — ", 1)[0] for item in selected_cpvs]
    filtered = filtered[filtered["cpv_code"].astype(str).isin(selected_cpv_codes)]
if procedure_col and procedure != "Όλοι":
    filtered = filtered[filtered[procedure_col].astype(str).eq(procedure)]
if contract_type_col and contract_type != "Όλοι":
    filtered = filtered[filtered[contract_type_col].astype(str).eq(contract_type)]
if status_filter == "Ενεργοί μόνο":
    filtered = filtered[~filtered["status"].isin(["Ολοκληρωμένος", "Ακυρωμένος"])]
elif status_filter != "Όλες":
    filtered = filtered[filtered["status"].eq(status_filter)]

if page == "Επισκόπηση":
    metric_cols = st.columns(5)
    metric_cols[0].metric("Διαγωνισμοί", f"{filtered[id_col].nunique():,}".replace(",", "."))
    active_mask = ~filtered["status"].isin(["Ολοκληρωμένος", "Ακυρωμένος"])
    metric_cols[1].metric("Ενεργοί", f"{active_mask.sum():,}".replace(",", "."))
    metric_cols[2].metric("Ανατεθειμένοι", int(filtered["status"].eq("Ανατεθειμένος").sum()))
    metric_cols[3].metric("Χωρίς ανάθεση", int(filtered.get("award_date", pd.Series(index=filtered.index, dtype=float)).isna().sum()))
    metric_cols[4].metric("Ακυρωμένοι", int(filtered["status"].eq("Ακυρωμένος").sum()))

    left, right = st.columns(2)
    with left:
        st.subheader("Διαγωνισμοί ανά στάδιο")
        stage_counts = filtered["status"].value_counts().rename_axis("Στάδιο").reset_index(name="Πλήθος")
        fig = px.bar(
            stage_counts, x="Στάδιο", y="Πλήθος", color="Στάδιο", text_auto=True,
            color_discrete_map=STATUS_COLORS,
        )
        fig.update_layout(height=390, showlegend=False, xaxis_title=None, yaxis_title=None)
        st.plotly_chart(fig, use_container_width=True)
    with right:
        st.subheader("Κορυφαίοι CPV")
        cpv_data = filtered.copy()
        cpv_data["CPV"] = cpv_data.get("cpv_code", "—").fillna("—").astype(str) + " · " + cpv_data.get("cpv_description", "").fillna("")
        cpv_counts = cpv_data.groupby("CPV")[id_col].nunique().nlargest(10).sort_values().reset_index(name="Πλήθος")
        fig = px.bar(cpv_counts, x="Πλήθος", y="CPV", orientation="h", color_discrete_sequence=["#17324d"])
        fig.update_layout(height=390, xaxis_title=None, yaxis_title=None)
        st.plotly_chart(fig, use_container_width=True)

    st.subheader("Ενεργοί διαγωνισμοί ανά έδρα Αναθέτουσας Αρχής")
    nuts_col = existing(filtered, "nuts_code", "nuts")
    if not nuts_col:
        st.info("Ο χάρτης θα ενεργοποιηθεί όταν το πεδίο NUTS μεταφερθεί από το raw_data στη βάση δεδομένων.")
    else:
        active = filtered[filtered["status"].eq("Ενεργός") & filtered[nuts_col].notna()].copy()
        counts = active.groupby(nuts_col)[id_col].nunique().sort_values(ascending=False).reset_index(name="Ενεργοί διαγωνισμοί")
        st.dataframe(counts, use_container_width=True, hide_index=True)
        st.caption("Το NUTS αφορά την έδρα της Αναθέτουσας Αρχής και όχι τον τόπο εκτέλεσης της σύμβασης.")

elif page == "Διαγωνισμοί":
    top_left, top_right = st.columns([3, 1])
    top_left.subheader("Λίστα διαγωνισμών")
    top_left.caption("Επίλεξε μία γραμμή για να ανοίξεις την καρτέλα, το Gantt και τις αναλύσεις.")
    applied = {
        "Έτος": ", ".join(map(str, selected_years)) or "Όλα",
        "Αναθέτουσα Αρχή": ", ".join(selected_authorities) or "Όλες",
        "CPV": ", ".join(selected_cpvs) or "Όλοι",
        "Τύπος σύμβασης": contract_type,
        "Τύπος διαδικασίας": procedure,
        "Κατάσταση": status_filter,
    }
    top_right.download_button(
        "⬇ Εξαγωγή σε Excel",
        data=build_export(filtered, applied),
        file_name=f"tenderscope_{date.today().isoformat()}.xlsx",
        mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        use_container_width=True,
    )
    table_columns = [col for col in [id_col, "title", "authority", "cpv_code", "publication_date", deadline, "status"] if col]
    table = filtered[table_columns].copy().sort_values("publication_date", ascending=False).reset_index(drop=True)
    table.columns = ["ΑΔΑΜ", "Τίτλος", "Αναθέτουσα Αρχή", "CPV", "Δημοσίευση", "Προθεσμία υποβολής", "Κατάσταση"][:len(table.columns)]
    selection = st.dataframe(
        table,
        use_container_width=True,
        hide_index=True,
        height=520,
        on_select="rerun",
        selection_mode="single-row",
        key="tender_list",
    )
    if selection.selection.rows:
        st.session_state["selected_tender_id"] = str(table.iloc[selection.selection.rows[0]]["ΑΔΑΜ"])

    selected_tender_id = st.session_state.get("selected_tender_id")
    if selected_tender_id:
        st.divider()
        render_tender_detail(filtered, selected_tender_id)
    else:
        st.info("Πάτησε επάνω σε έναν διαγωνισμό της λίστας για να εμφανιστεί η καρτέλα του.")

elif page == "Αγορά & Ανταγωνισμός":
    st.subheader("Ανάλυση ανταγωνισμού ανά CPV")
    st.caption("Επίλεξε έναν ή περισσότερους CPV για να δεις την αγορά, τους αναδόχους και τις συνδεδεμένες συμβάσεις.")
    cpv_catalog = df[["cpv_code", "cpv_description"]].dropna(subset=["cpv_code"]).drop_duplicates().copy()
    cpv_catalog["Επιλογή"] = cpv_catalog["cpv_code"].astype(str) + " — " + cpv_catalog["cpv_description"].fillna("")
    market_cpvs = st.multiselect(
        "Επίλεξε CPV",
        cpv_catalog.sort_values("Επιλογή")["Επιλογή"].tolist(),
        placeholder="Επίλεξε έναν ή περισσότερους CPV",
    ) if not cpv_catalog.empty else []
    market_codes = [item.split(" — ", 1)[0] for item in market_cpvs]
    market_data = df[df["cpv_code"].astype(str).isin(market_codes)].copy() if market_codes else df.iloc[0:0].copy()
    columns = contractor_columns(market_data)
    if not market_cpvs:
        st.info("Επίλεξε τουλάχιστον έναν CPV για να ξεκινήσει η ανάλυση.")
    elif not columns:
        st.info("Η ανάλυση θα ενεργοποιηθεί όταν ολοκληρωθεί η σύνδεση αναθέσεων και συμβάσεων.")
    else:
        records = []
        for _, row in market_data.iterrows():
            for index in range(1, 5):
                contractor = row.get(f"contractor_{index}")
                if pd.notna(contractor) and str(contractor).strip():
                    records.append({
                        "Ανάδοχος": contractor,
                        "Αναθέτουσα Αρχή": row.get("authority"),
                        "ΑΔΑΜ Διακήρυξης": row.get(id_col),
                        "Τίτλος Διαγωνισμού": row.get("title"),
                        "CPV": row.get("cpv_code"),
                        "ΑΔΑΜ Σύμβασης": row.get(f"contract_adam_{index}"),
                        "Ημερομηνία Σύμβασης": row.get(f"contract_date_{index}"),
                        "Αξία": row.get(f"contract_value_{index}"),
                    })
        deals = pd.DataFrame(records)
        if deals.empty:
            st.info("Δεν υπάρχουν ακόμη συνδεδεμένες συμβάσεις για τα επιλεγμένα φίλτρα.")
        else:
            competition = deals.groupby("Ανάδοχος").agg(
                Διαγωνισμοί=("ΑΔΑΜ Διακήρυξης", "nunique"),
                Συμβάσεις=("ΑΔΑΜ Σύμβασης", "nunique"),
                Συνολική_Αξία=("Αξία", "sum"),
                Αναθέτουσες_Αρχές=("Αναθέτουσα Αρχή", "nunique"),
            ).reset_index().sort_values("Συνολική_Αξία", ascending=False).reset_index(drop=True)
            contractor_search = st.text_input("Αναζήτηση αναδόχου", placeholder="Γράψε μέρος της επωνυμίας")
            if contractor_search.strip():
                competition = competition[
                    competition["Ανάδοχος"].astype(str).str.contains(contractor_search.strip(), case=False, regex=False)
                ].reset_index(drop=True)
            st.caption("Πάτησε επάνω σε έναν ανάδοχο για να δεις τους διαγωνισμούς και τις συμβάσεις του.")
            contractor_selection = st.dataframe(
                competition,
                use_container_width=True,
                hide_index=True,
                on_select="rerun",
                selection_mode="single-row",
                key="contractor_mapping",
                column_config={
                    "Συνολική_Αξία": st.column_config.NumberColumn("Συνολική αξία", format="€ %.2f"),
                    "Αναθέτουσες_Αρχές": st.column_config.NumberColumn("Αναθέτουσες Αρχές"),
                },
            )
            if contractor_selection.selection.rows:
                selected_row = contractor_selection.selection.rows[0]
                st.session_state["selected_mapping_contractor"] = competition.iloc[selected_row]["Ανάδοχος"]

            selected_contractor = st.session_state.get("selected_mapping_contractor")
            if selected_contractor:
                contractor_deals = deals[deals["Ανάδοχος"].eq(selected_contractor)].copy()
                st.divider()
                st.markdown(f"### {selected_contractor}")
                summary_cols = st.columns(4)
                summary_cols[0].metric("Διαγωνισμοί", contractor_deals["ΑΔΑΜ Διακήρυξης"].nunique())
                summary_cols[1].metric("Συμβάσεις", contractor_deals["ΑΔΑΜ Σύμβασης"].nunique())
                summary_cols[2].metric("Αναθέτουσες Αρχές", contractor_deals["Αναθέτουσα Αρχή"].nunique())
                summary_cols[3].metric("Συνολική αξία", eur(contractor_deals["Αξία"].sum()))

                tenders_tab, contracts_tab, chart_tab = st.tabs(["Διαγωνισμοί", "Συμβάσεις", "Κατανομή"])
                with tenders_tab:
                    tender_details = contractor_deals[[
                        "ΑΔΑΜ Διακήρυξης", "Τίτλος Διαγωνισμού", "Αναθέτουσα Αρχή", "CPV"
                    ]].drop_duplicates("ΑΔΑΜ Διακήρυξης")
                    st.dataframe(tender_details, use_container_width=True, hide_index=True)
                with contracts_tab:
                    contract_details = contractor_deals[[
                        "ΑΔΑΜ Σύμβασης", "ΑΔΑΜ Διακήρυξης", "Ημερομηνία Σύμβασης",
                        "Αναθέτουσα Αρχή", "Αξία"
                    ]].sort_values("Ημερομηνία Σύμβασης", ascending=False)
                    st.dataframe(
                        contract_details,
                        use_container_width=True,
                        hide_index=True,
                        column_config={"Αξία": st.column_config.NumberColumn(format="€ %.2f")},
                    )
                with chart_tab:
                    authority_values = contractor_deals.groupby("Αναθέτουσα Αρχή", dropna=False)["Αξία"].sum().reset_index()
                    fig = px.pie(
                        authority_values,
                        names="Αναθέτουσα Αρχή",
                        values="Αξία",
                        hole=.48,
                        title="Αξία συμβάσεων ανά Αναθέτουσα Αρχή",
                        color_discrete_sequence=CHART_COLORS,
                    )
                    fig.update_layout(height=430, legend_title=None)
                    st.plotly_chart(fig, use_container_width=True)

elif page == "🔔":
    st.subheader("Ειδοποιήσεις CPV")
    st.markdown(
        '<div class="ts-note">Οι συνδρομές θα ενεργοποιηθούν μετά την προσθήκη χρηστών και του πίνακα alerts στη Supabase. '
        'Έτσι κάθε ειδοποίηση θα αποστέλλεται μία φορά και δεν θα χάνεται όταν κλείνει η εφαρμογή.</div>',
        unsafe_allow_html=True,
    )
    cpv_values = sorted(df.get("cpv_code", pd.Series(dtype=str)).dropna().astype(str).unique())
    st.multiselect("CPV ενδιαφέροντος", cpv_values, disabled=True, placeholder="Διαθέσιμο στην επόμενη φάση")
    st.toggle("Ειδοποίηση μέσα στην εφαρμογή", value=True, disabled=True)
    st.toggle("Ημερήσιο email", value=False, disabled=True)

st.divider()
st.caption("TenderScope • Ελληνικό Παρατηρητήριο Δημοσίων Συμβάσεων • Πηγή: ΚΗΜΔΗΣ Open Data API")

