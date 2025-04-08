async function loadJSZip() {
    return new Promise((resolve, reject) => {
        if (typeof JSZip !== 'undefined') {           
            resolve();
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Falha ao carregar JSZip da CDN'));
        document.head.appendChild(script);
    });
}


async function Zemuframeweb(file, iframeElement) {
await loadJSZip();
    if (!(file instanceof File) || !iframeElement instanceof HTMLIFrameElement) {
        throw new Error('Parâmetros inválidos: file deve ser um File e iframeElement um HTMLIFrameElement.');
    }

    if (file.type !== 'application/zip' && !file.name.endsWith('.zip')) {
        throw new Error('Por favor, selecione um arquivo ZIP válido.');
    }

    let fileCache = {};
    let currentBasePath = ''; 

    const doc = iframeElement.contentDocument || iframeElement.contentWindow.document;
    doc.open();
    doc.write('');
    doc.close();

    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
   
    for (const [path, zipEntry] of Object.entries(zip.files)) {
        if (!zipEntry.dir) {
            fileCache[path] = await zipEntry.async('blob');
        }
    }

    if (!hasFile('index.html')) {
        throw new Error('Não foi encontrado um arquivo index.html no ZIP.');
    }

    await loadFile('index.html');

    function hasFile(path) {
        return Object.keys(fileCache).some(filePath => filePath === path || filePath.endsWith('/' + path));
    }

    async function getFile(path) {
        let resolvedPath = null;

        if (fileCache[path]) resolvedPath = path;
        else {
            const fullPath = joinPaths(currentBasePath, path);
            if (fileCache[fullPath]) resolvedPath = fullPath;
            else {
                for (const filePath in fileCache) {
                    if (filePath === path || filePath.endsWith('/' + path)) {
                        resolvedPath = filePath;
                        break;
                    }
                }
            }
        }

        if (!resolvedPath) {
            throw new Error(`Arquivo não encontrado: ${path}`);
        }

        return fileCache[resolvedPath];
    }

    function joinPaths(base, relative) {
        if (!base || relative.startsWith('/')) {
            return relative.startsWith('/') ? relative.substring(1) : relative;
        }
        const stack = base.split('/').slice(0, -1);
        const parts = relative.split('/');
        for (const part of parts) {
            if (part === '.') continue;
            if (part === '..') stack.pop();
            else stack.push(part);
        }
        return stack.join('/');
    }

    function getBasePath(path) {
        return path.split('/').slice(0, -1).join('/');
    }

    function getContentType(extension) {
        const mimeTypes = {
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'gif': 'image/gif',
            'svg': 'image/svg+xml',
            'webp': 'image/webp',
            'js': 'application/javascript',
            'html': 'text/html',
            'css': 'text/css',
            'json': 'application/json',
            'txt': 'text/plain'
        };
        return mimeTypes[extension.toLowerCase()] || 'application/octet-stream';
    }

    async function loadFile(filePath) {
        const blob = await getFile(filePath);
        currentBasePath = getBasePath(filePath);

        if (filePath.endsWith('.html')) {
            const htmlText = await blob.text();
            const parser = new DOMParser();
            const parsedDoc = parser.parseFromString(htmlText, 'text/html');
            const iframeDoc = iframeElement.contentDocument || iframeElement.contentWindow.document;
           
            const blobUrlMap = {};
            for (const path in fileCache) {
                if (path !== filePath) {
                    blobUrlMap[path] = URL.createObjectURL(fileCache[path]);
                }
            }

            parsedDoc.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
                const href = link.getAttribute('href');
                if (href && !href.startsWith('http') && !href.startsWith('data:')) {
                    const resolvedPath = resolvePath(href, filePath);
                    if (blobUrlMap[resolvedPath]) {
                        link.setAttribute('href', blobUrlMap[resolvedPath]);
                    }
                }
            });

            parsedDoc.querySelectorAll('script[src]').forEach(script => {
                const src = script.getAttribute('src');
                if (src && !src.startsWith('http') && !src.startsWith('data:')) {
                    const resolvedPath = resolvePath(src, filePath);
                    if (blobUrlMap[resolvedPath]) {
                        script.setAttribute('src', blobUrlMap[resolvedPath]);
                    }
                }
            });

            parsedDoc.querySelectorAll('img[src]').forEach(img => {
                const src = img.getAttribute('src');
                if (src && !src.startsWith('http') && !src.startsWith('data:')) {
                    const resolvedPath = resolvePath(src, filePath);
                    if (blobUrlMap[resolvedPath]) {
                        img.setAttribute('src', blobUrlMap[resolvedPath]);
                    }
                }
            });

            parsedDoc.querySelectorAll('a[href]').forEach(a => {
                const href = a.getAttribute('href');
                if (href && !href.startsWith('http') && !href.startsWith('#') && !href.startsWith('data:')) {
                    a.onclick = (e) => {
                        e.preventDefault();
                        const resolvedPath = resolvePath(href, filePath);
                        if (fileCache[resolvedPath]) {
                            loadFile(resolvedPath);
                        }
                    };
                }
            });

            iframeDoc.open();
            iframeDoc.write('<!DOCTYPE html><html>' + parsedDoc.documentElement.innerHTML + '</html>');
            iframeDoc.close();
        } else {
           
            const iframeDoc = iframeElement.contentDocument || iframeElement.contentWindow.document;
            iframeDoc.open();
            iframeDoc.write(`<pre>Conteúdo binário: ${filePath}</pre>`);
            iframeDoc.close();
        }
    }

    function resolvePath(src, baseFile) {
        const baseDir = getBasePath(baseFile);
        return joinPaths(baseDir, src);
    }

    const iframeWindow = iframeElement.contentWindow;
    
    iframeWindow.onpopstate = (event) => {
        const path = event.state ? event.state.path : 'index.html';
        loadFile(path);
    };

    const originalFetch = iframeWindow.fetch;
    iframeWindow.fetch = async (url, options) => {
        if (typeof url === 'string' && !url.startsWith('http') && !url.startsWith('data:')) {
            try {
                const resolvedPath = resolvePath(url, currentBasePath);
                const file = await getFile(resolvedPath);
                const extension = resolvedPath.split('.').pop().toLowerCase();
                const contentType = getContentType(extension);
                return new Response(file, { headers: { 'Content-Type': contentType } });
            } catch (error) {
                console.error(`Fetch falhou para ${url}: ${error.message}`);
                return new Response(null, { status: 404, statusText: 'Not Found' });
            }
        }
        return originalFetch.call(iframeWindow, url, options);
    };

    const originalXHR = iframeWindow.XMLHttpRequest;
    iframeWindow.XMLHttpRequest = function () {
        const xhr = new originalXHR();
        const originalOpen = xhr.open;
        xhr.open = function (method, url, async = true, user, password) {
            this._url = url;
            originalOpen.call(this, method, url, async, user, password);
        };

        let _responseType = '';
        Object.defineProperty(xhr, 'responseType', {
            get: () => _responseType,
            set: newValue => { _responseType = newValue; }
        });

        xhr.send = function (body) {
            const url = this._url;
            if (typeof url === 'string' && !url.startsWith('http') && !url.startsWith('data:')) {
                const resolvedPath = resolvePath(url, currentBasePath);
                getFile(resolvedPath).then(file => {
                    const extension = resolvedPath.split('.').pop().toLowerCase();
                    const contentType = getContentType(extension);
                    Object.defineProperty(this, 'status', { value: 200 });
                    Object.defineProperty(this, 'statusText', { value: 'OK' });
                    Object.defineProperty(this, 'getResponseHeader', {
                        value: (header) => header === 'Content-Type' ? contentType : null
                    });

                    if (_responseType === 'blob') {
                        Object.defineProperty(this, 'response', { value: file });
                    } else if (_responseType === 'arraybuffer') {
                        file.arrayBuffer().then(buffer => {
                            Object.defineProperty(this, 'response', { value: buffer });
                            this.dispatchEvent(new Event('load'));
                        });
                        return;
                    } else if (_responseType === 'json') {
                        file.text().then(text => {
                            try {
                                const json = JSON.parse(text);
                                Object.defineProperty(this, 'response', { value: json });
                                Object.defineProperty(this, 'responseText', { value: text });
                            } catch (e) {
                                Object.defineProperty(this, 'response', { value: null });
                                Object.defineProperty(this, 'responseText', { value: text });
                            }
                            this.dispatchEvent(new Event('load'));
                        });
                        return;
                    } else {
                        file.text().then(text => {
                            Object.defineProperty(this, 'responseText', { value: text });
                            Object.defineProperty(this, 'response', { value: text });
                            this.dispatchEvent(new Event('load'));
                        });
                        return;
                    }

                    this.dispatchEvent(new Event('load'));
                }).catch(error => {
                    console.error(`XHR falhou para ${url}: ${error.message}`);
                    Object.defineProperty(this, 'status', { value: 404 });
                    Object.defineProperty(this, 'statusText', { value: 'Not Found' });
                    this.dispatchEvent(new Event('error'));
                    this.dispatchEvent(new Event('load'));
                });
            } else {
                xhr.send(body);
            }
        };

        return xhr;
    };
    
    iframeWindow.addEventListener('click', (e) => {
        const a = e.target.closest('a');
        if (a && a.href && !a.href.startsWith('http') && !a.href.startsWith('data:')) {
            e.preventDefault();
            const href = new URL(a.href, 'http://fakebase').pathname.slice(1); 
            if (fileCache[href]) {
                iframeWindow.history.pushState({ path: href }, '', href);
                loadFile(href);
            }
        }
    });
                }
