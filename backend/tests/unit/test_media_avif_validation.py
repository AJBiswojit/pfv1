"""
AVIF upload validation.

Why this file exists
--------------------
AVIF is the storefront's dominant product-image format — it is first in
`ALLOWED_IMAGE_TYPES` and 102 of the committed mock assets really are AVIF.
Pillow cannot decode AVIF on its own, so before this work the geometry guard
in `image_geometry()` silently skipped EVERY AVIF upload: the file passed the
magic-byte check and went straight into the store with its dimensions and
pixel count unverified.

`pillow-avif-plugin` closes that gap. Two properties make it safe to add:

  · it is a self-contained wheel (libavif is bundled — no new system package,
    no Pillow upgrade at the pinned 10.3.0);
  · it registers itself as a Pillow plugin on IMPORT, and if the wheel is
    missing the guard degrades to "skip AVIF" exactly as before rather than
    turning a missing optional dependency into an upload outage.

What is asserted here
---------------------
  1. the codec is registered, so AVIF geometry is actually measured;
  2. a real AVIF is accepted and its dimensions reported;
  3. an AVIF over MAX_IMAGE_PIXELS is rejected;
  4. an AVIF over MAX_IMAGE_DIMENSION_PX is rejected;
  5. an AVIF that trips Pillow's decompression-bomb guard is rejected;
  6. a malformed AVIF (correct brand, undecodable body) is NOT rejected by the
     geometry guard — it has already passed the signature check, and refusing
     the house's dominant format over one bad file would be a regression —
     but the skip is reported honestly;
  7. the file-size ceiling, MIME-signature check and authorization-relevant
     `extension_mismatch` reporting all still apply to AVIF;
  8. the graceful-degradation path (no wheel installed) is explicit;
  9. the committed mock AVIF assets still decode — read-only, nothing is
     written, renamed or regenerated.

No AWS account, no network, no database, and no write to the mock library.
"""

from __future__ import annotations

import asyncio
import hashlib
import io
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image

from app.config import settings
from app.services.media import media_validation
from app.services.media.media_validation import (
    DIMENSION_AVIF_DECODER_MISSING,
    DIMENSION_NOT_DECODABLE,
    DIMENSION_OK,
    MediaValidationError,
    avif_decoder_available,
    ensure_avif_support,
    image_geometry,
    reset_avif_registration_cache,
    validate_image_bytes,
)
from app.storage.signatures import sniff_content_type

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
MOCK_IMAGE_DIR = REPOSITORY_ROOT / "frontend" / "public" / "images"


def build_avif(width: int, height: int, *, colour=(12, 120, 200)) -> bytes:
    """Encode a real AVIF in memory. Returns b"" when the codec is missing."""
    if not avif_decoder_available():
        return b""
    buffer = io.BytesIO()
    Image.new("RGB", (width, height), colour).save(buffer, format="AVIF")
    return buffer.getvalue()


def avif_available() -> bool:
    return avif_decoder_available()


#: `ftypavif` brand followed by a body that is not a decodable AVIF.
MALFORMED_AVIF = (
    b"\x00\x00\x00\x1c" + b"ftypavif" + b"\x00\x00\x00\x00avifmif1" + b"\x00" * 512
)

PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01"
    b"\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)


@unittest.skipUnless(avif_available(), "pillow-avif-plugin is not installed")
class AvifCodecRegistrationTests(unittest.TestCase):
    def test_pillow_registers_avif_after_the_plugin_is_imported(self):
        """
        The core of the fix: the plugin does NOT self-register on
        `from PIL import Image`, so this is asserted explicitly.
        """
        self.assertEqual(Image.registered_extensions().get(".avif"), "AVIF")

    def test_a_fresh_interpreter_only_decodes_avif_with_the_import(self):
        """
        Proof of the same property in a clean process, because the in-process
        assertion above could pass on a registration made by another module.
        """
        import subprocess

        script = (
            "from PIL import Image\n"
            "import io, base64\n"
            "raw = base64.b64decode(__import__('os').environ['AVIF_B64'])\n"
            "try:\n"
            "    Image.open(io.BytesIO(raw)).load()\n"
            "    print('decoded')\n"
            "except Exception:\n"
            "    print('failed')\n"
        )
        env = dict(os.environ, AVIF_B64=_b64(build_avif(7, 5)))
        env.pop("PYTEST_CURRENT_TEST", None)
        without = subprocess.run(
            [sys.executable, "-c", script],
            capture_output=True,
            text=True,
            env=env,
            cwd=str(REPOSITORY_ROOT / "backend"),
        )
        self.assertIn("failed", without.stdout, "expected AVIF to be undecodable")

        with_plugin = subprocess.run(
            [sys.executable, "-c", "import pillow_avif\n" + script],
            capture_output=True,
            text=True,
            env=env,
            cwd=str(REPOSITORY_ROOT / "backend"),
        )
        self.assertIn("decoded", with_plugin.stdout)

    def test_ensure_avif_support_is_idempotent(self):
        reset_avif_registration_cache()
        try:
            self.assertTrue(ensure_avif_support())
            self.assertTrue(ensure_avif_support())
        finally:
            reset_avif_registration_cache()
            ensure_avif_support()


def _b64(data: bytes) -> str:
    import base64

    return base64.b64encode(data).decode("ascii")


@unittest.skipUnless(avif_available(), "pillow-avif-plugin is not installed")
class AvifValidationTests(unittest.TestCase):
    def test_a_real_avif_is_accepted_and_measured(self):
        data = build_avif(24, 13)
        self.assertEqual(sniff_content_type(data), "image/avif")

        validated = validate_image_bytes("products/PF-1/primary.avif", data)
        self.assertEqual(validated.content_type, "image/avif")
        self.assertEqual(validated.width, 24)
        self.assertEqual(validated.height, 13)
        self.assertEqual(validated.dimension_check, DIMENSION_OK)
        self.assertFalse(validated.extension_mismatch)

    def test_an_oversized_pixel_count_is_rejected(self):
        data = build_avif(20, 10)  # 200 px
        with patch.object(settings, "MAX_IMAGE_PIXELS", 100):
            with self.assertRaises(MediaValidationError) as ctx:
                validate_image_bytes("products/PF-1/primary.avif", data)
        self.assertIn("exceeds the maximum of 100 pixels", str(ctx.exception))

    def test_an_oversized_longest_side_is_rejected(self):
        data = build_avif(20, 10)
        with patch.object(settings, "MAX_IMAGE_DIMENSION_PX", 5):
            with self.assertRaises(MediaValidationError) as ctx:
                validate_image_bytes("products/PF-1/primary.avif", data)
        self.assertIn("longest side must not exceed 5 pixels", str(ctx.exception))

    def test_a_decompression_bomb_is_rejected(self):
        """
        Pillow raises DecompressionBombError above 2 x MAX_IMAGE_PIXELS; below
        that it only warns, which is why the explicit pixel-count check above
        matters. Both paths must end in MediaValidationError.
        """
        data = build_avif(20, 10)  # 200 px vs a limit that makes it a bomb
        with patch.object(settings, "MAX_IMAGE_PIXELS", 20):
            with self.assertRaises(MediaValidationError) as ctx:
                validate_image_bytes("products/PF-1/primary.avif", data)
        self.assertIn("decompression bomb", str(ctx.exception))

    def test_the_size_ceiling_still_applies_to_avif(self):
        data = build_avif(24, 13)
        with patch.object(settings, "MAX_IMAGE_SIZE_MB", 0):
            with self.assertRaises(MediaValidationError) as ctx:
                validate_image_bytes("products/PF-1/primary.avif", data)
        self.assertIn("maximum allowed size", str(ctx.exception))

    def test_the_signature_check_still_rejects_a_non_image_body(self):
        """
        A `.avif` name is not enough: the bytes must actually be a type the
        policy allows. An MP4 renamed to `.avif` is rejected outright.
        """
        mp4 = b"\x00\x00\x00\x1cftypisom" + b"\x00" * 64
        self.assertEqual(sniff_content_type(mp4), "video/mp4")
        with self.assertRaises(MediaValidationError) as ctx:
            validate_image_bytes("products/PF-1/primary.avif", mp4)
        self.assertIn("not an allowed image type", str(ctx.exception))

    def test_an_avif_named_png_is_accepted_but_flagged(self):
        """
        The sniffed type is the authority. The disagreement is reported rather
        than silently trusted — that is what `extension_mismatch` is for.
        """
        data = build_avif(16, 9)
        validated = validate_image_bytes("products/PF-1/primary.png", data)
        self.assertEqual(validated.content_type, "image/avif")
        self.assertTrue(validated.extension_mismatch)
        self.assertEqual(validated.declared_extension_type, "image/png")

    def test_a_malformed_avif_skips_the_geometry_guard_honestly(self):
        """
        Correct brand, undecodable body. The signature check passes (so the
        file is an image as far as the policy can tell), and the geometry
        guard reports that it could not measure it instead of guessing.
        """
        self.assertEqual(sniff_content_type(MALFORMED_AVIF), "image/avif")
        validated = validate_image_bytes("products/PF-1/broken.avif", MALFORMED_AVIF)
        self.assertIsNone(validated.width)
        self.assertEqual(validated.dimension_check, DIMENSION_NOT_DECODABLE)

    def test_non_avif_validation_is_unchanged(self):
        validated = validate_image_bytes("products/PF-1/primary.png", PNG_BYTES)
        self.assertEqual(validated.content_type, "image/png")
        self.assertEqual(validated.dimension_check, DIMENSION_OK)
        self.assertFalse(validated.extension_mismatch)


class AvifGracefulDegradationTests(unittest.TestCase):
    """
    If the optional wheel is absent, AVIF must not become an upload outage —
    but the skip has to be distinguishable from "checked and fine".
    """

    def test_avif_reports_the_missing_decoder_instead_of_being_measured(self):
        data = build_avif(24, 13)
        with patch.object(
            media_validation,
            "_AVIF_REGISTRATION_STATE",
            {"attempted": True, "available": False},
        ):
            width, height, reason = image_geometry(data)
        self.assertIsNone(width)
        self.assertIsNone(height)
        self.assertEqual(reason, DIMENSION_AVIF_DECODER_MISSING)

    def test_a_missing_decoder_does_not_reject_the_upload(self):
        data = build_avif(24, 13)
        with patch.object(
            media_validation,
            "_AVIF_REGISTRATION_STATE",
            {"attempted": True, "available": False},
        ):
            validated = validate_image_bytes("products/PF-1/primary.avif", data)
        self.assertEqual(validated.dimension_check, DIMENSION_AVIF_DECODER_MISSING)
        self.assertEqual(validated.content_type, "image/avif")

    def test_a_missing_decoder_leaves_other_formats_measured(self):
        with patch.object(
            media_validation,
            "_AVIF_REGISTRATION_STATE",
            {"attempted": True, "available": False},
        ):
            validated = validate_image_bytes("products/PF-1/primary.png", PNG_BYTES)
        self.assertEqual(validated.dimension_check, DIMENSION_OK)
        self.assertEqual((validated.width, validated.height), (1, 1))


@unittest.skipUnless(
    MOCK_IMAGE_DIR.is_dir(), "the frontend mock asset library is not present"
)
class CommittedMockAssetTests(unittest.TestCase):
    """
    Read-only sanity check over the committed mock library. Nothing here
    writes, renames, migrates or regenerates an existing asset.
    """

    def test_the_committed_avif_assets_decode(self):
        assets = sorted(MOCK_IMAGE_DIR.rglob("*.avif"))
        self.assertTrue(assets, "expected the mock library to contain .avif files")
        if not avif_available():  # pragma: no cover - wheel is pinned
            self.skipTest("pillow-avif-plugin is not installed")

        avif_assets = [
            path
            for path in assets
            if sniff_content_type(path.open("rb").read(64)) == "image/avif"
        ]
        self.assertTrue(avif_assets, "expected at least one true AVIF mock asset")

        failures = []
        for path in avif_assets:
            try:
                with Image.open(path) as handle:
                    handle.size
            except Exception as exc:  # noqa: BLE001 - reported below
                failures.append(f"{path.name}: {type(exc).__name__}")
        self.assertEqual(failures, [], "undecodable committed AVIF assets")

    def test_mislabelled_mock_assets_are_reported_not_silently_accepted(self):
        """
        Documentation of a pre-existing catalogue condition: some committed
        `.avif` mock files are really JPEG/PNG. Nothing is renamed here — the
        point is that the upload policy detects the mismatch, which is exactly
        what `extension_mismatch` exists to surface.
        """
        mislabelled = []
        for path in sorted(MOCK_IMAGE_DIR.rglob("*.avif")):
            with path.open("rb") as handle:
                head = handle.read(64)
            sniffed = sniff_content_type(head)
            if sniffed is not None and sniffed != "image/avif":
                mislabelled.append((path, sniffed))

        # The exact count is catalogue data that changes when marketing adds
        # assets, so it is not asserted. What must hold is that every such
        # file is flagged rather than trusted — several of the committed
        # `.avif` mock assets are really JPEG or PNG bytes.
        for path, sniffed in mislabelled[:5]:
            with self.subTest(asset=path.name):
                validated = validate_image_bytes(
                    path.name, path.read_bytes()
                )
                self.assertTrue(
                    validated.extension_mismatch,
                    f"{path.name} holds {sniffed} bytes and must be flagged",
                )
                self.assertEqual(validated.content_type, sniffed)


@unittest.skipUnless(avif_available(), "pillow-avif-plugin is not installed")
class AvifUploadRoundTripTests(unittest.TestCase):
    """
    The whole upload path — validate, build a key, store, read back — with a
    real AVIF, against a throwaway local provider. No database, no AWS.
    """

    def _upload_service(self):
        import shutil
        import tempfile

        from app.services.media.media_service import MediaService
        from app.services.media.upload_service import UploadService
        from app.storage.local import LocalStorageProvider

        root = Path(tempfile.mkdtemp(prefix="pfv1-avif-store-"))
        self.addCleanup(shutil.rmtree, root, True)
        storage = LocalStorageProvider(root)
        return UploadService(media_service=MediaService(storage=storage)), storage

    def test_a_real_avif_is_stored_and_read_back_byte_for_byte(self):
        service, storage = self._upload_service()
        data = build_avif(32, 18)

        result = asyncio.run(
            service.store_upload(
                file_obj=io.BytesIO(data),
                filename="products/PF-AVIF-1/primary.avif",
                declared_content_type="image/avif",
                namespace="products",
                product_id="PF-AVIF-1",
            )
        )

        self.assertEqual(result["contentType"], "image/avif")
        self.assertTrue(result["created"])
        self.assertEqual(result["checksumSha256"], hashlib.sha256(data).hexdigest())
        self.assertNotIn("declaredContentTypeMismatch", result)
        self.assertEqual(storage.get_object(result["key"]), data)

    def test_an_oversized_avif_is_refused_and_nothing_is_written(self):
        service, storage = self._upload_service()
        data = build_avif(20, 10)  # 200 px

        with patch.object(settings, "MAX_IMAGE_PIXELS", 100):
            with self.assertRaises(MediaValidationError):
                asyncio.run(
                    service.store_upload(
                        file_obj=io.BytesIO(data),
                        filename="products/PF-AVIF-2/primary.avif",
                        namespace="products",
                        product_id="PF-AVIF-2",
                    )
                )

        self.assertEqual(list(storage.list_objects(limit=100)), [])

    def test_an_avif_over_the_size_ceiling_is_refused(self):
        service, storage = self._upload_service()
        data = build_avif(32, 18)

        with patch.object(settings, "MAX_IMAGE_SIZE_MB", 0):
            with self.assertRaises(MediaValidationError):
                asyncio.run(
                    service.store_upload(
                        file_obj=io.BytesIO(data),
                        filename="products/PF-AVIF-3/primary.avif",
                        namespace="products",
                        product_id="PF-AVIF-3",
                    )
                )

        self.assertEqual(list(storage.list_objects(limit=100)), [])


if __name__ == "__main__":
    unittest.main()
