import { HaxeEnum, Serializer, Unserializer } from "haxeformat"
import { CodecV2 } from "mt-codec"
import { TypedEmitter } from "tiny-typed-emitter"

import { ToraProtocol } from "./ToraProtocol"

export interface ToraEvents<Request extends HaxeEnum, Response extends HaxeEnum> {
    command: (command: Request) => void
    answer: (response: Response) => void
}

// TODO: Some games use multiple tora procols.
export class ToraGameServer<Request extends HaxeEnum, Response extends HaxeEnum> extends TypedEmitter<
    ToraEvents<Request, Response>
> {
    tora: ToraProtocol
    sid: string
    url: string

    codec: CodecV2 | null

    constructor(
        url: string,
        sid: string,
        options: Partial<{
            key: string
            keyVersion: string
            useWebsocket: boolean
            websocketBridge: string
        }>
    ) {
        super()
        this.codec = options.key ? new CodecV2(options.key, options.keyVersion) : null
        this.sid = sid
        this.url = url
        this.tora = new ToraProtocol(url, options.useWebsocket ?? false, options.websocketBridge)

        this.on("command", this.send.bind(this))
        this.tora.onData = this.onData.bind(this)
        this.tora.onError = this.onError.bind(this)
    }

    private encodeCommand(cmd: Request): string {
        let S = new Serializer()
        S.useEnumIndex = true
        S.serialize(cmd)
        let serialized = S.toString()
        return this.codec ? this.codec.encode(serialized) : serialized
    }

    private decodeAnswer(data: string): Response {
        let decoded = this.codec ? this.codec.decode(data) : data
        let U = new Unserializer(decoded)
        U.allowUnregistered = true
        return U.unserialize()
    }

    /**
     * Send a command and forget.
     */
    public send(cmd: Request) {
        let data = this.encodeCommand(cmd)

        this.tora.reset()
        this.tora.addHeader("Cookie", `sid=${encodeURIComponent(this.sid)}`)
        this.tora.addParameters("__d", data)

        if (this.tora.sock === null) this.tora.connect()
        else this.tora.call(this.url)
    }

    private onData(data: string) {
        let answer = this.decodeAnswer(data)
        this.emit("answer", answer)
    }

    private onError(error: string) {
        throw new Error(error)
    }

    /**
     * Send a command and wait for next answer.
     * There is NO guarantee that the answer is the one following the command.
     */
    public sendAndWaitForAnswer(cmd: Request): Promise<Response> {
        return new Promise((resolve) => {
            this.once("answer", (answer: Response) => {
                resolve(answer)
            })
            this.send(cmd)
        })
    }
}
