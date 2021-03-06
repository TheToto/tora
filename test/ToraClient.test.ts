import { ToraProtocol } from "../src/ToraProtocol"
import { Buffer } from "buffer"
import { Code } from "../src/Code"
import { Socket } from "net"

test("regex", () => {
    let client = new ToraProtocol("http://play.kube.muxxu.com:6767/play", true)
    expect(client.host).toBe("play.kube.muxxu.com")
    expect(client.port).toBe(6767)
    expect(client.uri).toBe("/play")
})

test("onSend", () => {
    let client = new ToraProtocol("http://play.kube.muxxu.com:6767/play", true)

    // Set socket to be able to use onSocketData
    client.sock = new Socket()

    let ret = ""

    client.onData = function (data) {
        ret = data
    }

    let data = "bip"
    let packet = [
        Code.CPrint.valueOf(),
        data.length & 0xff,
        (data.length >> 8) & 0xff,
        (data.length >> 16) & 0xff,
        data.charCodeAt(0),
        data.charCodeAt(1),
        data.charCodeAt(2),
    ]

    client.onSocketData(Buffer.from(packet))
    expect(ret).toBe(data)
})
