"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToraGameServer = void 0;
const haxeformat_1 = require("haxeformat");
const mt_codec_1 = require("mt-codec");
const tiny_typed_emitter_1 = require("tiny-typed-emitter");
const ToraProtocol_1 = require("./ToraProtocol");
// TODO: Some games use multiple tora procols.
class ToraGameServer extends tiny_typed_emitter_1.TypedEmitter {
    constructor(url, sid, options) {
        var _a;
        super();
        this.codec = options.key ? new mt_codec_1.CodecV2(options.key, options.keyVersion) : null;
        this.sid = sid;
        this.url = url;
        this.tora = new ToraProtocol_1.ToraProtocol(url, (_a = options.useWebsocket) !== null && _a !== void 0 ? _a : false, options.websocketBridge);
        this.on("command", this.send.bind(this));
        this.tora.onData = this.onData.bind(this);
        this.tora.onError = this.onError.bind(this);
    }
    encodeCommand(cmd) {
        let S = new haxeformat_1.Serializer();
        S.useEnumIndex = true;
        S.serialize(cmd);
        let serialized = S.toString();
        return this.codec ? this.codec.encode(serialized) : serialized;
    }
    decodeAnswer(data) {
        let decoded = this.codec ? this.codec.decode(data) : data;
        let U = new haxeformat_1.Unserializer(decoded);
        U.allowUnregistered = true;
        return U.unserialize();
    }
    /**
     * Send a command and forget.
     */
    send(cmd) {
        let data = this.encodeCommand(cmd);
        this.tora.reset();
        this.tora.addHeader("Cookie", `sid=${encodeURIComponent(this.sid)}`);
        this.tora.addParameters("__d", data);
        if (this.tora.sock === null)
            this.tora.connect();
        else
            this.tora.call(this.url);
    }
    onData(data) {
        let answer = this.decodeAnswer(data);
        this.emit("answer", answer);
    }
    onError(error) {
        throw new Error(error);
    }
    /**
     * Send a command and wait for next answer.
     * There is NO guarantee that the answer is the one following the command.
     */
    sendAndWaitForAnswer(cmd) {
        return new Promise((resolve) => {
            this.once("answer", (answer) => {
                resolve(answer);
            });
            this.send(cmd);
        });
    }
}
exports.ToraGameServer = ToraGameServer;
//# sourceMappingURL=GameServer.js.map