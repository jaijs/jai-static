const JaiStaticMiddleware = require('../dist/index');
const path = require('path');

// Mock the entire fs module
jest.mock('fs', () => ({
  promises: {
    access: jest.fn(),
    stat: jest.fn(),
  },
  createReadStream: jest.fn(),
}));

// Import the mocked fs module
const fs = require('fs');

describe('JaiStaticMiddleware', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
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
      statusCode: 200,
    };
    mockNext = jest.fn();

    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  test('should serve static file successfully', async () => {
    const middleware = JaiStaticMiddleware({ dir: './public' });

    fs.promises.access.mockResolvedValue(undefined);
    fs.promises.stat.mockResolvedValue({
      isDirectory: () => false,
      size: 1024,
      mtime: new Date(),
    });

    const mockReadStream = {
      pipe: jest.fn(),
      on: jest.fn().mockImplementation((event, callback) => {
        if (event === 'end') {
          callback();
        }
        return mockReadStream;
      }),
    };
    fs.createReadStream.mockReturnValue(mockReadStream);

    await middleware(mockReq, mockRes, mockNext);

    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/plain');
    expect(mockRes.statusCode).toBe(200);
    expect(mockReadStream.pipe).toHaveBeenCalledWith(mockRes);
  });

  test('should return 404 for non-existent file', async () => {
    const middleware = JaiStaticMiddleware({ dir: './public' });

    const error = new Error('ENOENT');
    error.code = 'ENOENT';
    fs.promises.access.mockRejectedValue(error);
    mockNext.mockImplementation(() => {
      mockRes.statusCode = 404;
      mockRes.end('Not Found');
    });
    await middleware(mockReq, mockRes, mockNext);

    expect(mockRes.statusCode).toBe(404);
    expect(mockRes.end).toHaveBeenCalledWith(expect.stringContaining('Not Found'));
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

    fs.promises.access.mockImplementation((path) => {
      if (path.endsWith('index.html')) {
        return Promise.resolve();
      }
      return Promise.reject(new Error('ENOENT'));
    });
    fs.promises.stat.mockResolvedValue({
      isDirectory: () => false,
      size: 1024,
      mtime: new Date(),
    });

    const mockReadStream = {
      pipe: jest.fn(),
      on: jest.fn().mockImplementation((event, callback) => {
        if (event === 'end') {
          callback();
        }
        return mockReadStream;
      }),
    };
    fs.createReadStream.mockReturnValue(mockReadStream);

    await middleware(mockReq, mockRes, mockNext);

    expect(mockRes.statusCode).toBe(200);
  });

  test('should set correct headers', async () => {
    const middleware = JaiStaticMiddleware({
      dir: './public',
      headers: { 'X-Custom-Header': 'CustomValue' },
    });

    fs.promises.access.mockResolvedValue(undefined);
    fs.promises.stat.mockResolvedValue({
      isDirectory: () => false,
      size: 1024,
      mtime: new Date(),
    });

    const mockReadStream = {
      pipe: jest.fn(),
      on: jest.fn().mockImplementation((event, callback) => {
        if (event === 'end') {
          callback();
        }
        return mockReadStream;
      }),
    };
    fs.createReadStream.mockReturnValue(mockReadStream);

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
    const middleware = JaiStaticMiddleware({ dir: './public' });

    fs.promises.access.mockResolvedValue(undefined);
    fs.promises.stat.mockResolvedValue({
      isDirectory: () => false,
      size: 1024,
      mtime: new Date(),
    });

    const mockReadStream = {
      pipe: jest.fn(),
      on: jest.fn().mockImplementation((event, callback) => {
        if (event === 'error') {
          callback(new Error('Read error'));
        }
        return mockReadStream;
      }),
    };
    fs.createReadStream.mockReturnValue(mockReadStream);

    await middleware(mockReq, mockRes, mockNext);

    expect(mockRes.statusCode).toBe(500);
    expect(mockRes.end).toHaveBeenCalledWith(expect.stringContaining('Internal Server Error'));
  });

  // New test cases

  test('should handle HEAD requests correctly', async () => {
    const middleware = JaiStaticMiddleware({ dir: './public' });
    mockReq.method = 'HEAD';

    fs.promises.access.mockResolvedValue(undefined);
    fs.promises.stat.mockResolvedValue({
      isDirectory: () => false,
      size: 1024,
      mtime: new Date(),
    });

    await middleware(mockReq, mockRes, mockNext);

    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/plain');
    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Length', 1024);
    //expect(mockRes.end).toHaveBeenCalledWith();
    expect(fs.createReadStream).not.toHaveBeenCalled();
  });

  test('should handle conditional GET requests with If-Modified-Since header', async () => {
    const middleware = JaiStaticMiddleware({ dir: './public' });
    const lastModified = new Date();
    lastModified.setSeconds(lastModified.getSeconds() - 1); // Set to 1 second ago
    mockReq.headers = { 'if-modified-since': lastModified.toUTCString() };

    fs.promises.access.mockResolvedValue(undefined);
    fs.promises.stat.mockResolvedValue({
      isDirectory: () => false,
      size: 1024,
      mtime: new Date(), // Current time, which is after If-Modified-Since
    });

    const mockReadStream = {
      pipe: jest.fn(),
      on: jest.fn().mockImplementation((event, callback) => {
        if (event === 'end' || event === 'close') {
          callback();
        }
        return mockReadStream;
      }),
    };
    fs.createReadStream.mockReturnValue(mockReadStream);

    await middleware(mockReq, mockRes, mockNext);

    expect(mockRes.statusCode).toBe(200); // Should serve the file
    expect(fs.createReadStream).toHaveBeenCalled();
  });

  test('should return 304 Not Modified for conditional GET requests', async () => {
    const middleware = JaiStaticMiddleware({ dir: './public' });
    const lastModified = new Date();
    lastModified.setSeconds(lastModified.getSeconds() + 1); // Set to 1 second in the future
    mockReq.headers = { 'if-modified-since': lastModified.toUTCString() };

    fs.promises.access.mockResolvedValue(undefined);
    fs.promises.stat.mockResolvedValue({
      isDirectory: () => false,
      size: 1024,
      mtime: new Date(), // Current time, which is before If-Modified-Since
    });

    await middleware(mockReq, mockRes, mockNext);

    expect(mockRes.statusCode).toBe(304);
    expect(mockRes.end).toHaveBeenCalled();
  });

  test('should handle range requests correctly', async () => {
    const middleware = JaiStaticMiddleware({ dir: './public' });
    mockReq.headers = { range: 'bytes=0-499' };

    fs.promises.access.mockResolvedValue(undefined);
    fs.promises.stat.mockResolvedValue({
      isDirectory: () => false,
      size: 1000,
      mtime: new Date(),
    });

    const mockReadStream = {
      pipe: jest.fn(),
      on: jest.fn().mockImplementation((event, callback) => {
        if (event === 'end') {
          callback();
        }
        return mockReadStream;
      }),
    };
    fs.createReadStream.mockReturnValue(mockReadStream);

    await middleware(mockReq, mockRes, mockNext);

    expect(mockRes.statusCode).toBe(206);
    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Range', 'bytes 0-499/1000');
    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Length', 500);
    expect(fs.createReadStream).toHaveBeenCalledWith(expect.anything(), { start: 0, end: 499 });
  });


// ... (previous code remains the same)

test('should handle multiple index files', async () => {
  const dir= path.resolve(__dirname,"../dist",'public');
  const lastFile = 'default.html';
  const finalPath = path.join(dir, lastFile);
  const middleware = JaiStaticMiddleware({ 
    dir: dir, 
    index: ['index.html', 'index.htm',lastFile],
    extensions: ['html2'],
    basePath: '/public',
    acceptRanges: false,
  });
  mockReq.url = '/public/';



  let accessCallCount = 0;
  fs.promises.access.mockImplementation((p) => {
    accessCallCount++;


    if(p==dir){

      return Promise.resolve();
    }
    if (accessCallCount <= 3) {
      return Promise.reject(new Error('ENOENT'));
    }
    return Promise.resolve();
  });

  fs.promises.stat.mockImplementation((p) => {
    if(p==dir){
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
  })
  const mockReadStream = {
    pipe: jest.fn(),
    on: jest.fn().mockImplementation((event, callback) => {
      if (event === 'close' || event === 'end') {
        callback();
      }
      return mockReadStream;
    }),
  };
  fs.createReadStream.mockReturnValue(mockReadStream);

  await middleware(mockReq, mockRes, mockNext);

  expect(mockRes.statusCode).toBe(200);
  expect(fs.promises.access).toHaveBeenCalledWith(expect.stringContaining('/public')); // Check NORMAL PATH or if the directory is accessed
  expect(fs.promises.access).toHaveBeenCalledWith(expect.stringContaining('/public/index.htm'));
  expect(fs.promises.access).toHaveBeenCalledWith(expect.stringContaining('/public/default.html'));
  expect(fs.createReadStream).toHaveBeenCalledWith(finalPath,{"end": 1054, "start": 0});
});

// ... (rest of the code remains the same)



test('should respect maxAge option', async () => {
  const maxAge = 3600; // 1 hour
  const middleware = JaiStaticMiddleware({ dir: './public', maxAge });

  fs.promises.access.mockResolvedValue(undefined);
  fs.promises.stat.mockResolvedValue({
    isDirectory: () => false,
    size: 1024,
    mtime: new Date(),
  });

  const mockReadStream = {
    pipe: jest.fn(),
    on: jest.fn().mockImplementation((event, callback) => {
      if (event === 'end') {
        callback();
      }
      return mockReadStream;
    }),
  };
  fs.createReadStream.mockReturnValue(mockReadStream);

  await middleware(mockReq, mockRes, mockNext);

  expect(mockRes.setHeader).toHaveBeenCalledWith('Cache-Control', `private, max-age=${maxAge}`);
  expect(mockRes.setHeader).toHaveBeenCalledWith('Last-Modified', expect.any(String));
});

});

describe('sendFile function', () => {
  test('should send file successfully', async () => {
    const mockReq = {
      method: 'GET',
      url: '/public/test.txt',
      headers: {},
    }
    const mockRes = {
      setHeader: jest.fn(),
      getHeaders: jest.fn().mockReturnValue({}),
      writeHead: jest.fn(),
      end: jest.fn(),
      on: jest.fn(),
      statusCode: 200,
    };

    fs.promises.access.mockResolvedValue(undefined);
    fs.promises.stat.mockResolvedValue({
      isDirectory: () => false,
      size: 1024,
      mtime: new Date(),
    });

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

    const result = await JaiStaticMiddleware.sendFile('test.txt', {}, mockRes, mockReq);

    expect(result).toBe(true);
    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/plain');
    expect(mockRes.statusCode).toBe(200);
    expect(mockReadStream.pipe).toHaveBeenCalledWith(mockRes);
  });

  test('should send file successfully Without Request', async () => {
    const mockReq = {
      method: 'GET',
      url: '/public/test.txt',
      headers: {},
    }
    const mockRes = {
      setHeader: jest.fn(),
      getHeaders: jest.fn().mockReturnValue({}),
      writeHead: jest.fn(),
      end: jest.fn(),
      on: jest.fn(),
      statusCode: 200,
    };

    fs.promises.access.mockResolvedValue(undefined);
    fs.promises.stat.mockResolvedValue({
      isDirectory: () => false,
      size: 1024,
      mtime: new Date(),
    });

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

    const result = await JaiStaticMiddleware.sendFile('test.txt', {}, mockRes);

    expect(result).toBe(true);
    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/plain');
    expect(mockRes.statusCode).toBe(200);
    expect(mockReadStream.pipe).toHaveBeenCalledWith(mockRes);
  });

  test('should send file successfully Without Request', async () => {
    const mockReq = {
      method: 'GET',
      url: '/public/test.txt',
      headers: {},
    }
    const mockRes = {
      setHeader: jest.fn(),
      getHeaders: jest.fn().mockReturnValue({}),
      writeHead: jest.fn(),
      end: jest.fn(),
      on: jest.fn(),
      statusCode: 200,
    };

    fs.promises.access.mockResolvedValue(undefined);
    fs.promises.stat.mockResolvedValue({
      isDirectory: () => false,
      size: 1024,
      mtime: new Date(),
    });

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
    const cb = jest.fn();
    const result = await JaiStaticMiddleware.sendFile('test.txt', {}, mockRes, {}, cb, true);

    expect(result).toBe(true);
    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/plain');
    expect(mockRes.statusCode).toBe(200);
    expect(mockReadStream.pipe).toHaveBeenCalledWith(mockRes);
    expect(cb).toHaveBeenCalledWith();
  });

  test('should Call CB on Fail and throw Error response', async () => {
    const mockReq = {
      method: 'GET',
      url: '/public/test.txt',
      headers: {},
    }
    const mockRes = {
      setHeader: jest.fn(),
      getHeaders: jest.fn().mockReturnValue({}),
      writeHead: jest.fn(),
      end: jest.fn(),
      on: jest.fn(),
      statusCode: 200,
    };

    fs.promises.access.mockResolvedValue(undefined);
    
    const error = new Error('ENOENT');
    fs.promises.stat.mockImplementation(() => {
      return Promise.reject(error);
    })


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
    const cb = jest.fn();
    const result = await JaiStaticMiddleware.sendFile('test.txt', {}, mockRes, {}, cb, true);

    expect(result).toBe(false);
    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', "application/json");
    expect(mockRes.statusCode).toBe(500);
    expect(cb).toHaveBeenCalledWith(error);
  });
  
  test('should Call CB on Fail But NO Errors Throw ', async () => {
    const mockReq = {
      method: 'GET',
      url: '/public/test.txt',
      headers: {},
    }
    const mockRes = {
      setHeader: jest.fn(),
      getHeaders: jest.fn().mockReturnValue({}),
      writeHead: jest.fn(),
      end: jest.fn(),
      on: jest.fn(),
      statusCode: 'old',
    };

    fs.promises.access.mockResolvedValue(undefined);
    
    const error = new Error('ENOENT');
    fs.promises.stat.mockImplementation(() => {
      return Promise.reject(error);
    })


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
    const cb = jest.fn();
    const result = await JaiStaticMiddleware.sendFile('test.txt', {}, mockRes, {}, cb, false);

    expect(result).toBe(false);
    expect(mockRes.statusCode).toBe('old');
    expect(cb).toHaveBeenCalledWith(error);
  });

});