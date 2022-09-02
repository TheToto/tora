import { HaxeEnum } from "haxeformat";
import { CodecV2 } from "mt-codec";
import { TypedEmitter } from "tiny-typed-emitter";
import { ToraProtocol } from "./ToraProtocol";
export interface ToraEvents<Request extends HaxeEnum, Response extends HaxeEnum> {
    command: (command: Request) => void;
    answer: (response: Response) => void;
}
export declare class ToraGameServer<Request extends HaxeEnum, Response extends HaxeEnum> extends TypedEmitter<ToraEvents<Request, Response>> {
    tora: ToraProtocol;
    sid: string;
    url: string;
    codec: CodecV2 | null;
    constructor(url: string, sid: string, options: Partial<{
        key: string;
        keyVersion: string;
        useWebsocket: boolean;
        websocketBridge: string;
    }>);
    private encodeCommand;
    private decodeAnswer;
    /**
     * Send a command and forget.
     */
    send(cmd: Request): void;
    private onData;
    private onError;
    /**
     * Send a command and wait for next answer.
     * There is NO guarantee that the answer is the one following the command.
     */
    sendAndWaitForAnswer(cmd: Request): Promise<Response>;
}
