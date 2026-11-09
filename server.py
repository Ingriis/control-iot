
import http.server
import mimetypes

mimetypes.add_type("text/javascript", ".js")

class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **mimetypes.types_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
    }

server = http.server.HTTPServer(("127.0.0.1", 5502), Handler)
print("Frontend disponible en http://127.0.0.1:5502")
server.serve_forever()
