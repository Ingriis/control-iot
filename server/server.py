
import http.server
import mimetypes
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

mimetypes.add_type("text/javascript", ".js")

class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **mimetypes.types_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

server = http.server.HTTPServer(("127.0.0.1", 5502), Handler)
print("Frontend disponible en http://127.0.0.1:5502")
server.serve_forever()
