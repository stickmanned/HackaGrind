import sqlite3	
import time
from typing import List, Dict, Any, Optional

DB_FILE = "hackagrind.db"
IDLE_TIMEOUT_SECONDS = 120

def get_db():
	conn = sqlite3.connect(DB_FILE)
	conn.row_factory = sqlite3.Row
	return conn

def init_db():
	with get_db() as conn:
		conn.execute("""
			CREATE TABLE IF NOT EXISTS heartbeats (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				project_name TEXT NOT NULL,
				entity TEXT,
				branch TEXT,
				language TEXT,
				category TEXT,
				is_write INTEGER DEFAULT 0,
				time REAL NOT NULL,
				created_at REAL DEFAULT CURRENT_TIMESTAMP
			)
		""")
		conn.execute("CREATE INDEX IF NOT EXISTS idx_time ON heartbeats(time)")
		conn.execute("CREATE INDEX IF NOT EXISTS idx_project ON heartbeats(project_name)")
		conn.commit()


def clear_all_data():
	with get_db() as conn:
		conn.execute("DELETE FROM heartbeats")
		conn.commit()
	print("Database cleared successfully!")


def save_heartbeat(project_name: str, entity: str = "", branch: str = "", language: str = "", category: str = "coding", is_write: bool = False, timestamp: Optional[float] = None):
	if timestamp is None:
		timestamp = time.time()
	with get_db() as conn:
		conn.execute("INSERT INTO heartbeats (project_name, entity, branch, language, category, is_write, time) VALUES (?, ?, ?, ?, ?, ?, ?)", (project_name or "Unknown", entity, branch or "main", language or "Other", category, 1 if is_write else 0, timestamp))
		conn.commit()


def calculate_durations(heartbeats: List[Dict[str, Any]]) -> Dict[str, Any]:
	if not heartbeats:
		return {"total_seconds": 0, "by_project": {}, "by_language": {}, "by_branch": {}}

	sorted_hb = sorted(heartbeats, key=lambda x: x["time"])
	total_seconds = 0.0
	by_project = {}
	by_language = {}
	by_branch = {}
	prev_time = None
	for hb in sorted_hb:
		curr_time = hb["time"]
		proj = hb.get("project_name") or hb.get("project") or "Unknown"
		lang = hb.get("language") or "Other"
		branch = hb.get("branch") or "main"
		
		if prev_time is not None:
			gap = curr_time - prev_time
			if 0 < gap <= IDLE_TIMEOUT_SECONDS:
				total_seconds += gap
				by_project[proj] = by_project.get(proj, 0.0) + gap
				by_language[lang] = by_language.get(lang, 0.0) + gap
				by_branch[branch] = by_branch.get(branch, 0.0) + gap
		prev_time = curr_time

	return {
		"total_seconds": round(total_seconds, 1),
		"by_project": {k: round(v, 1) for k, v in by_project.items()},
		"by_language": {k: round(v, 1) for k, v in by_language.items()},
		"by_branch": {k: round(v, 1) for k, v in by_branch.items()},
	}


def get_stats_for_projects(project_names: Optional[List[str]] = None, start_time: Optional[float] = None) -> Dict[str, Any]:
	with get_db() as conn:
		query = "SELECT project_name, entity, branch, language, is_write, time FROM heartbeats WHERE 1=1"
		params = []
		if project_names:
			placeholders = ",".join("?" for _ in project_names)
			query += f" AND project_name IN ({placeholders})"
			params.extend(project_names)

		if start_time:
			query += " AND time >= ?"
			params.append(start_time)

		cursor = conn.execute(query, params)
		rows = [dict(r) for r in cursor.fetchall()]

	return calculate_durations(rows)


if __name__ == "__main__":
	init_db()
	print("Database initialized successfully!")