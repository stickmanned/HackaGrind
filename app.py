import os
import json
import time
import webbrowser
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse
from engine import save_heartbeat, get_stats_for_projects, init_db, clear_all_data
from importer import fetch_from_hackatime


PORT = 3000


class HackaGrindHandler(BaseHTTPRequestHandler):
	def serve_file(self, filepath, content_type):
		if os.path.exists(filepath):
			self.send_response(200)
			self.send_header("Content-Type", content_type)
			self.end_headers()
			with open(filepath, "rb") as f:
				self.wfile.write(f.read())
		else:
			self.send_error(404, "File Not Found")
			
	def do_GET(self):
		parsed_url = urlparse(self.path)
		params = parse_qs(parsed_url.query)
		if parsed_url.path == "/api/stats":
			projects = params.get("projects")
			stats = get_stats_for_projects(project_names=projects)
			self.send_response(200)
			self.send_header("Content-Type", "application/json")
			self.end_headers()
			self.wfile.write(json.dumps(stats).encode())
		elif parsed_url.path in ["/", "/index.html"]:
			self.serve_file("templates/index.html", "text/html")
		elif parsed_url.path.startswith("/static/"):
			filepath = parsed_url.path.lstrip("/")
			content_type = "text/css" if filepath.endswith(".css") else "application/javascript" if filepath.endswith(".js") else "text/plain"
			self.serve_file(filepath, content_type)
		else:
			self.send_error(404, "Not Found")
			
	def do_POST(self):
		if self.path in ["/api/heartbeats", "/api/v1/users/current/heartbeats"]:
			content_length = int(self.headers.get('Content-Length', 0))
			post_data = self.rfile.read(content_length)
			body = json.loads(post_data.decode('utf-8'))
			save_heartbeat(project_name=body.get("project", "Unknown"), entity=body.get("entity", ""), branch=body.get("branch", ""), language=body.get("language", ""), category=body.get("category", "coding"), is_write=body.get("is_write", False))
			self.send_response(201)
			self.end_headers()
			self.wfile.write(b'{"status": "ok"}')
		elif self.path == "/api/sync-hackatime":
			content_length = int(self.headers.get('Content-Length', 0))
			post_data = self.rfile.read(content_length)
			body = json.loads(post_data.decode('utf-8'))
			api_key = body.get("api_key", "").strip()
			base_url = body.get("base_url", "https://hackatime.hackclub.com/api/v1").strip() or "https://hackatime.hackclub.com/api/v1"
			if not api_key:
				self.send_response(400)
				self.send_header("Content-Type", "application/json")
				self.end_headers()
				self.wfile.write(json.dumps({"status": "error", "message": "API key is required"}).encode())
				return
			clear_all_data()
			success, msg = fetch_from_hackatime(api_key, base_url)
			self.send_response(200 if success else 400)
			self.send_header("Content-Type", "application/json")
			self.end_headers()
			res_status = "ok" if success else "error"
			self.wfile.write(json.dumps({"status": res_status, "message": msg}).encode())
		elif self.path == "/api/clear-data":
			clear_all_data()
			self.send_response(200)
			self.send_header("Content-Type", "application/json")
			self.end_headers()
			self.wfile.write(b'{"status": "ok", "message": "Data cleared"}')
		else:
			self.send_error(404, "Not Found")


class ReusableHTTPServer(HTTPServer):
	allow_reuse_address = True


def run_server():
	init_db()
	global PORT
	try:
		server = ReusableHTTPServer(('127.0.0.1', PORT), HackaGrindHandler)
	except OSError:
		os.system(f"lsof -i :{PORT} -t | xargs kill -9 2>/dev/null")
		time.sleep(0.5)
		try:
			server = ReusableHTTPServer(('127.0.0.1', PORT), HackaGrindHandler)
		except OSError:
			PORT = 3001
			server = ReusableHTTPServer(('127.0.0.1', PORT), HackaGrindHandler)

	print(f"HackaGrind server running on http://127.0.0.1:{PORT}")
	webbrowser.open(f"http://127.0.0.1:{PORT}")
	server.serve_forever()


if __name__ == "__main__":
	run_server()
