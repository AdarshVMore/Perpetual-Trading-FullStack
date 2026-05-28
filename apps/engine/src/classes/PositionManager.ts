import type { UserPositions } from "../../../../packages/shared-types";
import type { RiskManager } from "./RiskManager";
import type { UserManager } from "./UserManager";

export class PositionManager{

    constructor(private riskManager:RiskManager, private userManager:UserManager){

    }

    getPosition(userId:string, marketId:string){
        const positions = this.userManager.getPositiotns(userId)
        if(!positions){
            throw new Error("positions not found")
        }
        for(let position of positions) {
            if(position.marketId === marketId){
                return position
            }
            else {
                return false
            }
        }
    }   

    updatePosition(){

    }

    addPosition(userId:string, position:UserPositions){
        const user = this.userManager.getUser(userId)
        if(!user) {
            throw new Error("user does not exist to add position")
        }
        user.positions.push(position)
    }

    reducePosition(){

    }

    canclePosition(){

    }

    reversePosition(){

    }
}