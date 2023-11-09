importScripts('dexie.min.js');
const version = "v.1.0.2";
const STATIC_CACHE_VERSION = 'Ho-118-static' + version;
const DYNAMIC_CACHE_VERSION = 'Ho-118-dynamic' + version;
const STATIC_ASSETS = [
    '/'
    //'/Home/ControlRoom'
];

function preCache() {

    return caches.open(STATIC_CACHE_VERSION)
        .then((cache) => {
           // console.log('[SW] preached ready');
            return cache.addAll(STATIC_ASSETS);
        })
        .catch(e => {
            console.error('[SW] cache ready install error');
        })
}

self.addEventListener('message', (event) => {
    if (event.data === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

self.addEventListener('install', (event) => {
    // console.log('[SW] Installing Service Worker ...', event);
    //console.log('[SW] Installing Service Worker ...');
    // accept promise
    event.waitUntil(preCache());

    //self.skipWaiting();
});

function cleanUp() {
    return caches.keys()
        .then((keys) => {
            // console.log(keys)
            return Promise.all(keys.map((key) => {
                if (key !== STATIC_CACHE_VERSION && key !== DYNAMIC_CACHE_VERSION) {
                    // console.log('[SW] Removeing Old Caches ....', key);
                    return caches.delete(key);
                }
            }));
        });
}

async function IsExistCache(cachName) {
    const cacheKeys = await caches.keys();
    let cachHas = await Promise.all(cacheKeys
        .filter(key => key === cachName));
    if (cachHas.length > 0) {
        return true;
    }
    return false;
}

self.addEventListener('activate', (event) => {
    //console.log('[SW] Activating Service Worker ....', event);
    event.waitUntil(cleanUp());
    return self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    //console.log('[SW] Fetch ....');
    const request = event.request;
    //console.log("request.method", request.method);

    if (request.method === "GET") {
        //console.log("request.method", request.method);
        event.respondWith(
            caches.match(request)
                .then((response) => {

                    //console.log("ressssss request", request.headers.get("Content-Type"));
                    return response || fetch(request).then((res) => {
                        //console.log("ressssss",res);
                        caches.open(DYNAMIC_CACHE_VERSION)
                            .then((cache) => {
                                if (request.url.match(/\.(jpe?g|png|gif|svg|css|woff|woff2|ttf|font|css.*|js|js.*|)$/)) {
                                console.log("request.url", request.url);
                                    cache.put(request, res);
                                }

                            });
                        return res.clone();

                    }).catch((err) => {

                        // console.error('[SW] cache in fetch error');
                        return caches.open(STATIC_CACHE_VERSION)
                            .then(function (cache) {
                                if (request.headers.get('accept').includes('text/html')) {
                                    return cache.match('/offline.html');
                                }
                                
                            });

                    });



                })
                .catch(console.error)
        );
    }



    if (request.method === "POST") {
    //if (false) {
       // console.log("request.method", request.method);
        // Init the cache. We use Dexie here to simplify the code. You can use any other
        // way to access IndexedDB of course.
        var db = new Dexie("ksc-118_post_cache");
        db.version(1).stores({
            post_cache: 'key,response,timestamp'
        })

        event.respondWith(
            // First try to fetch the request from the server
            fetch(request.clone())
                .then(function (response) {
                    // If it works, put the response into IndexedDB                   
                   // console.log("post-response", response);
                    cachePut(request.clone(), response.clone(), db.post_cache);
                    return response;
                })
                .catch(function () {
                    // If it does not work, return the cached response. If the cache does not
                    // contain a response for our request, it will give us a 503-response
                   // console.log("error");
                    return cacheMatch(request.clone(), db.post_cache);
                })
        );

        //if (request.headers.get("Content-Type").includes('application/json')) {
        //    console.log("headers ho", request.headers.get("Content-Type"));
        //    console.log(res);
        //    //cache.put(request, res);  
        //}
    }

});



/**
 * Serializes a Request into a plain JS object.
 * 
 * @param request
 * @returns Promise
 */
function serializeRequest(request) {
    //debugger;
    var serialized = {
        url: request.url,
        headers: serializeHeaders(request.headers),
        method: request.method,
        mode: request.mode,
        credentials: request.credentials,
        cache: request.cache,
        redirect: request.redirect,
        referrer: request.referrer,
    };

    // Only if method is not `GET` or `HEAD` is the request allowed to have body.
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        //var b1 = request.clone().text();
        return request.clone().text().then(function (body) {
           // console.log("body", body);
            serialized.body = body;
         //   console.log("serialized", serialized);
            return Promise.resolve(serialized);
        });
    }
    return Promise.resolve(serialized);
}

/**
 * Serializes a Response into a plain JS object
 * 
 * @param response
 * @returns Promise
 */
function serializeResponse(response) {
    var serialized = {
        headers: serializeHeaders(response.headers),
        status: response.status,
        statusText: response.statusText
    };

    return response.clone().text().then(function (body) {
        serialized.body = body;
        return Promise.resolve(serialized);
    });
}

/**
 * Serializes headers into a plain JS object
 * 
 * @param headers
 * @returns object
 */
function serializeHeaders(headers) {
    //debugger;
    var serialized = {};
    // `for(... of ...)` is ES6 notation but current browsers supporting SW, support this
    // notation as well and this is the only way of retrieving all the headers.
    for (var entry of headers.entries()) {
        serialized[entry[0]] = entry[1];
    }
    return serialized;
}

/**
 * Creates a Response from it's serialized version
 * 
 * @param data
 * @returns Promise
 */
function deserializeResponse(data) {
    return Promise.resolve(new Response(data.body, data));
}

/**
 * Saves the response for the given request eventually overriding the previous version
 * 
 * @param data
 * @returns Promise
 */
function cachePut(request, response, store) {
    var key, data;
    getPostId(request.clone())
        .then(function (id) {
            key = id;
            return serializeResponse(response.clone());
        }).then(function (serializedResponse) {
            data = serializedResponse;
            var entry = {
                key: key,
                response: data,
                timestamp: Date.now()
            };
            store
                .add(entry)
                .catch(function (error) {
                    store.update(entry.key, entry);
                });
        });
}

/**
 * Returns the cached response for the given request or an empty 503-response  for a cache miss.
 * 
 * @param request
 * @return Promise
 */
function cacheMatch(request, store) {
    return getPostId(request.clone())
        .then(function (id) {
           // console.log("cacheMatch-storeid",id);
            return store.get(id);
        }).then(function (data) {
            if (data) {
               // console.log("cacheMatch-data", data);
                return deserializeResponse(data.response);
            } else {
                return new Response('', { status: 503, statusText: 'Service Unavailable' });
            }
        });
}

/**
 * Returns a string identifier for our POST request.
 * 
 * @param request
 * @return string
 */
function getPostId(request) {
    //debugger;
    return serializeRequest(request.clone()).then(function (r) {
       // console.log("r", r);
        //return JSON.stringify(r);
        //return resolve(JSON.stringify(r));
        return Promise.resolve(JSON.stringify(r));
    });
    //var idjs = JSON.stringify(serializeRequest(request.clone()));
    // console.log("idjs", idjs);
    //debugger;
    //return idjs;
}