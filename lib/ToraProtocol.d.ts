/// <reference types="node" />
import { Socket } from "net";
import { Buffer } from "buffer";
import WebSocket from "isomorphic-ws";
import { Code } from "./Code";
interface MessageEvent {
    data: string | Buffer | ArrayBuffer | Buffer[];
    type: string;
    target: WebSocket;
}
export declare class ToraProtocol {
    host: string;
    port: number;
    uri: string;
    webSocketBridge?: string;
    headers: {
        key: string;
        value: string;
    }[];
    params: {
        key: string;
        value: string;
    }[];
    useWebSocket: boolean;
    sock: WebSocket | Socket | null;
    remaining: Buffer | null;
    constructor(url: string, useWebSocket: boolean, webSocketBridge?: string);
    addHeader(key: string, value: string): void;
    addParameters(key: string, value: string): void;
    reset(): void;
    call(url: string): void;
    connect(): void;
    close(): void;
    send(code: Code, data: string): void;
    onConnect(): void;
    static isMessageEvent(test: any): test is MessageEvent;
    onSocketData(data?: MessageEvent | string | Buffer | ArrayBuffer | Buffer[]): void;
    error(error: string): void;
    onClose(): void;
    onError(msg: string): void;
    onDisconnect(): void;
    onBytes(bytes: Buffer): void;
    onData(_data: string): void;
}
export {};
