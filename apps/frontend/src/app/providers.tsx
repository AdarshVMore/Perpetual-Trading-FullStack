import type { ReactNode } from "react"

type ProviderChildren = {
    children: ReactNode
}

export function Provider({children}:ProviderChildren){
    return(<>{children}</>)
}