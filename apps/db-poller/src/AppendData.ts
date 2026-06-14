import db from "@prisma-db"
import type { dbPollerEvents } from "@shared-types/src"

export class AppendData {
    private payload:dbPollerEvents

    constructor(payload:dbPollerEvents) {
        this.payload = payload
    }

    async position(payload:dbPollerEvents){
        if(payload.payload.method === "POST") {
            await db.position.create({})
        }
    }

    order(payload:dbPollerEvents){}

    fills(payload:dbPollerEvents){}

}