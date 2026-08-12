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

    def test_notice_reads_procedure_type_from_typeOfProcedure(self):
        result = transform("notice", {
            "referenceNumber": "25PROC1",
            "typeOfProcedure": {"key": "1", "value": "Ανοιχτή διαδικασία (αρ.27/αρ.264)"},
        })["record"]
        self.assertEqual(result["procedure_type"], "Ανοιχτή διαδικασία (αρ.27/αρ.264)")

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
        # noticeType only distinguishes \u03a0\u03c1\u03bf\u03ba\u03ae\u03c1\u03c5\u03be\u03b7 from everything else -- a
        # title with no recognizable keyword ("\u03a0\u03c1\u03bf\u03bc\u03ae\u03b8\u03b5\u03b9\u03b1 \u03c4\u03c1\u03bf\u03c6\u03af\u03bc\u03c9\u03bd") falls
        # back to it, and only key=2 (\u03a0\u03c1\u03bf\u03ba\u03ae\u03c1\u03c5\u03be\u03b7) is treated specially.
        self.assertEqual(
            classify_document("\u03a0\u03c1\u03bf\u03bc\u03ae\u03b8\u03b5\u03b9\u03b1 \u03c4\u03c1\u03bf\u03c6\u03af\u03bc\u03c9\u03bd", {"key": "2", "value": "\u03a0\u03c1\u03bf\u03ba\u03ae\u03c1\u03c5\u03be\u03b7"}),
            "announcement",
        )
        self.assertEqual(
            classify_document("\u03a0\u03c1\u03bf\u03bc\u03ae\u03b8\u03b5\u03b9\u03b1 \u03c4\u03c1\u03bf\u03c6\u03af\u03bc\u03c9\u03bd", {"key": "3", "value": "\u0394\u03b9\u03b1\u03ba\u03ae\u03c1\u03c5\u03be\u03b7"}),
            "declaration",
        )
        # \u03a0\u03c1\u03cc\u03c3\u03ba\u03bb\u03b7\u03c3\u03b7 / \u03a0\u03c1\u03cc\u03c3\u03ba\u03bb\u03b7\u03c3\u03b7 \u03b5\u03ba\u03b4\u03ae\u03bb\u03c9\u03c3\u03b7\u03c2 \u03b5\u03bd\u03b4\u03b9\u03b1\u03c6\u03ad\u03c1\u03bf\u03bd\u03c4\u03bf\u03c2 fold into declaration
        # per user request -- no separate category for either.
        self.assertEqual(
            classify_document("\u03a0\u03c1\u03bf\u03bc\u03ae\u03b8\u03b5\u03b9\u03b1 \u03c4\u03c1\u03bf\u03c6\u03af\u03bc\u03c9\u03bd", {"key": "4", "value": "\u03a0\u03c1\u03cc\u03c3\u03ba\u03bb\u03b7\u03c3\u03b7"}),
            "declaration",
        )
        self.assertEqual(
            classify_document("\u03a0\u03c1\u03bf\u03bc\u03ae\u03b8\u03b5\u03b9\u03b1 \u03c4\u03c1\u03bf\u03c6\u03af\u03bc\u03c9\u03bd", {"key": "6", "value": "..."}),
            "declaration",
        )

    def test_document_classification_title_keywords_beat_notice_type(self):
        # These sub-types only show up in the title -- noticeType alone
        # (e.g. key=3 \u0394\u03b9\u03b1\u03ba\u03ae\u03c1\u03c5\u03be\u03b7) can't tell a plain notice apart from a
        # \u03a0\u03b5\u03c1\u03af\u03bb\u03b7\u03c8\u03b7 or \u0394\u03b9\u03cc\u03c1\u03b8\u03c9\u03c3\u03b7 of one.
        self.assertEqual(
            classify_document("\u03a0\u03b1\u03c1\u03ac\u03c4\u03b1\u03c3\u03b7 \u03c0\u03c1\u03bf\u03b8\u03b5\u03c3\u03bc\u03af\u03b1\u03c2 \u03c5\u03c0\u03bf\u03b2\u03bf\u03bb\u03ae\u03c2", {"key": "3"}),
            "extension",
        )
        self.assertEqual(
            classify_document("\u039c\u03b5\u03c4\u03ac\u03b8\u03b5\u03c3\u03b7 \u03ba\u03b1\u03c4\u03b1\u03bb\u03b7\u03ba\u03c4\u03b9\u03ba\u03ae\u03c2 \u03b7\u03bc\u03b5\u03c1\u03bf\u03bc\u03b7\u03bd\u03af\u03b1\u03c2", {"key": "3"}),
            "extension",
        )
        self.assertEqual(
            classify_document("\u03a0\u03b5\u03c1\u03af\u03bb\u03b7\u03c8\u03b7 \u03b4\u03b9\u03b1\u03ba\u03ae\u03c1\u03c5\u03be\u03b7\u03c2", {"key": "3"}),
            "summary",
        )
        self.assertEqual(
            classify_document("\u0394\u03b9\u03cc\u03c1\u03b8\u03c9\u03c3\u03b7 \u03c3\u03c6\u03ac\u03bb\u03bc\u03b1\u03c4\u03bf\u03c2 \u03b4\u03b9\u03b1\u03ba\u03ae\u03c1\u03c5\u03be\u03b7\u03c2", {"key": "3"}),
            "amendment",
        )
        # \u039c\u03b1\u03c4\u03b1\u03af\u03c9\u03c3\u03b7/\u0391\u03ba\u03cd\u03c1\u03c9\u03c3\u03b7 is not a document_category -- cancellation already
        # has its own status field, so this falls through to declaration.
        self.assertEqual(
            classify_document("\u039c\u03b1\u03c4\u03b1\u03af\u03c9\u03c3\u03b7 \u03b4\u03b9\u03b1\u03b3\u03c9\u03bd\u03b9\u03c3\u03bc\u03bf\u03cd", {"key": "3"}),
            "declaration",
        )
        self.assertEqual(
            classify_document("\u0391\u03c0\u03cc\u03c6\u03b1\u03c3\u03b7 \u03ad\u03b3\u03ba\u03c1\u03b9\u03c3\u03b7\u03c2 \u03c0\u03c1\u03b1\u03ba\u03c4\u03b9\u03ba\u03bf\u03cd", {"key": "3"}),
            "decision",
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

