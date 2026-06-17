from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any


TAXONOMY_PATH = Path(__file__).with_name("analysis_taxonomy.json")


@lru_cache(maxsize=1)
def load_analysis_taxonomy() -> dict[str, Any]:
    raw = json.loads(TAXONOMY_PATH.read_text(encoding="utf-8"))
    fields = []
    for field in raw["fields"]:
        fields.append(
            {
                "id": field["id"],
                "label": field["label"],
                "values": [
                    {
                        "value": value,
                        "label": value,
                        "aliases": field.get("aliases", {}).get(value, []),
                    }
                    for value in field["values"]
                ],
            }
        )
    return {
        "version": raw["version"],
        "displayOrder": raw["displayOrder"],
        "fields": fields,
    }


def taxonomy_version() -> str:
    return str(load_analysis_taxonomy()["version"])


def taxonomy_prompt_lines() -> list[str]:
    lines = []
    for field in load_analysis_taxonomy()["fields"]:
        values = ", ".join(value["value"] for value in field["values"])
        lines.append(f"{field['id']}: {values}")
    return lines
