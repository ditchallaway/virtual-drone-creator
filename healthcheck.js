// Docker healthcheck: exits 0 when the server responds with HTTP 200.
import http from 'http';
http.get('http://localhost:3000/render.html', (res) => {
    process.exit(res.statusCode === 200 ? 0 : 1);
}).on('error', () => process.exit(1));
