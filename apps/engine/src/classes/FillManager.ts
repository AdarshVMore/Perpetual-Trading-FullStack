import type { Fills } from "@shared-types";

export class FillManager{

    private fills:Fills[] = []

    createFill(fillsObject: Fills){
        this.fills.push(fillsObject)
    }

    getFills(){
        return this.fills
    }
    
}
