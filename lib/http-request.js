"use strict";

const Q = require("q");
const http = require("http");

// eslint-disable-next-line import/no-mutable-exports
let httpRequest;

/**
 * check fiew things
 *
 * @param {import("http").IncomingMessage} response
 * @returns {import("http").IncomingMessage}
 */
function _checkHeaders(response) {
    let error;
    if (response.statusCode === 0) {
        error = new Error("HttpConnectionError");
        throw error;
    }
    if (response.statusCode < 200 || response.statusCode > 299) {
        error = new Error("HttpStatus" + response.statusCode);
        error.statusCode = response.statusCode;
        error.statusMessage = response.statusMessage;
        throw error;
    }
    return response;
}

// read the entire data and put it in response.body
function _readBody(response) {
    return Q.Promise(function (resolve, reject) {
        const data = [];
        let dataLength = 0;

        response.on("data", function (chunk) {
            data.push(chunk);
            dataLength += chunk.length;
        });

        response.on("end", function () {
            try {
                response.body = Buffer.concat(data, dataLength);
                resolve(response);
            } catch (error) {
                reject(error);
            }
        });
    });
}

// converts the body into a String (Buffer -> String)
function _bodyToString(response) {
    response.body = response.body.toString("utf-8");
    return response;
}

// converts the body into Blob (Buffer -> Blob)
function _bodyToBlob(response) {
    let mimetype = "application/octet-stream";
    if (response.headers["content-type"]) {
        mimetype = response.headers["content-type"];
    }
    response.body = new Blob([response.body], { type: mimetype });
    return response;
}

// converts the body into javascript objects (JSON String -> Object)
function _bodyParseJson(response) {
    if (typeof response.body != "string") {
        response = _bodyToString(response);
    }
    try {
        response.body = JSON.parse(response.body);
    } catch (error) {
        const notValidError = new Error("NotAValidJson");
        notValidError.statusCode = response.statusCode;
        notValidError.statusMessage = response.statusMessage;
        notValidError.cause = error;
        throw notValidError;
    }
    return response;
}

// return the body
function _returnBody(response) {
    return response.body;
}

// make request without proxy
function _request(requestUrl, options) {
    options = options || {};
    options = {
        method: options.method || "GET",
        headers: options.headers || {},
        body: options.body || null,  // Must be a Node Buffer or null
    };

    const parsedUrl = new URL(requestUrl, window.location.href);

    const httpOptions = {
        protocol: parsedUrl.protocol,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || ((parsedUrl.protocol == "https:") ? 443 : 80),
        path: parsedUrl.pathname,
        method: options.method,
        headers: options.headers,
    };

    return Q.Promise(function (resolve, reject) {
        const req = http.request(httpOptions, resolve)
            .on("error", reject);
        if (options.body !== null && options.body !== undefined) {
            req.write(options.body);
        }
        req.end();
    });
}

// make request through the proxy
function _requestProxy(requestUrl, options) {
    options = options || {};
    options = {
        method: options.method || "GET",
        headers: options.headers || {},
        body: options.body || null,  // Must be a Node Buffer or null
        allowedMimes: options.allowedMimes || [],
    };

    requestUrl = new URL(requestUrl, globalThis.location.href).href;
    const proxyUrl = new URL(httpRequest.proxyPath, globalThis.location.href);

    const httpOptions = {
        protocol: proxyUrl.protocol,
        hostname: proxyUrl.hostname,
        port: proxyUrl.port || ((proxyUrl.protocol == "https:") ? 443 : 80),
        path: proxyUrl.pathname,
        method: "POST",
        headers: {
            "content-type": "application/json",
        },
    };

    return Q.Promise(function (resolve, reject) {
        const req = http.request(httpOptions, resolve)
            .on("error", reject);
        req.write(JSON.stringify({
            url: requestUrl,
            method: options.method,
            headers: options.headers || {},
            allowedMimes: options.allowedMimes || [],
            body: options.body ? options.body.toString("base64") : null,
        }));
        req.end();
    });
}

/**
 * @class http-request
 */
httpRequest = {

    /**
     * The path of the proxy on the server.
     *
     * @property proxyPath
     * @type String
     * @default "/proxy"
     */
    proxyPath: "/proxy",

    /**
     * Retrieve any file as a raw Node.js Buffer (HTTP GET).
     *
     * @method getRaw
     * @param {String} url The URL of the file
     * @param {Function} callback A Node-like callback (optional)
     * @return {Q.Promise}
     */
    getRaw(url, callback) {
        return _request(url)
            .then(_checkHeaders)
            .then(_readBody)
            .then(_returnBody)
            .catch(function (error) {
                error.message = "Error getting raw for " + url + " | " + error.message;
                throw error;
            })
            .nodeify(callback);
    },

    /**
     * Retrieve any file as a Blob (HTTP GET).
     *
     * @method getBlob
     * @param {String} url The URL of the file
     * @param {Function} callback A Node-like callback (optional)
     * @return {Q.Promise}
     */
    getBlob(url, callback) {
        return _request(url)
            .then(_checkHeaders)
            .then(_readBody)
            .then(_bodyToBlob)
            .then(_returnBody)
            .catch(function (error) {
                error.message = "Error getting Blob for " + url + " | " + error.message;
                throw error;
            })
            .nodeify(callback);
    },

    /**
     * Retrieve any file as a String (HTTP GET).
     *
     * @method getText
     * @param {String} url The URL of the file
     * @param {Function} callback A Node-like callback (optional)
     * @return {Q.Promise}
     */
    getText(url, callback) {
        return _request(url)
            .then(_checkHeaders)
            .then(_readBody)
            .then(_bodyToString)
            .then(_returnBody)
            .catch(function (error) {
                error.message = "Error getting text for " + url + " | " + error.message;
                throw error;
            })
            .nodeify(callback);
    },

    /**
     * Retrieve a JSON file (HTTP GET)
     *
     * The result of this function is a plain Javascript object (parsed JSON).
     *
     * @method getJson
     * @param {String} url The URL of the JSON file
     * @param {Function} callback A Node-like callback (optional)
     * @return {Q.Promise}
     */
    getJson(url, callback) {
        return _request(url)
            .then(_checkHeaders)
            .then(_readBody)
            .then(_bodyToString)
            .then(_bodyParseJson)
            .then(_returnBody)
            .catch(function (error) {
                error.message = "Error getting JSON for " + url + " | " + error.message;
                throw error;
            })
            .nodeify(callback);
    },

    /**
     * Make an HTTP request
     *
     * The result of this function is a Node Buffer.
     *
     * @method request
     * @param {String} url The URL of the request
     * @param {Object} options The options of the request (optional)
     * @param {String} options.method The HTTP method to use (default: `GET`)
     * @param {Object} options.headers Additionnal HTTP headers (e.g. `{"content-type": "application/json"}`, default: `{}`)
     * @param {Buffer} options.body The body of the request (default: `null`)
     * @param {Function} callback A Node-like callback (optional)
     */
    request(url, options, callback) {
        if (typeof (options) == "function") {
            callback = options;
            options = {};
        }
        return _request(url, options)
            .then(_checkHeaders)
            .then(_readBody)
            .then(_returnBody)
            .catch(function (error) {
                error.message = "Error resquesting for " + url + " | " + error.message;
                throw error;
            })
            .nodeify(callback);
    },

    /**
     * Retrieve any file as a raw Node.js Buffer through the Obsidian Proxy Server (HTTP GET).
     *
     * @method getRawProxy
     * @param {String} url The URL of the file
     * @param {Object} options Any options for Obsidian Proxy Server (optional)
     * @param {Function} callback A Node-like callback (optional)
     * @return {Q.Promise}
     */
    getRawProxy(url, options, callback) {
        return _requestProxy(url, options)
            .then(_checkHeaders)
            .then(_readBody)
            .then(_returnBody)
            .catch(function (error) {
                error.message = "Error getting raw via proxy for " + url + " | " + error.message;
                throw error;
            })
            .nodeify(callback);
    },

    /**
     * Retrieve any file as a Blob through the Obsidian Proxy Server (HTTP GET).
     *
     * @method getBlobProxy
     * @param {String} url The URL of the file
     * @param {Object} options Any options for Obsidian Proxy Server (optional)
     * @param {Function} callback A Node-like callback (optional)
     * @return {Q.Promise}
     */
    getBlobProxy(url, options, callback) {
        return _requestProxy(url, options)
            .then(_checkHeaders)
            .then(_readBody)
            .then(_bodyToBlob)
            .then(_returnBody)
            .catch(function (error) {
                error.message = "Error getting Blob via proxy for " + url + " | " + error.message;
                throw error;
            })
            .nodeify(callback);
    },

    /**
     * Retrieve any file as a String through the Obsidian Proxy Server (HTTP GET).
     *
     * @method getRawProxy
     * @param {String} url The URL of the file
     * @param {Object} options Any options for Obsidian Proxy Server (optional)
     * @param {Function} callback A Node-like callback (optional)
     * @return {Q.Promise}
     */
    getTextProxy(url, options, callback) {
        return _requestProxy(url, options)
            .then(_checkHeaders)
            .then(_readBody)
            .then(_bodyToString)
            .then(_returnBody)
            .catch(function (error) {
                error.message = "Error getting text via proxy for " + url + " | " + error.message;
                throw error;
            })
            .nodeify(callback);
    },

    /**
     * Retrieve a JSON file through Obsidian Proxy Server (HTTP GET)
     *
     * @method getJsonProxy
     * @param {String} url The URL of the JSON file
     * @param {Object} options Any options for Obsidian Proxy Server (optional)
     * @param {Function} callback A Node-like callback (optional)
     * @return {Q.Promise}
     */
    getJsonProxy(url, options, callback) {
        return _requestProxy(url, options)
            .then(_checkHeaders)
            .then(_readBody)
            .then(_bodyToString)
            .then(_bodyParseJson)
            .then(_returnBody)
            .catch(function (error) {
                error.message = "Error getting JSON via proxy for " + url + " | " + error.message;
                throw error;
            })
            .nodeify(callback);
    },

    /**
     * Make an HTTP request through the Obsidian Proxy Server
     *
     * The result of this function is a Node Buffer.
     *
     * @method requestProxy
     * @param {String} url The URL of the request
     * @param {Object} options The options of the request (optional)
     * @param {String} options.method The HTTP method to use (default: `GET`)
     * @param {Object} options.headers Additionnal HTTP headers (e.g. `{"content-type": "application/json"}`, default: `{}`)
     * @param {Buffer} options.body The body of the request (default: `null`)
     * @param {Array} options.allowedMimes The allowed mime (default: `[]`)
     * @param {Function} callback A Node-like callback (optional)
     */
    requestProxy(url, options, callback) {
        if (typeof (options) == "function") {
            callback = options;
            options = {};
        }
        return _requestProxy(url, options)
            .then(_checkHeaders)
            .then(_readBody)
            .then(_returnBody)
            .catch(function (error) {
                error.message = "Error resquesting proxy for " + url + " | " + error.message;
                throw error;
            })
            .nodeify(callback);
    },

    /**
     * Low-level operations.
     *
     * @property _operations
     * @private
     */
    _operations: {
        _request,
        _requestProxy,
        _checkHeaders,
        _readBody,
        _bodyToString,
        _bodyParseJson,
        _returnBody,
    },
};

module.exports = httpRequest;
