"""Shared path resolution for the teams_tools scripts.

Paths are resolved relative to this repository (scripts live in
`<repo>/teams_tools/`, data lives in `<repo>/myteam/`), so the tools work no
matter where the repo is checked out. Override with environment variables:

    TEAMS_TSV   path to the master teams.tsv
    TEAMS_XLSX  path to the derived teams.xlsx

Or pass an explicit path as a CLI argument where a script supports it.
"""
import os
from pathlib import Path

TOOL_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = TOOL_DIR.parent
MYTEAM_DIR = PROJECT_ROOT / "myteam"


def tsv_path(explicit=None) -> str:
    if explicit:
        return str(explicit)
    return os.environ.get("TEAMS_TSV", str(MYTEAM_DIR / "teams.tsv"))


def xlsx_path(explicit=None) -> str:
    if explicit:
        return str(explicit)
    return os.environ.get("TEAMS_XLSX", str(MYTEAM_DIR / "teams.xlsx"))
