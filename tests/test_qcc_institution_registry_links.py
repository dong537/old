"""Behavior tests for exact-code registry candidates built from public JSON."""

from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/build-qcc-institution-registry-links.py"


def module():
    spec = importlib.util.spec_from_file_location("institution_registry_links", SCRIPT)
    assert spec is not None and spec.loader is not None
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


def write(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")


def credit_code(prefix: str) -> str:
    alphabet = "0123456789ABCDEFGHJKLMNPQRTUWXY"
    weights = (1, 3, 9, 27, 19, 26, 16, 17, 20, 29, 25, 13, 8, 24, 10, 30, 28)
    assert len(prefix) == 17
    total = sum(alphabet.index(char) * weight for char, weight in zip(prefix, weights))
    return prefix + alphabet[(31 - total % 31) % 31]


class Fixture:
    def __init__(self, root: Path):
        self.ref = root / "ref"
        self.national = root / "national"
        self.guangdong = root / "guangdong"
        self.output = root / "links"
        self.pgd, self.cgd = "p-aaaaaaaaaaaa", "c-bbbbbbbbbbbb"
        self.pcq, self.ccq = "p-cccccccccccc", "c-dddddddddddd"
        self.a = credit_code("91440101MA0000001")
        self.b = credit_code("91500101MA0000002")
        self.c = credit_code("91440101MA0000003")
        self.d = credit_code("91500101MA0000004")
        self.reference = {
            "schemaVersion": 1, "snapshotId": "v1-ref", "rowCount": 5,
            "provinces": [
                {"slug": self.pgd, "name": "广东省", "count": 4, "cities": [
                    {"slug": self.cgd, "name": "广州市", "count": 4,
                     "indexPath": f"{self.pgd}/{self.cgd}/index.v1.json"}]},
                {"slug": self.pcq, "name": "重庆市", "count": 1, "cities": [
                    {"slug": self.ccq, "name": "重庆市", "count": 1,
                     "indexPath": f"{self.pcq}/{self.ccq}/index.v1.json"}]},
            ],
        }
        write(self.ref / "manifest.v1.json", self.reference)
        self.ref_gd = [
            self.ref_row(2, "甲养老院", self.a),
            self.ref_row(3, "乙养老院", self.b),
            self.ref_row(4, "无代码养老院", None),
            self.ref_row(5, "名称不同的养老场所", self.c),
        ]
        self.ref_cq = [self.ref_row(6, "歧义养老院", self.d, "重庆市")]
        self.city_files(self.ref, self.pgd, self.cgd, "v1-ref", self.ref_gd)
        self.city_files(self.ref, self.pcq, self.ccq, "v1-ref", self.ref_cq)
        self.nat_gd = [self.registry_row("qcc-n-" + "a" * 20, "甲养老院企业", self.a, "广东省", "广州")]
        self.nat_cq = [
            self.registry_row("qcc-n-" + "b" * 20, "乙养老院企业", self.b, "重庆市", "重庆"),
            self.registry_row("qcc-n-" + "d" * 20, "歧义主体一", self.d, "重庆市", "重庆"),
        ]
        write(self.national / "manifest.v1.json", {
            "schemaVersion": 1, "snapshotId": "v1-national", "rowCount": 3,
            "provinces": [
                {"slug": self.pgd, "name": "广东省", "count": 1, "cities": [
                    {"slug": self.cgd, "name": "广州", "count": 1,
                     "indexPath": f"{self.pgd}/{self.cgd}/index.v1.json"}]},
                {"slug": self.pcq, "name": "重庆市", "count": 2, "cities": [
                    {"slug": self.ccq, "name": "重庆", "count": 2,
                     "indexPath": f"{self.pcq}/{self.ccq}/index.v1.json"}]},
            ],
        })
        self.city_files(self.national, self.pgd, self.cgd, "v1-national", self.nat_gd)
        self.city_files(self.national, self.pcq, self.ccq, "v1-national", self.nat_cq)
        self.gd = [
            self.registry_row("gd-qcc-" + "c" * 20, "另一名称的登记主体", self.c, None, "广州"),
            self.registry_row("gd-qcc-" + "d" * 20, "歧义主体二", self.d, None, "广州"),
        ]
        write(self.guangdong / "index.v1.json", {
            "schemaVersion": 1, "snapshotId": "v1-guangdong",
            "records": [{key: value for key, value in row.items() if key not in ("creditCode", "codeValidity")}
                        for row in self.gd],
        })
        write(self.guangdong / "chunk-001.v1.json", {
            "schemaVersion": 1, "snapshotId": "v1-guangdong",
            "records": [{key: value for key, value in row.items() if key != "chunk"} for row in self.gd],
        })

    @staticmethod
    def ref_row(number: int, name: str, code: str | None, region: str = "广东省广州市") -> dict:
        return {"id": f"qi-aaaaaaaaaaaa-{number}", "sourceRow": number, "name": name,
                "region": region, "address": None, "beds": 0,
                "chunk": "chunk-001.v1.json", "creditCode": code,
                "codeStatus": "valid" if code else "missing"}

    @staticmethod
    def registry_row(row_id: str, name: str, code: str, province: str | None, city: str) -> dict:
        row = {"id": row_id, "rowNumber": 2, "name": name, "city": city,
               "chunk": "chunk-001.v1.json", "creditCode": code, "codeValidity": "valid"}
        if province:
            row.update({"province": province, "sourceId": "source-one"})
        return row

    @staticmethod
    def city_files(base: Path, p: str, c: str, snap: str, rows: list[dict]) -> None:
        shared = {"schemaVersion": 1, "snapshotId": snap, "provinceSlug": p, "citySlug": c}
        write(base / p / c / "index.v1.json", {**shared, "records": [
            {key: value for key, value in row.items() if key not in ("creditCode", "codeStatus", "codeValidity")} for row in rows]})
        write(base / p / c / "chunk-001.v1.json", {**shared, "records": [
            {key: value for key, value in row.items() if key != "chunk"} for row in rows]})


class RegistryLinksTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.fixture = Fixture(Path(self.temp.name))
        self.builder = module()

    def tearDown(self):
        self.temp.cleanup()

    def build(self):
        f = self.fixture
        return self.builder.build(f.ref, f.national, f.guangdong)

    def test_only_same_province_unique_valid_code_links_are_published(self):
        f = self.fixture
        outputs = self.build()
        manifest = json.loads(outputs["manifest.v1.json"])
        self.assertEqual((manifest["referenceRowCount"], manifest["eligibleReferenceCount"],
                          manifest["uniqueCodeHitCount"], manifest["linkedReferenceCount"],
                          manifest["crossProvinceHitCount"], manifest["ambiguousReferenceCount"],
                          manifest["regionCount"]), (5, 4, 3, 2, 1, 1, 2))
        gd = json.loads(outputs[f"{f.pgd}/{f.cgd}/links.v1.json"])
        cq = json.loads(outputs[f"{f.pcq}/{f.ccq}/links.v1.json"])
        self.assertEqual([item["referenceId"] for item in gd["links"]],
                         ["qi-aaaaaaaaaaaa-2", "qi-aaaaaaaaaaaa-5"])
        self.assertEqual([item["target"]["kind"] for item in gd["links"]],
                         ["nationalRegistry", "guangdongRegistry"])
        self.assertEqual(gd["links"][1]["target"]["name"], "另一名称的登记主体")
        self.assertEqual(cq["links"], [])
        self.assertEqual(len(outputs), 3)
        self.assertNotIn(f.a.encode(), outputs[f"{f.pgd}/{f.cgd}/links.v1.json"])

    def test_bad_input_snapshots_codes_and_targets_fail(self):
        f = self.fixture
        path = f.national / f.pgd / f.cgd / "chunk-001.v1.json"
        original = json.loads(path.read_text(encoding="utf-8"))
        write(path, {**original, "snapshotId": "stale"})
        with self.assertRaisesRegex(ValueError, "snapshot"):
            self.build()
        write(path, original)
        bad = json.loads(json.dumps(original))
        bad["records"][0]["creditCode"] = f.a[:-1] + ("1" if f.a[-1] != "1" else "2")
        write(path, bad)
        with self.assertRaisesRegex(ValueError, "invalid credit code"):
            self.build()
        write(path, original)
        bad = json.loads(json.dumps(original))
        bad["records"][0]["id"] = "wrong-id"
        write(path, bad)
        with self.assertRaisesRegex(ValueError, "disagree"):
            self.build()

    def test_check_rejects_tampered_and_extra_outputs(self):
        f = self.fixture
        outputs = self.build()
        self.builder.write_outputs(outputs, f.output, check=False)
        self.builder.write_outputs(outputs, f.output, check=True)
        path = f.output / f.pgd / f.cgd / "links.v1.json"
        path.write_text("{}", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "differs"):
            self.builder.write_outputs(outputs, f.output, check=True)
        self.builder.write_outputs(outputs, f.output, check=False)
        write(f.output / "unexpected.json", {})
        with self.assertRaisesRegex(ValueError, "file set"):
            self.builder.write_outputs(outputs, f.output, check=True)


if __name__ == "__main__":
    unittest.main()
