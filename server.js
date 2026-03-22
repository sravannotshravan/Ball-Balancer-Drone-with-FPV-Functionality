import http from 'node:http';
import { existsSync, createReadStream, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number.parseInt(process.env.PORT ?? '4173', 10);
const HOST = process.env.HOST ?? '0.0.0.0';

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain; charset=utf-8',
};

function getRequestPathname(requestUrl) {
    try {
        return new URL(requestUrl, `http://${HOST}:${PORT}`).pathname;
    } catch {
        return requestUrl.split('?')[0].split('#')[0];
    }
}

function sendFile(res, filePath) {
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream',
        'Cache-Control': 'no-cache',
    });
    createReadStream(filePath).pipe(res);
}

function safeResolve(requestPath) {
    const cleanedPath = requestPath.split('?')[0].split('#')[0];
    const decodedPath = decodeURIComponent(cleanedPath);
    const normalized = path.normalize(decodedPath).replace(/^([/\\])+/, '');
    return path.join(__dirname, normalized);
}

const server = http.createServer((req, res) => {
    if (!req.url) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Bad request');
        return;
    }

    const pathname = getRequestPathname(req.url);

    const requestPath = pathname === '/' ? '/index.html' : pathname;
    const filePath = safeResolve(requestPath);

    if (!filePath.startsWith(__dirname)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden');
        return;
    }

    if (!existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
    }

    const fileStat = statSync(filePath);
    if (!fileStat.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
    }

    sendFile(res, filePath);
});

server.listen(PORT, HOST, () => {
    console.log(`Serving ${__dirname} on http://${HOST}:${PORT}`);
});