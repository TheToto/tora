import { Socket } from "net";
import { Code } from "./Code";
import { Buffer } from "buffer";
const URL_REGEXP = /^(?:http|ws):\/\/([^\/:]+)(:[0-9]+)?(.*)$/;
export class ToraProtocol {
    constructor(url, useWebSocket, customConnectHost, customConnectPort) {
        this.headers = [];
        this.params = [];
        this.useWebSocket = useWebSocket;
        this.sock = null;
        this.remaining = null;
        this.customConnectHost = customConnectHost;
        this.customConnectPort = customConnectPort;
        const match = url.match(URL_REGEXP);
        if (!match) {
            this.error("Invalid url");
            throw new Error("Invalid url"); // If onError does not throw
        }
        this.host = match[1];
        let port = match[2];
        this.port = port ? parseInt(port.substring(1)) : 6667;
        this.uri = match[3] || '/';
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
        this.uri = match[3] || '/';
        this.onConnect();
    }
    connect() {
        if (this.useWebSocket) {
            this.sock = new WebSocket(`ws://${this.customConnectHost || this.host}:${this.customConnectPort || this.port}`);
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
            this.sock.connect(this.customConnectPort || this.port, this.customConnectHost || this.host);
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
            data.length & 0xFF,
            (data.length >> 8) & 0xFF,
            (data.length >> 16) & 0xFF,
        ];
        for (let i = 0; i < data.length; i++) // Meh.
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
            this.send(Code.CHeaderValue, h.key);
        }
        let get = "";
        for (const p of this.params) {
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
        if (data instanceof MessageEvent)
            data = data.data; // Can be a ArrayBuffer or a string
        let bytes;
        if (data instanceof Buffer)
            bytes = data;
        else if (data instanceof ArrayBuffer)
            bytes = new Buffer(data);
        else if (typeof data === "string")
            bytes = Buffer.from(data); // This should never append.
        else
            throw new Error();
        if (this.remaining) {
            bytes = Buffer.concat([this.remaining, bytes]);
            this.remaining = null;
        }
        if (bytes.length < 4) {
            this.remaining = bytes;
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
        switch (code) { // Ex
            case Code.CHeaderKey:
            case Code.CHeaderValue:
            case Code.CHeaderAddValue:
            case Code.CLog:
                break; // FIXME: Tora does not have this break.
            case Code.CPrint:
                this.onBytes(packet);
                break; // FIXME: Tora does not have this break. WTF?
            case Code.CError:
                this.error(packet.toString());
                break;
            case Code.CListen:
            case Code.CExecute:
            // break; => neko
            default:
                this.error("Can't handle " + code);
        }
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
        throw new Error(msg);
    }
    onDisconnect() { }
    onBytes(bytes) {
        this.onData(bytes.toString());
    }
    onData(_data) { }
}
//# sourceMappingURL=ToraProtocol.js.map