import mimetypes
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

mimetypes.init()
mimetypes.add_type('text/javascript', '.js')
mimetypes.add_type('text/javascript', '.mjs')
mimetypes.add_type('text/css', '.css')
mimetypes.add_type('image/webp', '.webp')
mimetypes.add_type('image/svg+xml', '.svg')

class FrontendHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        '.js': 'text/javascript',
        '.mjs': 'text/javascript',
        '.css': 'text/css',
        '.svg': 'image/svg+xml',
        '.webp': 'image/webp',
    }

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def guess_type(self, path):
        clean = str(path).split('?')[0].lower()
        if clean.endswith('.js') or clean.endswith('.mjs'):
            return 'text/javascript'
        if clean.endswith('.css'):
            return 'text/css'
        if clean.endswith('.webp'):
            return 'image/webp'
        if clean.endswith('.svg'):
            return 'image/svg+xml'
        return super().guess_type(path)

if __name__ == '__main__':
    with ThreadingHTTPServer(('0.0.0.0', 8081), FrontendHandler) as server:
        print('Frontend disponible en http://localhost:8081')
        server.serve_forever()
