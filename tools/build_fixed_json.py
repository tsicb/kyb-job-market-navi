#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Google Sheetsからダウンロードした職種別市場データ.xlsxを読み、
GitHub Pages用の固定マスタJSONを生成するツール。
外部ライブラリ不要（Python標準ライブラリのみ）。
"""

import argparse
import json
import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
DOC_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships"
NS = {"m": MAIN, "r": DOC_REL, "pr": PKG_REL}


def col_index(ref):
    letters = re.match(r"([A-Z]+)", ref).group(1)
    n = 0
    for ch in letters:
        n = n * 26 + ord(ch) - 64
    return n - 1


def shared_strings(zf):
    if "xl/sharedStrings.xml" not in zf.namelist():
        return []
    root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    result = []
    for si in root.findall("m:si", NS):
        parts = []
        direct = si.find("m:t", NS)
        if direct is not None:
            parts.append(direct.text or "")
        for run in si.findall("m:r", NS):
            t = run.find("m:t", NS)
            if t is not None:
                parts.append(t.text or "")
        result.append("".join(parts))
    return result


def sheet_paths(zf):
    wb = ET.fromstring(zf.read("xl/workbook.xml"))
    rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
    relmap = {r.attrib["Id"]: r.attrib["Target"] for r in rels}
    out = {}
    for sheet in wb.find("m:sheets", NS):
        name = sheet.attrib["name"]
        rid = sheet.attrib[f"{{{DOC_REL}}}id"]
        path = relmap[rid]
        if not path.startswith("xl/"):
            path = "xl/" + path
        out[name] = path
    return out


def read_sheet(zf, path, shared, cols):
    root = ET.fromstring(zf.read(path))
    result = []
    for row in root.findall(".//m:sheetData/m:row", NS):
        values = [""] * cols
        for cell in row.findall("m:c", NS):
            idx = col_index(cell.attrib["r"])
            if idx >= cols:
                continue
            typ = cell.attrib.get("t")
            v = cell.find("m:v", NS)
            value = ""
            if typ == "s" and v is not None:
                value = shared[int(v.text)]
            elif typ == "inlineStr":
                value = "".join(t.text or "" for t in cell.findall(".//m:t", NS))
            elif typ == "b" and v is not None:
                value = v.text == "1"
            elif v is not None:
                text = v.text or ""
                try:
                    n = float(text)
                    value = int(n) if n.is_integer() else n
                except ValueError:
                    value = text
            values[idx] = value
        if any(v != "" for v in values):
            result.append(values)
    return result


def main():
    p = argparse.ArgumentParser()
    p.add_argument("xlsx")
    p.add_argument("output_dir", nargs="?", default="data")
    args = p.parse_args()

    outdir = Path(args.output_dir)
    outdir.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(args.xlsx) as zf:
        paths = sheet_paths(zf)
        shared = shared_strings(zf)
        classification = read_sheet(zf, paths["職種分類マスタ"], shared, 7)
        tags = read_sheet(zf, paths["職種タグマスタ"], shared, 7)
        relations = read_sheet(zf, paths["職種関連マスタ"], shared, 9)

    classification_data = [
        {
            "job_id": r[0],
            "job_name": r[1],
            "concept_type": r[2],
            "major_category": r[3],
            "middle_category": r[4],
            "review_status": r[5],
            "note": r[6] or "",
        }
        for r in classification[1:] if r[0]
    ]

    tags_data = [
        {
            "job_id": r[0],
            "job_name": r[1],
            "tag_type": r[2],
            "tag": r[3],
            "search_weight": int(r[4]) if r[4] != "" else 0,
            "auto_generated": bool(r[5]),
            "note": r[6] or "",
        }
        for r in tags[1:] if r[0]
    ]

    relations_data = [
        {
            "source_job_id": r[0],
            "source_job_name": r[1],
            "target_job_id": r[2],
            "target_job_name": r[3],
            "relation_type": r[4],
            "search_bonus": int(r[5]) if r[5] != "" else 0,
            "expand_level": int(r[6]) if r[6] != "" else 3,
            "direction": r[7],
            "note": r[8] or "",
        }
        for r in relations[1:] if r[0]
    ]

    for filename, data in (
        ("classification.json", classification_data),
        ("tags.json", tags_data),
        ("relations.json", relations_data),
    ):
        (outdir / filename).write_text(
            json.dumps(data, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    print(f"classification: {len(classification_data)}")
    print(f"tags: {len(tags_data)}")
    print(f"relations: {len(relations_data)}")
    print(f"output: {outdir.resolve()}")


if __name__ == "__main__":
    main()
