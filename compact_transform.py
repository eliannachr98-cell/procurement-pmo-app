"""Pure transformation functions for the compact TenderScope data model."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any
import unicodedata


def text(value: Any) -> str | None:
    if value is None:
        return None
    value = str(value).strip()
    return value or None


def number(value: Any) -> str | None:
    if value in (None, ""):
        return None
    try:
        result = Decimal(str(value)).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError, TypeError):
        return None
    return format(result, "f") if result >= 0 else None


def date_value(value: Any) -> str | None:
    value = text(value)
    return value[:10] if value else None


def datetime_value(value: Any) -> str | None:
    return text(value)


def keyed(value: Any) -> tuple[str | None, str | None]:
    if isinstance(value, dict):
        return text(value.get("key")), text(value.get("value"))
    return None, text(value)


def first(item: dict, *keys: str) -> Any:
    for key in keys:
        if item.get(key) not in (None, ""):
            return item[key]
    return None


# KHMDHS labels the primary type of every notice in the noticeType.key field
# (confirmed against live API samples, Jan-Mar 2025): 2=\u03a0\u03c1\u03bf\u03ba\u03ae\u03c1\u03c5\u03be\u03b7, 3=\u0394\u03b9\u03b1\u03ba\u03ae\u03c1\u03c5\u03be\u03b7,
# 4=\u03a0\u03c1\u03cc\u03c3\u03ba\u03bb\u03b7\u03c3\u03b7, 6=\u03a0\u03c1\u03cc\u03c3\u03ba\u03bb\u03b7\u03c3\u03b7 \u03b5\u03ba\u03b4\u03ae\u03bb\u03c9\u03c3\u03b7\u03c2 \u03b5\u03bd\u03b4\u03b9\u03b1\u03c6\u03ad\u03c1\u03bf\u03bd\u03c4\u03bf\u03c2. But that field only
# distinguishes \u03a0\u03c1\u03bf\u03ba\u03ae\u03c1\u03c5\u03be\u03b7 from everything else -- it does not know that a
# given notice is actually a \u0394\u03b9\u03b5\u03c5\u03ba\u03c1\u03af\u03bd\u03b9\u03c3\u03b7, \u03a0\u03b1\u03c1\u03ac\u03c4\u03b1\u03c3\u03b7, \u03a0\u03b5\u03c1\u03af\u03bb\u03b7\u03c8\u03b7, etc. of an
# earlier one. Those subtypes are only visible in the title, using the same
# keyword stems the user already validated by hand in a spreadsheet formula
# (SEARCH for \u0391\u03a0\u039f\u03a6\u0391\u03a3/\u03a4\u03a1\u039f\u03a0\u039f\u03a0/\u03a0\u0391\u03a1\u0391\u03a4\u0391\u03a3/\u0394\u0399\u0395\u03a5\u039a\u03a1/\u039c\u0391\u03a4\u0391\u0399\u03a9/\u0394\u0399\u039f\u03a1\u0398\u03a9/\u03a0\u0395\u03a1\u0399\u039b\u0397\u03a8/\u039c\u0395\u03a4\u0391\u0398\u0395\u03a3 to
# isolate plain declarations). So title keywords are checked first, in order
# of specificity, and noticeType is only the fallback for the remaining
# (still large) bucket of plain declarations/announcements.
#
# Requested final categories: \u0394\u03b9\u03b1\u03ba\u03ae\u03c1\u03c5\u03be\u03b7, \u03a0\u03c1\u03bf\u03ba\u03ae\u03c1\u03c5\u03be\u03b7, \u03a0\u03b5\u03c1\u03af\u03bb\u03b7\u03c8\u03b7, \u0394\u03b9\u03b5\u03c5\u03ba\u03c1\u03b9\u03bd\u03af\u03c3\u03b5\u03b9\u03c2,
# \u03a0\u03b1\u03c1\u03ac\u03c4\u03b1\u03c3\u03b7/\u039c\u03b5\u03c4\u03ac\u03b8\u03b5\u03c3\u03b7, \u03a4\u03c1\u03bf\u03c0\u03bf\u03c0\u03bf\u03b9\u03ae\u03c3\u03b5\u03b9\u03c2. \u03a0\u03c1\u03cc\u03c3\u03ba\u03bb\u03b7\u03c3\u03b7 (any variant) and anything
# left over fold into \u0394\u03b9\u03b1\u03ba\u03ae\u03c1\u03c5\u03be\u03b7; \u0394\u03b9\u03cc\u03c1\u03b8\u03c9\u03c3\u03b7 folds into \u03a4\u03c1\u03bf\u03c0\u03bf\u03c0\u03bf\u03b9\u03ae\u03c3\u03b5\u03b9\u03c2 (both are
# corrections to an existing notice). \u039c\u03b1\u03c4\u03b1\u03af\u03c9\u03c3\u03b7/\u0391\u03ba\u03cd\u03c1\u03c9\u03c3\u03b7 is deliberately not a
# document_category here -- cancellation is already exposed as its own
# lifecycle status (see the separate "status"/"cancelled_at" columns), so a
# document-type filter for it would just duplicate that.
KEYWORD_CATEGORIES = (
    ("amendment", ("\u03c4\u03c1\u03bf\u03c0\u03bf\u03c0\u03bf\u03b9", "\u03b4\u03b9\u03cc\u03c1\u03b8\u03c9", "\u03bf\u03c1\u03b8\u03ae \u03b5\u03c0\u03b1\u03bd\u03ac\u03bb\u03b7\u03c8\u03b7")),
    ("extension", ("\u03c0\u03b1\u03c1\u03ac\u03c4\u03b1\u03c3", "\u03bc\u03b5\u03c4\u03ac\u03b8\u03b5\u03c3")),
    ("clarification", ("\u03b4\u03b9\u03b5\u03c5\u03ba\u03c1\u03b9\u03bd",)),
    ("summary", ("\u03c0\u03b5\u03c1\u03af\u03bb\u03b7\u03c8",)),
    ("decision", ("\u03b1\u03c0\u03cc\u03c6\u03b1\u03c3\u03b7", "\u03ad\u03b3\u03ba\u03c1\u03b9\u03c3\u03b7")),
)

# "\u03b4\u03b9\u03cc\u03c1\u03b8\u03c9" is meant to catch documents that correct an existing notice, but
# it's also a substring of "\u03b5\u03c0\u03b9\u03b4\u03b9\u03cc\u03c1\u03b8\u03c9\u03c3\u03b7" (repair) and appears alongside
# "\u03c3\u03c5\u03bd\u03c4\u03ae\u03c1\u03b7\u03c3\u03b7" in "\u03b4\u03b9\u03bf\u03c1\u03b8\u03c9\u03c4\u03b9\u03ba\u03ae \u03c3\u03c5\u03bd\u03c4\u03ae\u03c1\u03b7\u03c3\u03b7" (corrective maintenance) - both
# describe what a brand-new tender is FOR, not a correction to a previous
# one. Confirmed live: 48 amendment-tagged notices were actually plain
# repair/maintenance declarations misclassified this way.
REPAIR_SUBJECT_NEEDLES = ("\u03b5\u03c0\u03b9\u03b4\u03b9\u03cc\u03c1\u03b8\u03c9\u03c3",)

NOTICE_TYPE_CATEGORIES = {
    "2": "announcement",
}


def _strip_accents(value: str) -> str:
    return "".join(char for char in unicodedata.normalize("NFD", value) if unicodedata.category(char) != "Mn")


def classify_document(title: str | None, notice_type: Any = None) -> str:
    source = _strip_accents(" ".join(filter(None, [text(title)])).lower())
    is_repair_subject = (
        any(_strip_accents(needle) in source for needle in REPAIR_SUBJECT_NEEDLES)
        or ("διορθωτικ" in source and "συντηρησ" in source)
    )
    for category, needles in KEYWORD_CATEGORIES:
        normalized_needles = [_strip_accents(needle) for needle in needles]
        if category == "amendment" and is_repair_subject:
            normalized_needles = [needle for needle in normalized_needles if needle != _strip_accents("διόρθω")]
        if any(needle in source for needle in normalized_needles):
            return category

    notice_type_key, _ = keyed(notice_type)
    # Everything else -- \u0394\u03b9\u03b1\u03ba\u03ae\u03c1\u03c5\u03be\u03b7, \u03a0\u03c1\u03cc\u03c3\u03ba\u03bb\u03b7\u03c3\u03b7 (any variant), and unclassified
    # notices with no usable noticeType -- is a plain declaration.
    return NOTICE_TYPE_CATEGORIES.get(notice_type_key, "declaration")


def organization(item: dict) -> tuple[str | None, str | None]:
    return keyed(item.get("organization"))


def nuts(item: dict) -> tuple[str | None, str | None]:
    for key in ("nuts", "nutsCode", "geographicArea", "geographicalArea"):
        code, name = keyed(item.get(key))
        if code or name:
            return code, name
    for details_key in ("objectDetails", "objectDetailsList"):
        for detail in item.get(details_key) or []:
            if not isinstance(detail, dict):
                continue
            for key in ("nuts", "nutsCode", "geographicArea", "geographicalArea"):
                code, name = keyed(detail.get(key))
                if code or name:
                    return code, name
    return None, None


def amounts(item: dict, prefix: str) -> dict[str, str | None]:
    candidates = {
        "ex_vat": ("totalCostWithoutVAT", "totalCostWithoutVat", "budgetWithoutVAT", "budgetWithoutVat"),
        "inc_vat": ("totalCostWithVAT", "totalCostWithVat", "budgetWithVAT", "budgetWithVat"),
        "unknown_vat": ("auctionAmount", "contractBudget", "budget", "totalCost"),
    }
    values = {f"{prefix}_{basis}": number(first(item, *keys)) for basis, keys in candidates.items()}
    # Never duplicate an explicitly classified value into the unknown bucket.
    if values[f"{prefix}_ex_vat"] or values[f"{prefix}_inc_vat"]:
        values[f"{prefix}_unknown_vat"] = None
    return values


def cpvs(item: dict) -> list[dict]:
    found: dict[str, str | None] = {}
    for details_key in ("objectDetails", "objectDetailsList"):
        for detail in item.get(details_key) or []:
            if not isinstance(detail, dict):
                continue
            for value in detail.get("cpvs") or []:
                code, description = keyed(value)
                if code:
                    found[code] = description
    return [{"cpv_code": code, "cpv_description": found[code]} for code in sorted(found)]


def contractors(item: dict) -> list[dict]:
    details = item.get("contractingDataDetails") or {}
    members = details.get("contractingMembersDataList") or [] if isinstance(details, dict) else []
    output = []
    for position, member in enumerate(members, 1):
        if not isinstance(member, dict) or not text(member.get("name")):
            continue
        output.append({
            "position": position,
            "contractor_name": text(member.get("name")),
            "contractor_vat": text(member.get("vatNumber")),
        })
    if output:
        return output
    name = text(first(item, "contractorName", "supplierName"))
    vat = text(first(item, "contractorVatNumber", "supplierVatNumber", "vatNumber"))
    return [{"position": 1, "contractor_name": name, "contractor_vat": vat}] if name else []


def transform(source: str, item: dict) -> dict:
    adam = text(item.get("referenceNumber"))
    if not adam:
        raise ValueError("record has no referenceNumber/ADAM")
    authority_id, authority_name = organization(item)
    contract_type = keyed(item.get("contractType"))[1] or keyed(item.get("contractType"))[0]
    base = {
        "adam": adam,
        "title": text(item.get("title")) or "Χωρίς διαθέσιμο τίτλο",
        "authority_id": authority_id,
        "authority_name": authority_name,
        "contract_type": contract_type,
        "cancelled_at": date_value(item.get("cancellationDate")),
        "source_updated_at": datetime_value(item.get("lastUpdateDate")),
    }
    if source == "notice":
        nuts_code, nuts_name = nuts(item)
        # "procedureType" does not exist on live KHMDHS notice records (confirmed
        # against the API) -- the real field is "typeOfProcedure", e.g.
        # {"key": "1", "value": "Ανοιχτή διαδικασία (αρ.27/αρ.264)"}.
        procedure_type = keyed(item.get("typeOfProcedure"))[1] or keyed(item.get("typeOfProcedure"))[0]
        row = base | {
            "procedure_type": procedure_type,
            "document_category": classify_document(base["title"], item.get("noticeType")),
            "nuts_code": nuts_code,
            "nuts_name": nuts_name,
            "publication_date": date_value(first(item, "submissionDate", "signedDate")),
            "opening_at": datetime_value(item.get("finalSubmissionDate")),
            "status": "cancelled" if item.get("cancelled") else "active",
        } | amounts(item, "budget")
    elif source == "auction":
        row = base | {
            "procurement_adam": text(item.get("noticeRefNo")),
            "award_date": date_value(first(item, "signedDate", "submissionDate")),
        } | amounts(item, "amount")
    elif source == "contract":
        row = base | {
            "procurement_adam": text(item.get("noticeReferenceNumber")),
            "award_adam": text(item.get("auctionRefNo")),
            "signed_date": date_value(item.get("contractSignedDate")),
            "start_date": date_value(item.get("startDate")),
            "delivery_date": date_value(item.get("endDate")),
        } | amounts(item, "amount")
    else:
        raise ValueError(f"unsupported source: {source}")
    return {"record": row, "cpvs": cpvs(item), "contractors": contractors(item) if source != "notice" else []}

