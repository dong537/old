import unittest

from scripts.zhuhai_image_review import build


class ZhuhaiImageReviewTests(unittest.TestCase):
    def test_all_twenty_five_names_have_image_card_locations_without_hash_backfill(self):
        rows, summary = build()
        self.assertEqual(len(rows), 25)
        self.assertEqual(summary["exact_name_count"], 25)
        self.assertFalse(summary["source_hash_backfilled"])
        self.assertEqual([r["source_row_number"] for r in rows], list(range(1, 26)))
        self.assertTrue(all(r["review_method"] == "agent_visual_self_review" for r in rows))
        self.assertTrue(all(not r["other_fields_verified"] and not r["row_content_verified"] for r in rows))


if __name__ == "__main__":
    unittest.main()
