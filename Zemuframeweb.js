async function loadJSZip() {
    if (typeof JSZip !== 'undefined') return Promise.resolve();

    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
        script.onload = resolve;
        script.onerror = () => reject(new Error('Falha ao carregar JSZip da CDN'));
        document.head.appendChild(script);
    });
}

const fileCache = {};
let currentBasePath = '';

function resolvePath(path, basePath) {
    if (!path) return '';
    if (path.startsWith('/')) return path.substring(1);

    const base = basePath ? getBasePath(basePath) : '';
    const stack = base ? base.split('/') : [];
    const parts = path.split('/');

    for (const part of parts) {
        if (part === '.') continue;
        else if (part === '..') stack.pop();
        else stack.push(part);
    }

    return stack.join('/');
}

function getBasePath(path) {
    return path.split('/').slice(0, -1).join('/');
}

function interceptFetch(doc) {
    const originalFetch = doc.defaultView.fetch;
    const originalXHROpen = doc.defaultView.XMLHttpRequest.prototype.open;
    const originalXHRSend = doc.defaultView.XMLHttpRequest.prototype.send;
   
    doc.defaultView.fetch = async (input, init) => {
        try {
            const url = typeof input === 'string' ? input : input.url;
            const resolvedPath = resolvePath(url, currentBasePath);

            if (fileCache[resolvedPath]) {
                const blob = fileCache[resolvedPath];
                const response = new Response(blob, {
                    status: 200,
                    statusText: 'OK',
                    headers: {
                        'Content-Type': getMimeType(resolvedPath),
                    },
                });
                return Promise.resolve(response);
            }

            return originalFetch(input, init);
        } catch (error) {
            console.error('Erro ao interceptar fetch:', error);
            throw error;
        }
    };

   
    doc.defaultView.XMLHttpRequest.prototype.open = function (method, url, async = true, user, password) {
        this._interceptedUrl = resolvePath(url, currentBasePath);
        this._isAsync = async;
        originalXHROpen.call(this, method, url, async, user, password);
    };

    doc.defaultView.XMLHttpRequest.prototype.send = function (body) {
        if (fileCache[this._interceptedUrl]) {
            const blob = fileCache[this._interceptedUrl];
            const mimeType = getMimeType(this._interceptedUrl);

            if (this._isAsync) {
               
                const reader = new FileReader();
                reader.onload = () => {
                    Object.defineProperty(this, 'responseText', { value: reader.result });
                    Object.defineProperty(this, 'response', { value: reader.result });
                    Object.defineProperty(this, 'status', { value: 200 });
                    Object.defineProperty(this, 'statusText', { value: 'OK' });
                    Object.defineProperty(this, 'readyState', { value: 4 });

                    if (this.onreadystatechange) {
                        this.onreadystatechange();
                    }
                };
                reader.readAsText(blob);
            } else {
               
                const syncReader = new XMLHttpRequest();
                syncReader.open('GET', URL.createObjectURL(blob), false); 
                syncReader.send();

                Object.defineProperty(this, 'responseText', { value: syncReader.responseText });
                Object.defineProperty(this, 'response', { value: syncReader.responseText });
                Object.defineProperty(this, 'status', { value: 200 });
                Object.defineProperty(this, 'statusText', { value: 'OK' });
                Object.defineProperty(this, 'readyState', { value: 4 });
            }
        } else {
            originalXHRSend.call(this, body);
        }
    };
}


function processHTMLResources(doc, basePath) {
    const blobUrlMap = Object.fromEntries(
        Object.entries(fileCache).map(([path, blob]) =>
            [path, URL.createObjectURL(blob)]
        )
    );

    const resourceAttributes = ['src', 'href', 'poster', 'data'];
    const selector = resourceAttributes
        .map(attr => `[${attr}]:not([${attr}^="http"]):not([${attr}^="data:"])`)
        .join(', ');

    doc.querySelectorAll(selector).forEach(element => {
        resourceAttributes.forEach(attr => {
            const value = element.getAttribute(attr);
            if (value) {
                const fullPath = resolvePath(value, basePath);
                if (blobUrlMap[fullPath]) {
                    element.setAttribute(attr, blobUrlMap[fullPath]);
                    console.log(`Atualizado ${element.tagName}[${attr}] para: ${blobUrlMap[fullPath]}`);
                } else {
                    console.warn(`Recurso não encontrado para ${element.tagName}[${attr}]: ${fullPath}`);
                }
            }
        });
    });

    doc.addEventListener('unload', () => {
        Object.values(blobUrlMap).forEach(url => URL.revokeObjectURL(url));
    }, { once: true });

    replaceInlineScripts(doc, blobUrlMap, basePath);
}

function replaceInlineScripts(doc, blobUrlMap, basePath) {
    const scripts = doc.querySelectorAll('script:not([src])');
    scripts.forEach(script => {
        let code = script.textContent;

        Object.entries(blobUrlMap).forEach(([path, blobUrl]) => {
            const resolvedPath = resolvePath(path, basePath);
            const regex = new RegExp(`(['"\`])${resolvedPath}\\1`, 'g');
            code = code.replace(regex, `'${blobUrl}'`);
        });

        const newScript = document.createElement('script');
        newScript.textContent = code;
        script.replaceWith(newScript);
    });
}

async function processIweTag(doc, basePath, iframeElement) {
    const iweTag = doc.querySelector('iwe[src]');
    if (!iweTag) return false; 

    const src = iweTag.getAttribute('src');
    const resolvedPath = resolvePath(src, basePath);

    if (!fileCache[resolvedPath]) {
        console.error(`Arquivo ${resolvedPath} não encontrado no fileCache`);
        return false;
    }

    const htmlBlob = fileCache[resolvedPath];
    const htmlText = await htmlBlob.text();
    
    const parser = new DOMParser();
    const newDoc = parser.parseFromString(htmlText, 'text/html');
   
    processHTMLResources(newDoc, resolvedPath);
   
    const iframeDoc = iframeElement.contentDocument || iframeElement.contentWindow.document;
    iframeDoc.open();
    iframeDoc.write(newDoc.documentElement.outerHTML);
    iframeDoc.close();

    return true;
}

async function Zemuframeweb(file, iframeElement) {
    try {
        await loadJSZip();

        Object.keys(fileCache).forEach(key => delete fileCache[key]);
        currentBasePath = '';

        const arrayBuffer = await file.arrayBuffer();

        const zip = new JSZip();
        const zipContent = await zip.loadAsync(arrayBuffer);

        for (const [relativePath, zipEntry] of Object.entries(zipContent.files)) {
            if (!zipEntry.dir) {
                fileCache[relativePath] = await zipEntry.async('blob');
            }
        }

        const indexPath = Object.keys(fileCache).find(path =>
            path.toLowerCase().endsWith('index.html')
        );

        if (!indexPath) {
            throw new Error('index.html não encontrado no arquivo ZIP');
        }

        currentBasePath = indexPath.substring(0, indexPath.lastIndexOf('/') + 1) || '';
        console.log('currentBasePath definido como:', currentBasePath);

        const indexBlob = fileCache[indexPath];
        const indexText = await indexBlob.text();

        iframeElement.src = 'about:blank';
        const doc = iframeElement.contentDocument || iframeElement.contentWindow.document;
        doc.open();
        doc.write('<html><head></head><body>Loading...</body></html>');
        doc.close();

        const parser = new DOMParser();
        const tempDoc = parser.parseFromString(indexText, 'text/html');
        
        interceptFetch(doc);
        
        const iweProcessed = await processIweTag(tempDoc, indexPath, iframeElement);

        if (!iweProcessed) {           
            processHTMLResources(tempDoc, indexPath);
            doc.open();
            doc.write(tempDoc.documentElement.outerHTML);
            doc.close();
        }

        iframeElement.addEventListener('unload', () => {
            Object.values(fileCache).forEach(blob => URL.revokeObjectURL(blob));
        }, { once: true });

        return { success: true };

    } catch (error) {
        console.error('Erro ao processar o ZIP:', error);
        iframeElement.contentDocument.write(`<h1>Erro</h1><p>${error.message}</p>`);
        return { success: false, error: error.message };
    }
}


function getMimeType(filePath) {
    const extension = filePath.split('.').pop().toLowerCase();
    const mimeTypes = {
        'html': 'text/html',
        'js': 'application/javascript',
        'css': 'text/css',
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'gif': 'image/gif',
        'svg': 'image/svg+xml',
        'ico': 'image/x-icon',
        'json': 'application/json',
        'glb': 'model/gltf-binary',
        'gltf': 'model/gltf+json',
    };
    return mimeTypes[extension] || 'application/octet-stream';
                                             }
