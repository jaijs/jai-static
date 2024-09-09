const JaiStaticMiddleware = require('../dist/index.js');
const path = require('path');
const fs = require('fs');

jest.mock('fs', () => ({
  promises: {
    access: jest.fn(),
    stat: jest.fn(),
  },
  createReadStream: jest.fn(),
}));

describe('JaiStaticMiddleware', () => {
  let mockReq, mockRes, mockNext;

  const setupMocks = () => {
    mockReq = {
      method: 'GET',
      url: '/public/test.txt',
      headers: {},
    };
    mockRes = {
      setHeader: jest.fn(),
      getHeaders: jest.fn().mockReturnValue({}),
      writeHead: jest.fn(),
      end: jest.fn(),
      on: jest.fn(),
      statusCode: 1111,
    };
    mockNext = jest.fn();
  };

  const setupFileMocks = (isDirectory = false, size = 1024) => {
    fs.promises.access.mockResolvedValue(undefined);
    fs.promises.stat.mockResolvedValue({
      isDirectory: () => isDirectory,
      size: size,
      mtime: new Date(),
    });
  };

  const setupReadStreamMock = () => {
    const mockReadStream = {
      pipe: jest.fn(),
      on: jest.fn().mockImplementation((event, callback) => {
        if (['end', 'close'].includes(event)) {
          callback();
        }
        return mockReadStream;
      }),
    };
    fs.createReadStream.mockReturnValue(mockReadStream);
    return mockReadStream;
  };

  beforeEach(() => {
    setupMocks();
    jest.clearAllMocks();
  });



  test('should handle range request for zero-sized file', async () => {
    const middleware = JaiStaticMiddleware({ dir: './public' });
    mockReq.url = '/public/empty.txt';
    mockReq.headers = { range: 'bytes=0-' };
    setupFileMocks(false, 0);  // Set up for a zero-sized file

    await middleware(mockReq, mockRes, mockNext);

    expect(mockRes.statusCode).toBe(416);  // Range Not Satisfiable
    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Range', 'bytes */0');
    expect(mockRes.end).toHaveBeenCalled();
  });

  test('should handle GET request for zero-sized file', async () => {
    const middleware = JaiStaticMiddleware({ dir: './public' });
    mockReq.url = '/public/empty.txt';
    setupFileMocks(false, 0);  // Set up for a zero-sized file

    await middleware(mockReq, mockRes, mockNext);

    expect(mockRes.statusCode).toBe(200);
    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/plain');
    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Length', '0');
    expect(mockRes.setHeader).toHaveBeenCalledWith('Accept-Ranges', 'bytes');
    expect(mockRes.end).toHaveBeenCalled();
  });
  test('should handle zero-sized files correctly', async () => {
    const middleware = JaiStaticMiddleware({ dir: './public' });
    mockReq.url = '/public/empty.txt';
    setupFileMocks(false, 0);  // Set up for a zero-sized file
    const mockReadStream = setupReadStreamMock();

    await middleware(mockReq, mockRes, mockNext);

    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/plain');
    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Length', '0');
    expect(mockRes.statusCode).toBe(200);
    expect(mockRes.end).toHaveBeenCalled();
    expect(mockReadStream.pipe).not.toHaveBeenCalled();  // Ensure pipe is not called for zero-sized files
  });

  test('should handle custom MIME types', async () => {
    const middleware = JaiStaticMiddleware({
      dir: './public',
      mimeTypes: { 'custom': 'application/x-custom' }
    });
    mockReq.url = '/public/file.custom';
    setupFileMocks();
    setupReadStreamMock();

    await middleware(mockReq, mockRes, mockNext);

    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/x-custom');
  });

  test('should respect allowedExtensions option', async () => {
    const middleware = JaiStaticMiddleware({
      dir: './public',
      allowedExtensions: ['txt', 'html']
    });
    mockReq.url = '/public/file.jpg';
    setupFileMocks();

    await middleware(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });

  test('should handle basePath option correctly', async () => {
    const middleware = JaiStaticMiddleware({
      dir: './public',
      basePath: '/static'
    });
    mockReq.url = '/static/file.txt';
    setupFileMocks();
    setupReadStreamMock();

    await middleware(mockReq, mockRes, mockNext);

    expect(mockRes.statusCode).toBe(200);
  });

  test('should handle urlPath option correctly', async () => {
    const middleware = JaiStaticMiddleware({
      dir: './public',
      urlPath: '/assets'
    });
    mockReq.url = '/assets/file.txt';
    setupFileMocks();
    setupReadStreamMock();

    await middleware(mockReq, mockRes, mockNext);

    expect(mockRes.statusCode).toBe(200);
  });

  test('should handle etag option set to false', async () => {
    const middleware = JaiStaticMiddleware({
      dir: './public',
      etag: false
    });
    setupFileMocks();
    setupReadStreamMock();

    await middleware(mockReq, mockRes, mockNext);

    expect(mockRes.setHeader).not.toHaveBeenCalledWith('ETag', expect.any(String));
  });


  test('should handle and search for index', async () => {
    const middleware = JaiStaticMiddleware({
      dir: './public',
    });
    mockReq.url = '/public/';
    setupFileMocks(true);

    await middleware(mockReq, mockRes, mockNext);
    expect(mockRes.statusCode).toBe(200);
    expect(mockNext).not.toHaveBeenCalled();
  });
  test('should not search for index when index=false', async () => {
    const middleware = JaiStaticMiddleware({
      dir: './public',
      index: false
    });
    mockReq.url = '/public/';
    setupFileMocks(true);

    await middleware(mockReq, mockRes, mockNext);
    expect(mockRes.statusCode).toBe(1111);
    expect(mockNext).toHaveBeenCalled();
  });


  test('should set ETag header', async () => {
    const middleware = JaiStaticMiddleware({ dir: './public' });
    setupFileMocks();
    fs.promises.stat.mockResolvedValue({
      isDirectory: () => false,
      size: 1024,
      mtime: new Date(),
      ino: 123456,
    });
    setupReadStreamMock();

    await middleware(mockReq, mockRes, mockNext);

    expect(mockRes.setHeader).toHaveBeenCalledWith('ETag', expect.any(String));
  });

  test('should handle dotfiles: "allow" option', async () => {
    const middleware = JaiStaticMiddleware({ dir: './public', dotfiles: 'allow' });
    mockReq.url = '/public/.hiddenfile';
    setupFileMocks();
    setupReadStreamMock();

    await middleware(mockReq, mockRes, mockNext);

    expect(mockRes.statusCode).toBe(200);
  });

  test('should handle dotfiles: "ignore" option', async () => {
    const middleware = JaiStaticMiddleware({ dir: './public', dotfiles: 'ignore' });
    mockReq.url = '/public/.hiddenfile';

    await middleware(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });


  test('should handle fallback to default mime type', async () => {
    jest.clearAllMocks()
    const middleware = JaiStaticMiddleware({
      dir: './public',
      defaultMimeType: 'application/TEST'
    });
    mockReq.url = '/public/unknown.xyze';
    setupFileMocks();
    setupReadStreamMock();

    await middleware(mockReq, mockRes, mockNext);

    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/TEST');
  });
  test('should handle fallback to default mime type', async () => {
    jest.clearAllMocks()
    const middleware = JaiStaticMiddleware({
      dir: './public',
      defaultMimeType: 'application/octet-stream'
    });
    mockReq.url = '/public/unknown.xyze';
    setupFileMocks();
    setupReadStreamMock();

    await middleware(mockReq, mockRes, mockNext);

    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/octet-stream');
  });
  test('should handle fallback to Custom mime type', async () => {
    jest.clearAllMocks()
    const middleware = JaiStaticMiddleware({
      dir: './public',
      mimeTypes: {
        'pdfdsd': 'application/xyz'
      }
    });
    mockReq.url = '/public/unknown.pdfdsd';
    setupFileMocks();
    setupReadStreamMock();

    await middleware(mockReq, mockRes, mockNext);

    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/xyz');
  });

  test('should handle immutable option', async () => {
    const middleware = JaiStaticMiddleware({ dir: './public', immutable: true, maxAge: 31536000 });
    setupFileMocks();
    setupReadStreamMock();

    await middleware(mockReq, mockRes, mockNext);

    expect(mockRes.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=31536000, immutable');
  });

  test('should handle lastModified option set to false', async () => {
    const middleware = JaiStaticMiddleware({ dir: './public', lastModified: false });
    setupFileMocks();
    setupReadStreamMock();

    await middleware(mockReq, mockRes, mockNext);

    expect(mockRes.setHeader).not.toHaveBeenCalledWith('Last-Modified', expect.any(String));
  });

  test('should handle extensions option', async () => {
    const middleware = JaiStaticMiddleware({ dir: './public', extensions: ['txt', 'html'] });
    mockReq.url = '/public/file';
    fs.promises.access.mockRejectedValueOnce(new Error('ENOENT'))
                      .mockResolvedValueOnce(undefined);
    setupFileMocks();
    setupReadStreamMock();

    await middleware(mockReq, mockRes, mockNext);

    expect(fs.createReadStream).toHaveBeenCalledWith(expect.stringContaining('file.txt'), expect.any(Object));
  });

  test('should handle fallthrough option set to false', async () => {
    const middleware = JaiStaticMiddleware({ dir: './public', fallthrough: false });
    fs.promises.access.mockRejectedValue(new Error('ENOENT'));

    await middleware(mockReq, mockRes, mockNext);

    expect(mockRes.statusCode).toBe(404);
    expect(mockNext).not.toHaveBeenCalled();
  });


  test('should serve static file successfully', async () => {
    jest.clearAllMocks()
    const middleware = JaiStaticMiddleware({ dir: './public' });
    setupFileMocks();
    const mockReadStream = setupReadStreamMock();

    await middleware(mockReq, mockRes, mockNext);

    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/plain');
    expect(mockRes.statusCode).toBe(200);
    expect(mockReadStream.pipe).toHaveBeenCalledWith(mockRes);
  });

  test('should return 404 for non-existent file with fallthrough=false', async () => {
    const middleware = JaiStaticMiddleware({ dir: './public', fallthrough: false });
    fs.promises.access.mockRejectedValue(new Error('ENOENT'));
    mockNext.mockImplementation(() => {
      mockRes.statusCode = 404;
      mockRes.end('Not Found');
    });

    await middleware(mockReq, mockRes, mockNext);

    expect(mockRes.statusCode).toBe(404);
    expect(mockRes.end).toHaveBeenCalledWith(expect.stringContaining('Not Found'));
  });

  test('should return 404 for non-existent file by default, and next should be called', async () => {
    const middleware = JaiStaticMiddleware({ dir: './public' });
    fs.promises.access.mockRejectedValue(new Error('ENOENT'));
    mockNext.mockImplementation(() => {
      mockRes.statusCode = 201;
      mockRes.end('OK');
    });

    await middleware(mockReq, mockRes, mockNext);

    expect(mockRes.statusCode).toBe(201);
    expect(mockRes.end).toHaveBeenCalledWith(expect.stringContaining('OK'));
  });


  test('should handle dot files according to options', async () => {
    const middleware = JaiStaticMiddleware({ dir: './public', dotfiles: 'deny' });
    mockReq.url = '/public/.hiddenfile';

    await middleware(mockReq, mockRes, mockNext);

    expect(mockRes.statusCode).toBe(403);
    expect(mockRes.end).toHaveBeenCalledWith(expect.stringContaining('Forbidden'));
  });

  test('should try index files for directory requests', async () => {
    const middleware = JaiStaticMiddleware({ dir: './public', index: 'index.html' });
    mockReq.url = '/public/';

    fs.promises.access.mockImplementation((path) => 
      path.endsWith('index.html') ? Promise.resolve() : Promise.reject(new Error('ENOENT'))
    );
    setupFileMocks();
    setupReadStreamMock();

    await middleware(mockReq, mockRes, mockNext);

    expect(mockRes.statusCode).toBe(200);
  });

  test('should set correct headers', async () => {
    const middleware = JaiStaticMiddleware({
      dir: './public',
      headers: { 'X-Custom-Header': 'CustomValue' },
    });
    setupFileMocks();
    setupReadStreamMock();

    await middleware(mockReq, mockRes, mockNext);

    expect(mockRes.setHeader).toHaveBeenCalledWith('X-Custom-Header', 'CustomValue');
    expect(mockRes.setHeader).toHaveBeenCalledWith('Cache-Control', expect.any(String));
    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Length', 1024);
  });

  test('should call next() for non-GET and non-HEAD requests', async () => {
    const middleware = JaiStaticMiddleware({ dir: './public' });
    mockReq.method = 'POST';

    await middleware(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });

  test('should handle errors during file reading', async () => {
    const middleware = JaiStaticMiddleware({ dir: './public', fallthrough: false });
    setupFileMocks();
    const mockReadStream = {
        pipe: jest.fn(),
        on: jest.fn().mockImplementation((event, callback) => {
            if (event === 'error') {
                callback(new Error('Read error'));
            }
            return mockReadStream;
        }),
        destroy: jest.fn(),
    };
    fs.createReadStream.mockReturnValue(mockReadStream);

    await middleware(mockReq, mockRes, mockNext);

    expect(mockRes.statusCode).toBe(500);
    expect(mockRes.end).toHaveBeenCalledWith(expect.stringContaining('Internal Server Error'));
    expect(mockReadStream.destroy).toHaveBeenCalled();
});

  test('should handle HEAD requests correctly', async () => {
    const middleware = JaiStaticMiddleware({ dir: './public' });
    mockReq.method = 'HEAD';
    setupFileMocks();

    await middleware(mockReq, mockRes, mockNext);

    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/plain');
    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Length', 1024);
    expect(fs.createReadStream).not.toHaveBeenCalled();
  });

  test('should handle conditional GET requests with If-Modified-Since header', async () => {
    const middleware = JaiStaticMiddleware({ dir: './public' });
    const lastModified = new Date();
    lastModified.setSeconds(lastModified.getSeconds() - 1);
    mockReq.headers = { 'if-modified-since': lastModified.toUTCString() };
    setupFileMocks();
    setupReadStreamMock();

    await middleware(mockReq, mockRes, mockNext);

    expect(mockRes.statusCode).toBe(200);
    expect(fs.createReadStream).toHaveBeenCalled();
  });

  test('should return 304 Not Modified for conditional GET requests', async () => {
    const middleware = JaiStaticMiddleware({ dir: './public' });
    const lastModified = new Date();
    lastModified.setSeconds(lastModified.getSeconds() + 1);
    mockReq.headers = { 'if-modified-since': lastModified.toUTCString() };
    setupFileMocks();

    await middleware(mockReq, mockRes, mockNext);

    expect(mockRes.statusCode).toBe(304);
    expect(mockRes.end).toHaveBeenCalled();
  });

  test('should handle range requests correctly', async () => {
    const middleware = JaiStaticMiddleware({ dir: './public' });
    mockReq.headers = { range: 'bytes=0-499' };
    setupFileMocks(false, 1000);
    setupReadStreamMock();

    await middleware(mockReq, mockRes, mockNext);

    expect(mockRes.statusCode).toBe(206);
    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Range', 'bytes 0-499/1000');
    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Length', 500);
    expect(fs.createReadStream).toHaveBeenCalledWith(expect.anything(), { start: 0, end: 499 });
  });

  test('should handle multiple index files', async () => {
    const dir = path.resolve(__dirname, "../dist", 'public');
    const lastFile = 'default.html';
    const middleware = JaiStaticMiddleware({ 
      dir: dir, 
      index: ['index.html', 'index.htm', lastFile],
      extensions: ['html2'],
      basePath: '/public',
      acceptRanges: false,
    });
    mockReq.url = '/public/';

    let accessCallCount = 0;
    fs.promises.access.mockImplementation((p) => {
      accessCallCount++;
      if (p === dir || p === path.resolve(dir, 'default.html')) {
        return Promise.resolve();
      }
      return Promise.reject(new Error('ENOENT'));
    });

    fs.promises.stat.mockImplementation((p) => {

      if (p === dir) {
        return Promise.resolve({
          isDirectory: () => true,
          size: 1024,
          mtime: new Date(),
        });
      }
      if (p.endsWith('/default.html')) {
        return Promise.resolve({
          isDirectory: () => false,
          size: 1055,
          mtime: new Date(),
        });
      }
      return Promise.reject(new Error('ENOENT'));
    });
    setupReadStreamMock();

    await middleware(mockReq, mockRes, mockNext);

    expect(mockRes.statusCode).toBe(200);
    expect(fs.promises.access).toHaveBeenCalledWith(dir);
    expect(fs.promises.access).toHaveBeenCalledWith(path.resolve(dir, 'index.htm'));
    expect(fs.promises.access).toHaveBeenCalledWith(path.resolve(dir, 'index.html'));
    expect(fs.promises.access).toHaveBeenCalledWith(path.resolve(dir, 'default.html'));

    expect(accessCallCount).toBe(4);
    expect(fs.createReadStream).toHaveBeenCalledWith(path.resolve(dir, 'default.html'), {"end": 1054, "start": 0});
  });

  test('should respect maxAge option', async () => {
    const maxAge = 3600;
    const middleware = JaiStaticMiddleware({ dir: './public', maxAge });
    setupFileMocks();
    setupReadStreamMock();

    await middleware(mockReq, mockRes, mockNext);

    expect(mockRes.setHeader).toHaveBeenCalledWith('Cache-Control', `public, max-age=${maxAge}`);
    expect(mockRes.setHeader).toHaveBeenCalledWith('Last-Modified', expect.any(String));
  });
});

describe('sendFile function', () => {
  let mockRes;

  beforeEach(() => {
    mockRes = {
      setHeader: jest.fn(),
      getHeaders: jest.fn().mockReturnValue({}),
      writeHead: jest.fn(),
      end: jest.fn(),
      on: jest.fn(),
      statusCode: 1111,
    };
    jest.clearAllMocks();
  });

  const setupFileMocks = (fileExists = true, isDirectory = false, size = 1024) => {
    fs.promises.access.mockImplementation(() => 
      fileExists ? Promise.resolve() : Promise.reject(new Error('ENOENT'))
    );
    fs.promises.stat.mockResolvedValue({
      isDirectory: () => isDirectory,
      size: size,
      mtime: new Date(),
    });
  };

  const setupReadStreamMock = () => {
    const mockReadStream = {
      pipe: jest.fn(),
      on: jest.fn().mockImplementation((event, callback) => {
        if (event === 'close') {
          callback();
        }
        return mockReadStream;
      }),
    };
    fs.createReadStream.mockReturnValue(mockReadStream);
    return mockReadStream;
  };
  test('should handle zero-sized files', async () => {
    setupFileMocks(true, false, 0);  // Set up for a zero-sized file
    const mockReadStream = setupReadStreamMock();

    const result = await JaiStaticMiddleware.sendFile('empty.txt', {}, mockRes, {});

    expect(result).toBe(true);
    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/plain');
    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Length', '0');
    expect(mockRes.statusCode).toBe(200);
    expect(mockRes.end).toHaveBeenCalled();
    expect(mockReadStream.pipe).not.toHaveBeenCalled();  // Ensure pipe is not called for zero-sized files
  });
  test('should send file successfully', async () => {
    setupFileMocks();
    setupReadStreamMock();

    const result = await JaiStaticMiddleware.sendFile('test.txt', {}, mockRes, {});

    expect(result).toBe(true);
    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/plain');
    expect(mockRes.statusCode).toBe(200);
  });

  test('should handle file not found', async () => {
    setupFileMocks(false);
    const cb = jest.fn();

    const result = await JaiStaticMiddleware.sendFile('test.txt', {fallthrough:false}, mockRes, {}, cb);

    expect(result).toBe(false);
    expect(mockRes.statusCode).toBe(404);
    expect(cb).toHaveBeenCalledWith(expect.any(Error));
  });

  test('should handle errors without throwing when showError is false', async () => {
    setupFileMocks(false);
    const cb = jest.fn();
    mockRes.statusCode = 'old';

    const result = await JaiStaticMiddleware.sendFile('test.txt', {}, mockRes, {}, cb);

    expect(result).toBe(false);
    expect(mockRes.statusCode).toBe('old');
    expect(cb).toHaveBeenCalledWith(expect.any(Error));
  });

  test('should handle folder path without index', async () => {
    const file = path.resolve(__dirname, '../', 'jai');
    setupFileMocks(true, true);
    fs.promises.stat.mockImplementation((p) => {
      if (p === file) {
        return Promise.resolve({
          isDirectory: () => true,
          size: 1024,
          mtime: new Date(),
        });
      }
      if (p === path.resolve(file, "index.html")) {
        return Promise.resolve({
          isDirectory: () => false,
          size: 1024,
          mtime: new Date(),
        });
      }
    });
    setupReadStreamMock();
    const cb = jest.fn();

    const result = await JaiStaticMiddleware.sendFile(file, {}, mockRes, {}, cb, false);

    expect(result).toBe(true);
    expect(mockRes.statusCode).toBe(200);
    expect(cb).toHaveBeenCalledWith();
  });



  test('should handle range requests with invalid range', async () => {
    const mockReq = { headers: { range: 'bytes=invalid' } };
    const mockRes = {
      setHeader: jest.fn(),
      getHeaders: jest.fn().mockReturnValue({}),
      writeHead: jest.fn(),
      end: jest.fn(),
      on: jest.fn(),
      statusCode: 200,
    };
    setupFileMocks(true, false, 1000);
    setupReadStreamMock();

    await JaiStaticMiddleware.sendFile('test.txt', {fallthrough:false}, mockRes, mockReq);

    expect(mockRes.statusCode).toBe(416); // Range Not Satisfiable
    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Range', 'bytes */1000');
  });

  test('should handle options.acceptRanges set to false', async () => {
    const mockReq = { headers: { range: 'bytes=0-499' } };
    const mockRes = {
      setHeader: jest.fn(),
      getHeaders: jest.fn().mockReturnValue({}),
      writeHead: jest.fn(),
      end: jest.fn(),
      on: jest.fn(),
      statusCode: 200,
    };
    setupFileMocks();
    setupReadStreamMock();

    await JaiStaticMiddleware.sendFile('test.txt', { acceptRanges: false }, mockRes, mockReq);

    expect(mockRes.statusCode).toBe(200);
    expect(mockRes.setHeader).not.toHaveBeenCalledWith('Accept-Ranges', 'bytes');
  });

  test('should handle options.cacheControl set to false', async () => {
    const mockRes = {
      setHeader: jest.fn(),
      getHeaders: jest.fn().mockReturnValue({}),
      writeHead: jest.fn(),
      end: jest.fn(),
      on: jest.fn(),
      statusCode: 200,
    };
    setupFileMocks();
    setupReadStreamMock();

    await JaiStaticMiddleware.sendFile('test.txt', { cacheControl: false }, mockRes, {});

    expect(mockRes.setHeader).not.toHaveBeenCalledWith('Cache-Control', expect.any(String));
  });

  test('should handle options.dotfiles set to "deny"', async () => {
    const mockRes = {
      setHeader: jest.fn(),
      getHeaders: jest.fn().mockReturnValue({}),
      writeHead: jest.fn(),
      end: jest.fn(),
      on: jest.fn(),
      statusCode: 200,
    };
    setupFileMocks();

    const result = await JaiStaticMiddleware.sendFile('.hiddenfile', { dotfiles: 'deny' , fallthrough:false}, mockRes, {}, 0);

    expect(result).toBe(false);
    expect(mockRes.statusCode).toBe(403);
  });


  test('should handle very large files', async () => {
    const largeFileSize = Number.MAX_SAFE_INTEGER;
    setupFileMocks(true, false, largeFileSize);
    setupReadStreamMock();

    const result = await JaiStaticMiddleware.sendFile('large.file', {}, mockRes, {});

    expect(result).toBe(true);
    expect(mockRes.statusCode).toBe(200);
    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Length', largeFileSize);
  });


  test('should Throw Error if file greater than maxAllowedSize', async () => {
    const largeFileSize = Number.MAX_SAFE_INTEGER;
    setupFileMocks(true, false, largeFileSize);
    setupReadStreamMock();

    const result = await JaiStaticMiddleware.sendFile('large.file', {maxAllowedSize:99999}, mockRes, {});

    expect(result).toBe(false);
    expect(mockRes.statusCode).toBe(1111);
    expect(mockRes.setHeader).not.toHaveBeenCalledWith('Content-Length', largeFileSize);
  });


  test('should Throw Error if file greater than maxAllowedSize with fallthrough=false', async () => {
    const largeFileSize = Number.MAX_SAFE_INTEGER;
    setupFileMocks(true, false, largeFileSize);
    setupReadStreamMock();

    const result = await JaiStaticMiddleware.sendFile('large.file', {maxAllowedSize:99999, fallthrough:false}, mockRes, {});

    expect(result).toBe(false);
    expect(mockRes.statusCode).toBe(500);
    expect(mockRes.setHeader).not.toHaveBeenCalledWith('Content-Length', largeFileSize);
  });


  test('should handle files with spaces in name', async () => {
    setupFileMocks();
    setupReadStreamMock();

    const result = await JaiStaticMiddleware.sendFile('file with spaces.txt', {}, mockRes, {});

    expect(result).toBe(true);
    expect(mockRes.statusCode).toBe(200);
  });

  test('should handle options.immutable set to true', async () => {
    setupFileMocks();
    setupReadStreamMock();

    await JaiStaticMiddleware.sendFile('test.txt', { immutable: true, maxAge: 31536000 }, mockRes, {});

    expect(mockRes.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=31536000, immutable');
  });

  test('should handle request with If-Range header', async () => {
    const mockReq = {
      headers: {
        range: 'bytes=0-499',
        'if-range': '"some-etag"'
      }
    };
    setupFileMocks(true, false, 1000);
    setupReadStreamMock();

    await JaiStaticMiddleware.sendFile('testss.txt', { etag: true }, mockRes, mockReq);

    expect(mockRes.statusCode).toBe(206);
    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Range', 'bytes 0-499/1000');
  });

  
});