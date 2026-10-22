"""Integrity guards for object-key reuse (A-15 / S-06) and rollback ownership (S-07).

These are the rules the two registration paths apply when a key already has a
registry row:

  · re-registering IDENTICAL bytes stays idempotent (unchanged behaviour);
  · re-registering a key whose stored bytes have CHANGED is rejected with a
    409 and mutates nothing — neither the row nor the object;
  · a missing digest on either side is *unverifiable*, not a conflict, so
    legacy rows and providers without checksums keep working;
  · compensation may remove storage only for an object this request created.

`app.services.media.media_integrity` is deliberately pure — no database, no
storage, no FastAPI — so these cases run with the standard library alone and
do not depend on the backend dependency set or a database fixture.

Run:  python3 -m unittest tests.unit.test_media_integrity_guards -v
"""

from __future__ import annotations

import unittest

from app.services.media.media_integrity import (
    CHECKSUM_MISMATCH_MESSAGE,
    checksum_conflict,
    compensation_report,
    normalise_checksum,
    should_compensate,
)

SHA_A = "a" * 64
SHA_B = "b" * 64


class ChecksumConflictTests(unittest.TestCase):
    """`checksum_conflict` is the single decision behind the 409."""

    def test_identical_digests_are_not_a_conflict(self):
        self.assertFalse(checksum_conflict(SHA_A, SHA_A))

    def test_different_digests_are_a_conflict(self):
        self.assertTrue(checksum_conflict(SHA_A, SHA_B))

    def test_comparison_ignores_hex_casing(self):
        self.assertFalse(checksum_conflict(SHA_A.upper(), SHA_A.lower()))
        self.assertTrue(checksum_conflict(SHA_A.upper(), SHA_B.upper()))

    def test_comparison_ignores_surrounding_whitespace(self):
        self.assertFalse(checksum_conflict(f"  {SHA_A}\n", SHA_A))
        self.assertTrue(checksum_conflict(f" {SHA_A} ", SHA_B))

    def test_missing_stored_digest_is_unverifiable_not_a_conflict(self):
        # A provider that cannot report a digest must not break registration.
        self.assertFalse(checksum_conflict(None, SHA_A))
        self.assertFalse(checksum_conflict("", SHA_A))
        self.assertFalse(checksum_conflict("   ", SHA_A))

    def test_missing_registered_digest_is_unverifiable_not_a_conflict(self):
        # Legacy rows written before checksums were recorded keep working.
        self.assertFalse(checksum_conflict(SHA_A, None))
        self.assertFalse(checksum_conflict(SHA_A, ""))

    def test_both_missing_is_not_a_conflict(self):
        self.assertFalse(checksum_conflict(None, None))
        self.assertFalse(checksum_conflict("", ""))

    def test_non_sha256_digests_are_unverifiable_not_a_conflict(self):
        # An MD5 ETag or a truncated hash must never produce a false 409.
        md5 = "d41d8cd98f00b204e9800998ecf8427e"
        self.assertFalse(checksum_conflict(md5, SHA_A))
        self.assertFalse(checksum_conflict(SHA_A, md5))
        self.assertFalse(checksum_conflict(SHA_A[:63], SHA_A))
        self.assertFalse(checksum_conflict("z" * 64, SHA_A))

    def test_normalise_checksum_is_idempotent(self):
        once = normalise_checksum(f" {SHA_A.upper()} ")
        self.assertEqual(once, SHA_A)
        self.assertEqual(normalise_checksum(once), once)

    def test_mismatch_message_is_actionable_and_leaks_nothing(self):
        self.assertIn("checksum", CHECKSUM_MISMATCH_MESSAGE.lower())
        self.assertIn("Nothing was changed", CHECKSUM_MISMATCH_MESSAGE)
        # No storage internals in a client-facing error.
        for internal in ("bucket", "etag", "s3://", "/var/", "C:\\"):
            self.assertNotIn(internal, CHECKSUM_MISMATCH_MESSAGE.lower())


class CompensationOwnershipTests(unittest.TestCase):
    """Only an object this request CREATED may be rolled back.

    `created=False` is the identical-bytes idempotent path: the object was
    already in storage, so some other record may reference it. Deleting it
    would be data loss — exactly what S-07's fix must never cause.
    """

    def test_object_created_by_this_request_may_be_removed(self):
        self.assertTrue(should_compensate({"key": "products/P/a.avif", "created": True}))

    def test_preexisting_object_is_never_removed(self):
        self.assertFalse(should_compensate({"key": "products/P/a.avif", "created": False}))
        # A descriptor without the flag (older/partial payload) is treated as
        # NOT ours rather than optimistically deleted.
        self.assertFalse(should_compensate({"key": "products/P/a.avif"}))

    def test_missing_descriptor_or_key_is_not_compensated(self):
        self.assertFalse(should_compensate(None))
        self.assertFalse(should_compensate({}))
        self.assertFalse(should_compensate({"created": True}))
        self.assertFalse(should_compensate({"created": True, "key": ""}))

    def test_replace_path_is_still_owned(self):
        # `created` is True for a replacement: the new object is this request's.
        self.assertTrue(
            should_compensate(
                {"key": "products/P/a-abc123.avif", "created": True, "replaced": True}
            )
        )

    def test_report_states_the_decision_without_deciding_anything(self):
        report = compensation_report({"key": "hero/x.avif", "created": True})
        self.assertEqual(report["compensated"], True)
        self.assertEqual(report["key"], "hero/x.avif")
        self.assertEqual(report["createdByRequest"], True)

        report = compensation_report({"key": "hero/x.avif", "created": False})
        self.assertEqual(report["compensated"], False)
        self.assertEqual(report["createdByRequest"], False)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
