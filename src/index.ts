import * as fs from 'fs';
import * as path from 'path';
import { IncomingMessage, ServerResponse } from 'http';
import mimeWithExtension from './getMime';

const stat = fs.promises.stat;
const fsPromises = fs.promises;

interface ErrorResponse {
    statusCode: number;
    message: string;
    error: string;
    errorCode?: string;
}
interface Request {
    headers: Record<string, string>;
    method: string;
}

interface JaiStaticOptions {
    root?: string;
    dir: string;
    dotfiles?: 'allow' | 'deny' | 'ignore';
    maxAge?: number;
    headers?: Record<string, string>;
    existingHeaders?: Record<string, string>;
    lastModified?: boolean;
    etag?: boolean;
    acceptRanges?: boolean;
    cacheControl?: boolean;
    index?: string | string[];
    extensions?: string[];
    allowedExtensions?: string[];
    basePath?: string;
    urlPath?: string;
}

type NextFunction = () => void;

// Error response functions
const error404 = (res: ServerResponse, error: Error): boolean => {
    res.statusCode = 404;
    if (!res.headersSent) {
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(404);
    }
    res.end(JSON.stringify({
        statusCode: 404,
        message: 'Not Found',
        error: error.message,
    } as ErrorResponse));
    return false;
}

const error500 = (res: ServerResponse, error: Error): boolean => {
    console.error(error);
    res.statusCode = 500;
    if (!res.headersSent) {
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(500);
    }
    res.end(JSON.stringify({
        statusCode: 500,
        message: 'Internal Server Error - Jai Server',
        error: error.message,
    } as ErrorResponse));
    return false;
}

const error403 = (res: ServerResponse, error: Error & { code?: string }): boolean => {
    res.statusCode = 403;
    if (!res.headersSent) {
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(403);
    }
    res.end(JSON.stringify({
        statusCode: 403,
        message: 'Forbidden',
        error: error.message,
        errorCode: error.code,
    } as ErrorResponse));
    return false;
}

// Default cache max age in seconds (1 hour)
const maxAge = 3600;

// Default options for the static file server
const defaultOptions: JaiStaticOptions = {
    root: path.join(__dirname, 'public'),
    dir: '',
    dotfiles: 'deny',
    maxAge: maxAge,
    headers: {
        'Cache-Control': `public, max-age=${maxAge}`,
    },
    lastModified: true,
    etag: true,
    acceptRanges: true,
    cacheControl: true,
    index: 'index.html',
    extensions: ['html', 'htm'],
    allowedExtensions: ['*'],
    existingHeaders: {}
}

// Helper functions
async function tryAccessWithExtensions(filePath: string, extensions: string[]): Promise<string | null> {
    const baseFilePath = filePath.replace(/\.[^/.]+$/, "");
    for (const ext of extensions) {
        const newFilePath = `${baseFilePath}${ext.startsWith('.') ? ext : `.${ext}`}`;
        try {
            await fsPromises.access(newFilePath);
            return newFilePath;
        } catch (_e) {
            continue;
        }
    }
    return null;
}

async function tryIndexes(options: JaiStaticOptions, filePath: string): Promise<string | false> {
    const indexToSearch = typeof options.index === 'string' ? [options.index] : options.index || [];
    for (const indexName of indexToSearch) {
        if (indexName === '') continue;
        const newFile = path.join(filePath, indexName);
        try {
            await fsPromises.access(newFile);
            return `${filePath}/${indexName}`;
        }
        catch (e) { continue }
    }
    return false;
}

// Helper function to parse range header
function parseRange(range: string, fileSize: number): { start: number; end: number } | null {
    const match = range.match(/bytes=(\d+)-(\d*)/);
    if (!match) return null;

    const start = parseInt(match[1] || '0', 10);
    const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;

    if (isNaN(start) || isNaN(end) || start >= fileSize || end >= fileSize || start > end) {
        return null;
    }

    return { start, end };
}

// Helper function to parse If-Modified-Since header
function parseIfModifiedSince(ifModifiedSince: string): Date | null {
    const parsedDate = new Date(ifModifiedSince);
    return isNaN(parsedDate.getTime()) ? null : parsedDate;
}

// Main function to send a file
async function sendFile(filePath: string, options: Partial<JaiStaticOptions>, res: ServerResponse, req: IncomingMessage | Request = { headers: {}, method: "GET" }, cb?: (error?: Error) => void, showError: boolean=false ): Promise<boolean> {
    try {
        filePath = path.resolve(filePath);
        if(!req?.headers) req.headers = {};
        if(!req?.method) req.method = "GET";
        const mergedOptions: JaiStaticOptions = { ...defaultOptions, ...options, dir: options.dir || defaultOptions.dir };
        mergedOptions.headers = {
            ...defaultOptions.headers,
            ...options.headers,
            'Cache-Control': `private, max-age=${mergedOptions.maxAge || maxAge}`
        };

        // Try to access the file, if not found, try with extensions
        try {
            await fsPromises.access(filePath);
        } catch (e) {
            const accessibleFile = await tryAccessWithExtensions(filePath, mergedOptions.extensions || []);
            if (!accessibleFile) return false;
            filePath = accessibleFile;
        }

        // Handle dot files based on options
        if (['deny', 'ignore'].includes(mergedOptions.dotfiles || '') && path.basename(filePath).startsWith('.')) {
            if (mergedOptions.dotfiles === 'deny') {
                const error = new Error('Dot files are not allowed') as Error & { code: string };
                error.code = 'EACCESS';
                if (cb) cb(error);
                return showError ? error403(res, error) : false;
            }
            const error = new Error('Not Found');
            if (cb) cb(error);
            return showError ? error404(res, error) : false;
        }

        const fileStat = await stat(filePath);

        // If it's a directory, try to find an index file
        if (fileStat.isDirectory()) {
            if (!mergedOptions.index) {
                const error = new Error('No File Found for the path: ' + filePath);
                if (cb) cb(error);
                return showError ? sendErrorResponse(error, res, cb) : false;
            }

            const indexPath = await tryIndexes(mergedOptions, filePath);
            if (!indexPath) {
                const error = new Error('No File Found for the path: ' + filePath);
                if (cb) cb(error);
                return showError ? sendErrorResponse(error, res, cb) : false;
            }
            return sendFile(indexPath, mergedOptions, res, req, cb, showError);
        }

        // Check if the file extension is allowed
        const extname = String(path.extname(filePath)).toLowerCase();
        if (mergedOptions.allowedExtensions && mergedOptions.allowedExtensions.length > 0 &&
            !mergedOptions.allowedExtensions.includes(extname.slice(1)) &&
            !mergedOptions.allowedExtensions.includes('*')) {
            const error = new Error('File Extension not supported');
            if (cb) cb(error);
            return showError ? sendErrorResponse(error, res, cb) : false;
        }

        // Get the MIME type for the file
        const contentType = mimeWithExtension(extname.slice(1));

        // Handle conditional GET requests
        const ifModifiedSince = req.headers['if-modified-since'];
        if (ifModifiedSince && req.method === 'GET') {
            const ifModifiedSinceDate = parseIfModifiedSince(ifModifiedSince);
            if (ifModifiedSinceDate && ifModifiedSinceDate >= fileStat.mtime) {
                res.statusCode = 304;
                res.end();
                if (cb) cb();
                return true;
            }
        }

        // Set up headers
        const headersToShow = mergedOptions.headers || {};
        const existingHeaders = mergedOptions.existingHeaders || {};

        // Handle range requests
        const rangeHeader = req.headers.range;
        let start = 0;
        let end = fileStat.size - 1;

        if (rangeHeader && mergedOptions.acceptRanges) {
            const range = parseRange(rangeHeader, fileStat.size);
            if (range) {
                ({ start, end } = range);
                res.statusCode = 206; // Partial Content
                res.setHeader('Content-Range', `bytes ${start}-${end}/${fileStat.size}`);
            } else {
                return sendErrorResponse(new Error('Invalid range'), res, cb);
            }
        } else {
            res.statusCode = 200;
        }

        // Set headers
        if (!existingHeaders['accept-ranges'] && mergedOptions.acceptRanges) res.setHeader('Accept-Ranges', 'bytes');
        if (!existingHeaders['cache-control']) res.setHeader('Cache-Control', headersToShow['Cache-Control'] || '');
        if (!existingHeaders['pragma'] && headersToShow['Pragma']) res.setHeader('Pragma', headersToShow['Pragma']);
        if (!existingHeaders['expires'] && headersToShow['Expires']) res.setHeader('Expires', headersToShow['Expires']);

        // Set custom headers
        Object.entries(headersToShow).forEach(([key, value]) => {
            res.setHeader(key, value);
        });

        // Set additional headers based on options
        if (mergedOptions.lastModified) res.setHeader('Last-Modified', fileStat.mtime.toUTCString());
        if (mergedOptions.etag) res.setHeader('ETag', `${fileStat.size}-${fileStat.mtime.getTime()}`);

        // Set content length and type
        res.setHeader('Content-Length', end - start + 1);
        res.setHeader('Content-Type', contentType);

        // For HEAD requests, we stop here and send only the headers
        if (req.method === 'HEAD') {
            res.end();
            if (cb) await cb();
            return true;
        }

        // Create a read stream for the file with the appropriate range
        const readStream = fs.createReadStream(filePath, { start, end });

        // Handle stream errors
        readStream.on('error', (error) => {
            sendErrorResponse(error, res, cb);
        });

        // Pipe the read stream to the response
        readStream.pipe(res);

        // Handle response errors
        res.on('error', (error) => {
            sendErrorResponse(error, res, cb);
        });


        // Wait for the stream to finish
        await new Promise((resolve, reject) => readStream.on('close', resolve).on('end', resolve).on('error', reject));
        if (cb) await cb();
        return true;
    } catch (error) {
        console.error(error);
        if(cb) cb(error);
        return showError?sendErrorResponse(error as Error, res, cb):false;
    }
}

// Function to send error responses
async function sendErrorResponse(error: Error & { code?: string }, res: ServerResponse, cb?: (error: Error) => void): Promise<boolean> {
    if (cb) cb(error);
    if (error.code === 'ENOENT') return error404(res, error);
    if (error.code === 'EACCESS') return error403(res, error);
    return error500(res, error);
}

// Main function to create static file serving middleware
async function createStatic(options: JaiStaticOptions, req: IncomingMessage, res: ServerResponse, next: NextFunction): Promise<void> {
    const mergedOptions = { ...defaultOptions, ...options };
    const sDir = mergedOptions.root ? path.resolve(mergedOptions.root, mergedOptions.dir) : path.resolve(mergedOptions.dir);
    const staticDir = path.resolve(sDir);
    const sBasePath = mergedOptions.basePath || mergedOptions.urlPath || '/public';
    const staticBasePath = sBasePath[0] === '/' ? sBasePath : `/${sBasePath}`;

    const regx = new RegExp(`^(${staticBasePath})/{0,1}`, 'i');

    let isValidStaticPath = false;
    const filePath = (new URL(req.url || '', 'http://JaiJs.org')).pathname.replace(regx, () => {
        isValidStaticPath = true;
        return staticDir + "/";
    });

    if (!isValidStaticPath) {
        return next();
    }

    // Handle dot files
    if (['deny', 'ignore'].includes(mergedOptions.dotfiles || '') && path.basename(filePath).startsWith('.')) {
        if (mergedOptions.dotfiles === 'deny') {
            const error = new Error('Dot files are not allowed') as Error & { code: string };
            error.code = 'EACCESS';
            error403(res, error);
            return;
        }
        return next();
    }
    mergedOptions.existingHeaders = (req.headers as Record<string, string>);
    const sent = await sendFile(filePath, mergedOptions, res, req, undefined, false);
    if (sent) return;
    return next();
}

/**
 * Middleware for serving static files
 * @param {Partial<JaiStaticOptions>} options - Configuration options
 * @returns {Function} Express middleware function
 */
function JaiStaticMiddleware(options: Partial<JaiStaticOptions> = { dir: '' }): (req: IncomingMessage, res: ServerResponse, next: NextFunction) => Promise<void> {
    return async (req: IncomingMessage, res: ServerResponse, next: NextFunction): Promise<void> => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next();
        await createStatic({ ...defaultOptions, ...options } as JaiStaticOptions, req, res, next);
    };
}

module.exports = JaiStaticMiddleware;
module.exports.sendFile = sendFile;