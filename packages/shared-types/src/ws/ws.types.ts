export type WsRequests = SubscribeEvent | UnsubscribeEvent

export type EngineCommands = CreateOrder | CancleOrder

export type EngineEvents =  depthUpdates | tradeUpdates | positionUpdates

type CreateOrder = {}
type CancleOrder = {}

type depthUpdates = {}
type tradeUpdates = {}
type positionUpdates = {}

type SubscribeEvent = {}
type UnsubscribeEvent = {}