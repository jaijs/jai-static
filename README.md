# Jai Static

A powerful and flexible Node.js module for serving static files with ease. Jai Static offers seamless integration with any Node.js framework and provides fine-grained control over how your static assets are served.

---

[![Twitter Follow](https://img.shields.io/twitter/follow/Harpalsingh_11?label=Follow)](https://twitter.com/intent/follow?screen_name=Harpalsingh_11)
[![Linkedin: Harpal Singh](https://img.shields.io/badge/-harpalsingh11-blue?style=flat-square&logo=Linkedin&logoColor=white&link=https://www.linkedin.com/in/harpalsingh11)](https://www.linkedin.com/in/harpalsingh11/)
[![GitHub followers](https://img.shields.io/github/followers/hsk11?label=Follow&style=social)](https://github.com/hsk11)
[![npm version](https://badge.fury.io/js/jai-static.svg)](https://www.npmjs.com/package/jai-static)

---

![Jai Logo](public/Jai_js.jpg)

## Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Usage Examples](#usage-examples)
  - [Jai Server](#jai-server)
  - [Express](#express)
  - [HTTP](#http)
- [Configuration Options](#configuration-options)
- [Advanced Usage](#advanced-usage)
- [Performance Optimization](#performance-optimization)
- [Security Considerations](#security-considerations)
- [Troubleshooting](#troubleshooting)
- [License](#license)
- [Author](#author)

## Features

- 🚀 Lightning-fast static file serving
- 🔧 Seamless integration with any Node.js framework
- ⚙️ Highly configurable for precise control
- 🗂️ Support for serving from multiple directories
- 🔒 Secure by default with customizable security options
- 📦 Efficient caching mechanisms
- 🎯 Content negotiation and partial content support
- 🔍 Extensible file discovery system

## Quick Start

1. Install Jai Static:
   ```bash
   npm install jai-static
   ```

2. Create a simple server (e.g., `server.js`):
   ```javascript
   const http = require('http');
   const JaiStatic = require('jai-static');

   const server = http.createServer(JaiStatic({ dir: './public' }));

   server.listen(3000, () => {
     console.log('Server running at http://localhost:3000/');
   });
   ```

3. Create a `public` folder in your project root and add some files.

4. Run your server:
   ```bash
   node server.js
   ```

5. Visit `http://localhost:3000` in your browser to see your static files served!

## Installation

Install Jai Static with npm:

```bash
npm install jai-static
```

## Usage Examples

### Jai Server

```javascript
const jaiServer = require('jai-server');

const app = jaiServer({
  static: {
    dir: `${__dirname}/public`,
    basePath: '/static'
  }
});

app.listen(3000, () => {
  console.log('Jai Server listening on http://localhost:3000/ ...');
});
```

### Express

```javascript
const express = require('express');
const JaiStatic = require('jai-static');

const app = express();

app.use('/assets', JaiStatic({
  dir: `${__dirname}/public`,
  maxAge: 3600,
  index: ['index.html', 'index.htm'],
  extensions: ['html', 'htm', 'json'],
  lastModified: true
}));

app.listen(3000, () => {
  console.log('Express server listening on http://localhost:3000/ ...');
});
```

### HTTP

```javascript
const http = require('http');
const JaiStatic = require('jai-static');

const server = http.createServer(JaiStatic({
  dir: `${__dirname}/public`,
  maxAge: 3600,
  headers: {
    'X-Powered-By': 'Jai Static'
  },
  acceptRanges: true,
  cacheControl: true
}));

server.listen(3000, () => {
  console.log('HTTP server listening on http://localhost:3000/ ...');
});
```

## Configuration Options

Jai Static offers a wide range of configuration options to fine-tune its behavior:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `dir` | `string` | - | Destination folder path (Required) |
| `root` | `string` | `__dirname` | Root directory for serving files |
| `basePath` | `string` | `/` | Base URL path for serving files |
| `urlPath` | `string` | `/` | Alias for `basePath` |
| `dotfiles` | `string` | `'deny'` | How to treat dotfiles: 'allow', 'deny', or 'ignore' |
| `maxAge` | `number` | `3600` | Browser cache max-age in seconds |
| `headers` | `object` | `{}` | Custom headers to set on the response |
| `lastModified` | `boolean` | `true` | Set the Last-Modified header |
| `etag` | `boolean` | `true` | Enable or disable ETag generation |
| `acceptRanges` | `boolean` | `true` | Enable or disable accepting byte ranges |
| `cacheControl` | `boolean` | `true` | Enable or disable setting Cache-Control header |
| `index` | `string` \| `string[]` | `'index.html'` | Default file name(s) for directory requests |
| `extensions` | `string[]` | `['html', 'htm']` | File extensions to try when not specified |
| `allowedExtensions` | `string[]` | `['*']` | Allowed file extensions. Use `['*']` to allow all |
| `fallthrough` | `boolean` | `true` | Pass to next middleware if file not found |
| `immutable` | `boolean` | `false` | Add immutable directive to Cache-Control header |
| `defaultMimeType` | `string` | `'application/octet-stream'` | Default MIME type for files with unknown extensions |
| `mimeTypes` | `object` | `{}` | Custom MIME type mappings {"abc":"aplication/abc"} |

## Advanced Usage

### Serving from Multiple Directories

You can serve files from multiple directories by chaining middleware:

```javascript
const express = require('express');
const JaiStatic = require('jai-static');

const app = express();

app.use('/assets', JaiStatic({ dir: './public/assets' }));
app.use('/images', JaiStatic({ dir: './public/images', maxAge: 86400 }));
app.use('/docs', JaiStatic({ dir: './public/documents', dotfiles: 'allow' }));

app.listen(3000);
```

### Custom Error Handling

Implement custom error handling by setting `fallthrough` to `false` and using a custom error handler:

```javascript
const express = require('express');
const JaiStatic = require('jai-static');

const app = express();

app.use(JaiStatic({ 
  dir: './public', 
  fallthrough: false 
}));

app.use((err, req, res, next) => {
  if (err.statusCode === 404) {
    res.status(404).send('Custom 404: File not found');
  } else {
    next(err);
  }
});

app.listen(3000);
```

## Performance Optimization

To optimize performance with Jai Static:

1. Enable caching by setting appropriate `maxAge` and `immutable` options.
2. Use `etag` for efficient cache validation.
3. Enable `acceptRanges` for partial content support.
4. Set `cacheControl` to `true` for better client-side caching.

Example of a performance-optimized configuration:

```javascript
JaiStatic({
  dir: './public',
  maxAge: 86400 * 30, // 30 days
  immutable: true,
  etag: true,
  acceptRanges: true,
  cacheControl: true
})
```

## Security Considerations

Jai Static provides several security features:

1. **Dotfiles**: By default, access to dotfiles is denied. You can change this with the `dotfiles` option.
2. **Allowed Extensions**: Use `allowedExtensions` to restrict which file types can be served.
3. **Directory Traversal**: Jai Static automatically prevents directory traversal attacks.

Example of a security-focused configuration:

```javascript
JaiStatic({
  dir: './public',
  dotfiles: 'deny',
  allowedExtensions: ['html', 'css', 'js', 'png', 'jpg', 'gif'],
  headers: {
    'X-Frame-Options': 'SAMEORIGIN',
    'X-XSS-Protection': '1; mode=block'
  }
})
```

## Troubleshooting

If you encounter issues:

1. Check if the `dir` path is correct and accessible.
2. Ensure `basePath` matches your URL structure.
3. Verify that file permissions allow Node.js to read the files.
4. Check for conflicting middleware in your application.

For more help, please open an issue on the GitHub repository.

## License

[MIT](https://choosealicense.com/licenses/mit/)

## Author

[@hsk11](https://github.com/hsk11)