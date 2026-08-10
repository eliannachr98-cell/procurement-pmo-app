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


def valid_deadline(publication_date: str | None, deadline: str | None) -> str | None:
    """Hide source deadlines that predate the record's publication timeline."""
    if not deadline:
        return None
    if publication_date and deadline[:10] < publication_date:
        return None
    return deadline


def keyed(value: Any) -> tuple[str | None, str | None]:
    if isinstance(value, dict):
        return text(value.get("key")), text(value.get("value"))
    return None, text(value)


def first(item: dict, *keys: str) -> Any:
    for key in keys:
        if item.get(key) not in (None, ""):
            return item[key]
    return None


def classify_document(title: str | None, source_type: Any = None) -> str:
    source = " ".join(filter(None, [text(title), keyed(source_type)[1], keyed(source_type)[0]])).lower()
    source = "".join(char for char in unicodedata.normalize("NFD", source) if unicodedata.category(char) != "Mn")
    # Unicode escapes keep the matching rules stable across Windows code pages.
    groups = (
        ("clarification", ("\u03b4\u03b9\u03b5\u03c5\u03ba\u03c1\u03b9\u03bd", "\u03b5\u03c1\u03ce\u03c4", "\u03b1\u03c0\u03ac\u03bd\u03c4")),
        ("amendment", ("\u03c4\u03c1\u03bf\u03c0\u03bf\u03c0\u03bf\u03b9", "\u03bc\u03b5\u03c4\u03ac\u03b8\u03b5\u03c3", "\u03c0\u03b1\u03c1\u03ac\u03c4\u03b1\u03c3", "\u03bf\u03c1\u03b8\u03ae \u03b5\u03c0\u03b1\u03bd\u03ac\u03bb\u03b7\u03c8\u03b7")),
        ("decision", ("\u03b1\u03c0\u03cc\u03c6\u03b1\u03c3\u03b7", "\u03ad\u03b3\u03ba\u03c1\u03b9\u03c3\u03b7", "\u03bc\u03b1\u03c4\u03b1\u03af\u03c9\u03c3\u03b7", "\u03b1\u03bd\u03ac\u03ba\u03bb\u03b7\u03c3\u03b7")),
        ("declaration", ("\u03b4\u03b9\u03b1\u03ba\u03ae\u03c1\u03c5\u03be", "\u03c0\u03c1\u03cc\u03c3\u03ba\u03bb\u03b7\u03c3\u03b7", "\u03c0\u03c1\u03bf\u03ba\u03ae\u03c1\u03c5\u03be")),
    )
    for category, needles in groups:
        normalized_needles = (
            "".join(char for char in unicodedata.normalize("NFD", needle) if unicodedata.category(char) != "Mn")
            for needle in needles
        )
        if any(needle in source for needle in normalized_needles):
            return category
    return "other"


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
        "title": text(item.get("title")),
        "authority_id": authority_id,
        "authority_name": authority_name,
        "contract_type": contract_type,
        "cancelled_at": date_value(item.get("cancellationDate")),
        "source_updated_at": datetime_value(item.get("lastUpdateDate")),
    }
    if source == "notice":
        nuts_code, nuts_name = nuts(item)
        procedure_type = keyed(item.get("procedureType"))[1] or keyed(item.get("procedureType"))[0]
        publication_date = date_value(first(item, "submissionDate", "signedDate"))
        submission_deadline = datetime_value(item.get("finalSubmissionDate"))
        row = base | {
            "procedure_type": procedure_type,
            "document_category": classify_document(base["title"], item.get("documentType")),
            "nuts_code": nuts_code,
            "nuts_name": nuts_name,
            "publication_date": publication_date,
            # Existing column name retained for schema compatibility. This is
            # the offer-submission deadline, not the bid-opening date.
            "opening_at": valid_deadline(publication_date, submission_deadline),
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

