import { Socket } from "net";
import { Code } from "./Code";
import { Buffer } from "buffer";
const URL_REGEXP = /^(?:https?|wss?):\/\/([^\/:]+)(:[0-9]+)?(.*)$/;
export class ToraProtocol {
    constructor(url, useWebSocket, webSocketBridge) {
        this.headers = [];
        this.params = [];
        this.useWebSocket = useWebSocket;
        this.sock = null;
        this.remaining = null;
        this.webSocketBridge = webSocketBridge;
        const match = url.match(URL_REGEXP);
        if (!match) {
            this.error("Invalid url");
            throw new Error("Invalid url"); // If onError does not throw
        }
        this.host = match[1];
        let port = match[2];
        this.port = port ? parseInt(port.substring(1)) : 6667;
        this.uri = match[3] || "/";
    }
    addHeader(key, value) {
        this.headers.push({ key, value });
    }
    addParameters(key, value) {
        this.params.push({ key, value });
    }
    reset() {
        this.headers = [];
        this.params = [];
    }
    call(url) {
        if (!this.sock) {
            this.error("Not connected");
            return;
        }
        const match = url.match(URL_REGEXP);
        if (!match) {
            this.error("Invalid URL " + url);
            return;
        }
        this.uri = match[3] || "/";
        this.onConnect();
    }
    connect() {
        if (this.useWebSocket) {
            this.sock = new WebSocket(this.webSocketBridge ||
                `${this.port === 443 ? "wss" : "ws"}://${this.host}:${this.port}`);
            this.sock.binaryType = "arraybuffer";
            this.sock.onopen = this.onConnect.bind(this);
            this.sock.onclose = this.onClose.bind(this);
            this.sock.onerror = this.onClose.bind(this);
            this.sock.onmessage = this.onSocketData.bind(this);
        }
        else {
            this.sock = new Socket();
            this.sock.setEncoding("binary");
            this.sock.on("connect", this.onConnect.bind(this));
            this.sock.on("close", this.onClose.bind(this));
            this.sock.on("error", this.onClose.bind(this));
            this.sock.on("end", this.onClose.bind(this)); // ?
            this.sock.on("data", this.onSocketData.bind(this));
            this.sock.on("drain", () => { });
            this.sock.connect(this.port, this.host);
        }
    }
    close() {
        try {
            if (this.sock instanceof WebSocket) {
                this.sock.close();
            }
            else if (this.sock instanceof Socket) {
                this.sock.destroy();
            }
            else
                throw new Error();
        }
        catch (_a) { }
        this.sock = null;
    }
    send(code, data) {
        let packet = [
            code.valueOf(),
            data.length & 0xff,
            (data.length >> 8) & 0xff,
            (data.length >> 16) & 0xff,
        ];
        for (let i = 0; i < data.length; i++)
            packet.push(data.charCodeAt(i));
        const buffer = Uint8Array.from(packet);
        if (this.sock instanceof WebSocket) {
            this.sock.send(buffer);
        }
        else if (this.sock instanceof Socket) {
            this.sock.write(buffer);
        }
        else
            throw new Error();
    }
    onConnect() {
        // TODO: send this in one websocket packet ?
        if (!this.sock)
            return;
        this.send(Code.CHostResolve, this.host);
        this.send(Code.CUri, this.uri);
        for (const h of this.headers) {
            this.send(Code.CHeaderKey, h.key);
            this.send(Code.CHeaderValue, h.value);
        }
        let get = "";
        for (const p of this.params) {
            if (get != "")
                get += ";";
            get += encodeURIComponent(p.key) + "=" + encodeURIComponent(p.value);
            this.send(Code.CParamKey, p.key);
            this.send(Code.CParamValue, p.value);
        }
        this.send(Code.CGetParams, get);
        this.send(Code.CExecute, "");
    }
    onSocketData(data) {
        if (!this.sock)
            return;
        let bytes = null;
        if (data) {
            if (data instanceof MessageEvent)
                data = data.data; // Can be a ArrayBuffer or a string
            if (data instanceof Buffer)
                bytes = data;
            else if (data instanceof ArrayBuffer)
                bytes = new Buffer(data);
            else if (typeof data === "string")
                bytes = Buffer.from(data); // This should never append.
            else
                throw new Error("Invalid type");
        }
        if (this.remaining) {
            bytes = bytes
                ? Buffer.concat([this.remaining, bytes])
                : this.remaining;
            this.remaining = null;
        }
        if (!bytes)
            return; // No more data to process
        if (bytes.length < 4) {
            this.remaining = bytes;
            return;
        }
        const code = bytes.readUint8(0);
        const d1 = bytes.readUint8(1);
        const d2 = bytes.readUint8(2);
        const d3 = bytes.readUint8(3);
        const dataLength = d1 | (d2 << 8) | (d3 << 16);
        if (bytes.length < dataLength + 4) {
            this.remaining = bytes;
            return;
        }
        let packet = bytes.slice(4, dataLength + 4);
        if (dataLength + 4 != bytes.length)
            this.remaining = bytes.slice(dataLength + 4, bytes.length);
        switch (code // Ex
        ) {
            case Code.CHeaderKey:
            case Code.CHeaderValue:
            case Code.CHeaderAddValue:
            case Code.CLog:
                break;
            case Code.CPrint:
                this.onBytes(packet);
                break;
            case Code.CError:
                this.error(packet.toString());
                break;
            case Code.CListen:
            case Code.CExecute:
                break;
            default:
                this.error("Can't handle " + Code[code]);
        }
        if (this.remaining)
            this.onSocketData();
    }
    error(error) {
        this.close();
        this.onError(error);
    }
    onClose() {
        this.close();
        this.onDisconnect();
    }
    onError(msg) {
        console.error(msg);
    }
    onDisconnect() { }
    onBytes(bytes) {
        this.onData(bytes.toString());
    }
    onData(_data) { }
}
//# sourceMappingURL=ToraProtocol.js.map