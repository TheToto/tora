import { Socket } from "net"
import { Buffer } from "buffer"
import WebSocket from "isomorphic-ws"

import { Code } from "./Code"

const URL_REGEXP = /^(?:https?|wss?):\/\/([^\/:]+)(:[0-9]+)?(.*)$/

interface MessageEvent {
    data: string | Buffer | ArrayBuffer | Buffer[]
    type: string
    target: WebSocket
}

export class ToraProtocol {
    host: string
    port: number
    uri: string

    webSocketBridge?: string

    headers: { key: string; value: string }[]
    params: { key: string; value: string }[]

    useWebSocket: boolean
    sock: WebSocket | Socket | null
    remaining: Buffer | null

    constructor(url: string, useWebSocket: boolean, webSocketBridge?: string) {
        this.headers = []
        this.params = []
        this.useWebSocket = useWebSocket
        this.sock = null
        this.remaining = null

        this.webSocketBridge = webSocketBridge

        const match = url.match(URL_REGEXP)
        if (!match) {
            this.error("Invalid url")
            throw new Error("Invalid url") // If onError does not throw
        }

        this.host = match[1]
        let port: string = match[2]
        this.port = port ? parseInt(port.substring(1)) : 6667
        this.uri = match[3] || "/"
    }

    addHeader(key: string, value: string) {
        this.headers.push({ key, value })
    }

    addParameters(key: string, value: string) {
        this.params.push({ key, value })
    }

    reset() {
        this.headers = []
        this.params = []
    }

    call(url: string) {
        if (!this.sock) {
            this.error("Not connected")
            return
        }
        const match = url.match(URL_REGEXP)
        if (!match) {
            this.error("Invalid URL " + url)
            return
        }
        this.uri = match[3] || "/"
        this.onConnect()
    }

    connect() {
        if (this.useWebSocket) {
            this.sock = new WebSocket(
                this.webSocketBridge || `${this.port === 443 ? "wss" : "ws"}://${this.host}:${this.port}`
            )
            this.sock.binaryType = "arraybuffer"
            this.sock.onopen = this.onConnect.bind(this)
            this.sock.onclose = this.onClose.bind(this)
            this.sock.onerror = this.onClose.bind(this)
            this.sock.onmessage = this.onSocketData.bind(this)
        } else {
            this.sock = new Socket()
            this.sock.setEncoding("binary")
            this.sock.on("connect", this.onConnect.bind(this))
            this.sock.on("close", this.onClose.bind(this))
            this.sock.on("error", this.onClose.bind(this))
            this.sock.on("end", this.onClose.bind(this)) // ?
            this.sock.on("data", this.onSocketData.bind(this))
            this.sock.on("drain", () => {})
            this.sock.connect(this.port, this.host)
        }
    }

    close() {
        try {
            if (this.sock instanceof WebSocket) {
                this.sock.close()
            } else if (this.sock instanceof Socket) {
                this.sock.destroy()
            } else throw new Error()
        } catch {}
        this.sock = null
    }

    send(code: Code, data: string) {
        let packet = [code.valueOf(), data.length & 0xff, (data.length >> 8) & 0xff, (data.length >> 16) & 0xff]
        for (let i = 0; i < data.length; i++) packet.push(data.charCodeAt(i))

        const buffer = Uint8Array.from(packet)

        if (this.sock instanceof WebSocket) {
            this.sock.send(buffer)
        } else if (this.sock instanceof Socket) {
            this.sock.write(buffer)
        } else throw new Error()
    }

    onConnect() {
        // TODO: send this in one websocket packet ?
        if (!this.sock) return
        this.send(Code.CHostResolve, this.host)
        this.send(Code.CUri, this.uri)
        for (const h of this.headers) {
            this.send(Code.CHeaderKey, h.key)
            this.send(Code.CHeaderValue, h.value)
        }
        let get = ""
        for (const p of this.params) {
            if (get != "") get += ";"
            get += encodeURIComponent(p.key) + "=" + encodeURIComponent(p.value)
            this.send(Code.CParamKey, p.key)
            this.send(Code.CParamValue, p.value)
        }
        this.send(Code.CGetParams, get)
        this.send(Code.CExecute, "")
    }

    static isMessageEvent(test: any): test is MessageEvent {
        return test?.data instanceof ArrayBuffer;
    }

    onSocketData(data?: MessageEvent | string | Buffer | ArrayBuffer | Buffer[]) {
        if (!this.sock) return

        let bytes: Buffer | null = null
        if (data) {
            if (ToraProtocol.isMessageEvent(data)) {
                data = data.data
            }

            if (data instanceof Buffer) bytes = data
            else if (data instanceof ArrayBuffer) bytes = Buffer.from(data)
            else if (typeof data === "string") bytes = Buffer.from(data)
            else throw new Error("Invalid type")
        }
        if (this.remaining) {
            bytes = bytes ? Buffer.concat([this.remaining, bytes]) : this.remaining
            this.remaining = null
        }
        if (!bytes) return // No more data to process

        if (bytes.length < 4) {
            this.remaining = bytes
            return
        }
        const code: Code = bytes.readUint8(0)
        const d1 = bytes.readUint8(1)
        const d2 = bytes.readUint8(2)
        const d3 = bytes.readUint8(3)
        const dataLength = d1 | (d2 << 8) | (d3 << 16)
        if (bytes.length < dataLength + 4) {
            this.remaining = bytes
            return
        }
        let packet = bytes.slice(4, dataLength + 4)
        if (dataLength + 4 != bytes.length) this.remaining = bytes.slice(dataLength + 4, bytes.length)

        switch (
            code // Ex
        ) {
            case Code.CHeaderKey:
            case Code.CHeaderValue:
            case Code.CHeaderAddValue:
            case Code.CLog:
                break
            case Code.CPrint:
                this.onBytes(packet)
                break
            case Code.CError:
                this.error(packet.toString())
                break
            case Code.CListen:
            case Code.CExecute:
                break
            default:
                this.error("Can't handle " + Code[code])
        }
        if (this.remaining) this.onSocketData()
    }

    error(error: string) {
        this.close()
        this.onError(error)
    }

    onClose() {
        this.close()
        this.onDisconnect()
    }

    onError(msg: string) {
        console.error(msg)
    }

    onDisconnect() {}

    onBytes(bytes: Buffer) {
        this.onData(bytes.toString())
    }

    onData(_data: string) {}
}
