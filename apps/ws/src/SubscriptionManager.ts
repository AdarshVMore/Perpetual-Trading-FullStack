import WebSocket from "ws"

export class SubcriptionManager {
    private socketToChannel = new Map<WebSocket,Set<string>>()
    private channelToSocket = new Map<string,Set<WebSocket>>()

    subscribe(channel:string, socket:WebSocket){
        console.log("caling subscribe")
        if(!this.socketToChannel.has(socket)){
            this.socketToChannel.set(socket, new Set())
        }

        this.socketToChannel.get(socket)?.add(channel)

        if(!this.channelToSocket.has(channel)){
            this.channelToSocket.set(channel, new Set())
        }

        this.channelToSocket.get(channel)?.add(socket)
        // const x = this.channelToSocket.get(channel)
        // if(!x){
        //     console.log("not x")
        //     return
        // }
        // for(let y of x ){
        //     console.log("these are the sockets", x)
        // }


        console.log("Subscribed to ", channel)
    }

    removeSocket(socket:WebSocket){
        console.log("remove socket")

        const channels = this.socketToChannel.get(socket)

        if(!channels){
            throw new Error("no channels for this socket")
        }
        for(let channel of channels){
            this.channelToSocket.get(channel)?.delete(socket)
        }

        this.socketToChannel.delete(socket)
    }

    createChannel(channel:string,market:String){
        return `${channel}:${market}`
    }

    unsubscribeChannel(channel:string, socket:WebSocket){
        this.channelToSocket.get(channel)?.delete(socket)
        this.socketToChannel.get(socket)?.delete(channel)

        console.log("unsubscribed")
    }

    getSubscribers(channel:string){
        return this.channelToSocket.get(channel)
    }
}