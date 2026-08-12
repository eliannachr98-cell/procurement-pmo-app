import unittest
from unittest.mock import Mock, patch

from compact_transform import classify_document, transform
from prepare_compact_data import request_page


class CompactTransformTests(unittest.TestCase):
    def test_transient_server_error_is_retried(self):
        transient = Mock(status_code=500)
        successful = Mock(status_code=200)
        successful.json.return_value = {"content": [], "last": True}
        with patch("prepare_compact_data.requests.post", side_effect=[transient, successful]) as mocked, \
                patch("prepare_compact_data.time.sleep"):
            result = request_page("notice", 0, {})
        self.assertTrue(result["last"])
        self.assertEqual(mocked.call_count, 2)

    def test_notice_keeps_vat_bases_separate(self):
        result = transform("notice", {
            "referenceNumber": "24PROC014093798",
            "title": "\u0394\u03b9\u03b1\u03ba\u03ae\u03c1\u03c5\u03be\u03b7 \u03bb\u03bf\u03b3\u03b9\u03c3\u03bc\u03b9\u03ba\u03bf\u03cd",
            "organization": {"key": "99200088", "value": "\u039c\u039f\u0394 \u0391\u0395"},
            "submissionDate": "2024-01-03T08:00:00",
            "finalSubmissionDate": "2024-02-05T10:00:00",
            "totalCostWithoutVAT": 4395161.29,
            "totalCostWithVAT": 5450000,
            "budget": 999999,
        })["record"]
        self.assertEqual(result["budget_ex_vat"], "4395161.29")
        self.assertEqual(result["budget_inc_vat"], "5450000.00")
        self.assertIsNone(result["budget_unknown_vat"])
        self.assertEqual(result["publication_date"], "2024-01-03")
        self.assertEqual(result["opening_at"], "2024-02-05T10:00:00")

    def test_notice_without_title_gets_safe_label(self):
        result = transform("notice", {"referenceNumber": "25PROC017023699"})["record"]
        self.assertEqual(result["title"], "Χωρίς διαθέσιμο τίτλο")

    def test_unknown_budget_is_not_mislabeled(self):
        result = transform("notice", {
            "referenceNumber": "25PROC1",
            "title": "\u03a0\u03c1\u03cc\u03c3\u03ba\u03bb\u03b7\u03c3\u03b7",
            "budget": 1000,
        })["record"]
        self.assertIsNone(result["budget_ex_vat"])
        self.assertIsNone(result["budget_inc_vat"])
        self.assertEqual(result["budget_unknown_vat"], "1000.00")

    def test_document_classification(self):
        self.assertEqual(classify_document("\u0391\u03c0\u03cc\u03c6\u03b1\u03c3\u03b7 \u03c4\u03c1\u03bf\u03c0\u03bf\u03c0\u03bf\u03af\u03b7\u03c3\u03b7\u03c2 \u03cc\u03c1\u03c9\u03bd"), "amendment")
        self.assertEqual(classify_document("\u03a4\u03b5\u03cd\u03c7\u03bf\u03c2 \u03b4\u03b9\u03b5\u03c5\u03ba\u03c1\u03b9\u03bd\u03af\u03c3\u03b5\u03c9\u03bd"), "clarification")
        self.assertEqual(classify_document("\u0394\u03b9\u03b1\u03ba\u03ae\u03c1\u03c5\u03be\u03b7 \u03b1\u03bd\u03bf\u03b9\u03ba\u03c4\u03bf\u03cd \u03b4\u03b9\u03b1\u03b3\u03c9\u03bd\u03b9\u03c3\u03bc\u03bf\u03cd"), "declaration")

    def test_document_classification_uses_khmdhs_notice_type(self):
        # noticeType is authoritative: a title with no recognizable keyword
        # ("\u03a0\u03c1\u03bf\u03bc\u03ae\u03b8\u03b5\u03b9\u03b1 \u03c4\u03c1\u03bf\u03c6\u03af\u03bc\u03c9\u03bd") must still classify correctly when tagged.
        self.assertEqual(
            classify_document("\u03a0\u03c1\u03bf\u03bc\u03ae\u03b8\u03b5\u03b9\u03b1 \u03c4\u03c1\u03bf\u03c6\u03af\u03bc\u03c9\u03bd", {"key": "2", "value": "\u03a0\u03c1\u03bf\u03ba\u03ae\u03c1\u03c5\u03be\u03b7"}),
            "announcement",
        )
        self.assertEqual(
            classify_document("\u03a0\u03c1\u03bf\u03bc\u03ae\u03b8\u03b5\u03b9\u03b1 \u03c4\u03c1\u03bf\u03c6\u03af\u03bc\u03c9\u03bd", {"key": "3", "value": "\u0394\u03b9\u03b1\u03ba\u03ae\u03c1\u03c5\u03be\u03b7"}),
            "declaration",
        )
        self.assertEqual(
            classify_document("\u03a0\u03c1\u03bf\u03bc\u03ae\u03b8\u03b5\u03b9\u03b1 \u03c4\u03c1\u03bf\u03c6\u03af\u03bc\u03c9\u03bd", {"key": "6", "value": "..."}),
            "interest_invitation",
        )

    def test_document_classification_cancelled_overrides_notice_type(self):
        self.assertEqual(
            classify_document("\u0394\u03b9\u03b1\u03ba\u03ae\u03c1\u03c5\u03be\u03b7", {"key": "3"}, cancelled=True),
            "cancellation",
        )

    def test_document_classification_amendment_subtype_from_title(self):
        self.assertEqual(
            classify_document("\u03a0\u03b1\u03c1\u03ac\u03c4\u03b1\u03c3\u03b7 \u03c0\u03c1\u03bf\u03b8\u03b5\u03c3\u03bc\u03af\u03b1\u03c2", {"key": "3"}, amend_previous=True),
            "extension",
        )

    def test_contract_preserves_multiple_contractors(self):
        result = transform("contract", {
            "referenceNumber": "24SYMV1",
            "contractingDataDetails": {"contractingMembersDataList": [
                {"name": "\u0391\u03bd\u03ac\u03b4\u03bf\u03c7\u03bf\u03c2 \u0391", "vatNumber": "111"},
                {"name": "\u0391\u03bd\u03ac\u03b4\u03bf\u03c7\u03bf\u03c2 \u0392", "vatNumber": "222"},
            ]},
        })
        self.assertEqual(len(result["contractors"]), 2)
        self.assertEqual(result["contractors"][1]["contractor_vat"], "222")


if __name__ == "__main__":
    unittest.main()

