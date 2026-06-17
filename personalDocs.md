# => want to Long / Short an Asset ? 
# => place a limit / market order 
[ here we are manually defining Qty , Price and leverage at the same point and Margin , Collateral , NotionValue, Maintainance Margin , Mark price , etc is been calculated ]
# => if Market order, 
it gets filled with best price for the qty and THEN your longing / shorting starts 
# => if it is Limit Order and you longed and your order isnt matched 
you will sit on order book and if someone wants to Short with same price your order will fill / partially filles and only the your longing will start 
# => now after longing / shorting is placed 
now PnL engine takes live prices from Binance or anyhere and calculates unRealised PnL and uses some formula there 
    (CurrentPrice - EntryPrice) x Qty = PnL
# => now you can manually close the longing and sit again on order book at final price you decide and get matched with someone who is shorting and get filled 
# => if not you will go on until your loss > collateral 
there it will autoLiquidate after a maintainance margin like 5% 
# => Now again matching engine will start matching and order will be filled then


## Things i Need to make
- Matching Logic
- Position Logic => track live PnL with live Position of Long / Short.
- Lock Collateral Logic
- Risk Logic checking Liquidation
- calculate Mark Price with index price
- Liquidation Engine to Force close bad positions
- Funding Rate Engine - Keep perp price near spot

## Updated Flow:
1. User input => price, Qty, Leverage, Long/Short, Open/Close, Market/limit 
<!-- price x qty has to be equal to leverage x margin . i.e. margin = (price x quantity) / leverage
    no Margin as input from user because it can create Inconssitent Values. calculate Marign
 -->
2. quantity validation && market exists && limit price validation => qty > 0 && __ && price > 0
3. Validate Margin => check if Available balance > Margin => Collateral = Margin user inputed
4. Calculate notional => Margin x Leverage 
<!-- IF allowing Marin as input can do thi as a check Notional === price x qty , then it is a valid order -->
4. required margin => requiredMargin = (price x Qty) / Leverage . has to be -> requiredMargin <= AvailableBalance
6. Lock collateral => Available Balance - requiredMargin
7. Create pending order => status as Pending => add in User's Orders 
<!-- position can be added only when the order is filled and position is created, cause it might fill the order partially so entry price for position might change -->
8. Matching engine => travers through Bids/Asks Array and check for Best price for Market => add price-time priority
9. Partial/full fill handling => if partial fill , it would be a case of slipage mentioned on point 21
10. Add fills => add each fill in Fills array 
11. Create/update position => check existing position and update in it if not there, create new one 
    No position         -> Create
    Same side           -> Increase
    Opposite smaller    -> Reduce
    Opposite equal      -> Close both
    Opposite larger     -> Reverse
12. Calculate average entry => if position is updated for Same Side
13. Calculate liquidation price => [a live price of SOL where that Order has to autoLiquidate, can bare more loss than this because Collateral isnt enough]
long: EntryPrice x (1 - (1/leverage) + maintainanceMargin %)
short: EntryPrice x (1 + (1/leverage) - maintainanceMargin %)
Maintainance Margin = 5% means = 5% of initial Margin
14. Update unrealized pnl => (CurrentPrice - EntryPrice) x qty
15. Risk engine check => check if Margin + PnL >= MaintainanceMargin. else autoLiquidation
16. Maintenance margin check 
17. Auto liquidation if needed => loop through open orders with every price update in Binance API
18. Liquidation order enters orderbook 
19. Matching engine executes liquidation
20. Final state

21. Case of Slipage => 1 Price Level wont fill your Position Opening => partial fills different different prices
    before => 90 → 10   new Order => 25 qty at MarketPrice          90 → removed
              91 → 8                                                91 → removed
              92 → 20                                               92 → 13 remaining
    3 different fills in Fills[]
    But in Position[] entryPrice = weightedAvg = [(10×90)+(8×91)+(7×92)​] / 25 = 90.88 as EntryPrice for this position
    Because of Slipage User might get -ve PnL in start, becs bought at higher prices as well


<!-- =======================   CANCLE ORDER FLOW   ========================== -->
1. If Order is not filled completely and is on orderbook
2. user click on Close order for this :OrderId
3. unLock the Collateral 
4. change status of the :Order
4. remove from OrderBook

## Important Points Cleared
- Longing Position => goes to BIDS
- shorting Position => goes to ASKS
- Closing Long => goes to Asks [becomes Sell basically] 
- Closing Short => goes to Bids [becomes Buy basically]
- User cannot do 10 different Long orders
    it new long gets added to users existing Long
    calculating the average price => as index price 
- If User has Longed and creates new Short
    it will reduce the qty from Long
    eg: old => Long 10 @100
        new => Short 5 @110
        Final => keep only: Long 5 @100


Questions:
- What is lastTradedProce
- What is indexPrice and, actualy price to map an Order. difference betn both
- if action is Open Order / Close Order for Close as well can i specify as Limit/Market Close ? or will it close at the current MarketPrice + realised PnL for the amount of quantity user getting  (current MarketPrice + realised PnL) x qty in his available balance?
 => True



# Edge Cases i am not covering
- for Market Order => if there are not enough qty to fill in all orders combined it should [cancle the order / partial fill and cancle the remaining order / other]
- Position is Opened with every Partial Fill of an order as well


# working on right now
- unrealised PNL                                    DONE
- relaised PNL                                      DONE
- autoLiquidationCheck on every price change        DONE
- the Live PnL has to be calculated via Websocket from Binance
- partial fills mai lockBalance and available mai changes
- leverage has to be changes in same position like 2 longs or 2 shorts or different , also the margin will add quantity will add and leverage will be calculated => cause we are not taking Leverage from frontend we are taking [price, quantity, margin] leverage is been calculated frm those average price x added 

- Frontend ke lie Sare projects deployed and working + [AI-Code-Reviewer, Perps frontend + backend]
- use Morgan to check the response time for each request
- indexPrice has to be updarted in the Order[SOL] object from binance API

# tonight
- Try Binance & Backpack perp dashboard and check what are we entering , how are they working under the hook how are the calculating all of it
- websocket under the hood back and forth from ChatGPT
- Redis Queues under the hood back and forth from ChatGPT
- Pub/Sub under the hood back and forth from ChatGPT
- Perps Entire System of Binance => ask questions and understand the reason for each and everything why they do what they do




For V2
- 

----------------------------------------------------------------

# Current Status

-----

- Open => Market => Long        
    1. Add Order in Users.Order[]   
    2. Looping through OrderBook.sortedAskPrices => got "bestPrice"
    3. Get LinkedList of Orders with "bestPrice"
    4. Looping through Orders[] in LinkedList
    5. get Qty of Order and fullFill it => reduce from LinkedList Order && Users.Order.Qty => Updating Status => Add in Fills[]
    6. for Every Fill => add in Users Positions => Following this:
        No position         -> Create
        Same side           -> Increase
        Opposite smaller    -> Reduce
        Opposite equal      -> Close both
        Opposite larger     -> Reverse
    <!-- need to update the remaining values in userPosition -->

- Open => Market => Short       1. Add Order in Users.Order[]
- Open => Limit => Long         1. Add Order in Users.Order[]
- Open => Limit => Short        1. Add Order in Users.Order[]


-----

- Close => Market => Long       
- Close => Market => Short      
- Close => Limit => Long        
- Close => Limit => Short





# Doubts i really dont have, not getting cleared
- How does spot and perps prices differ ? basic samajh gya bro, samajhgya



# Funding Rate Feature Flow
1. Spot Market Exists
2. Perp Traders Aggressively LONG
3. Exchange Detects Premium    =>    perp > spot
4. LONGS PAY SHORTS
5. Funding Timestamp Arrives    =>      8h
6. Loop all positions     =>    If LONG: deduct funding     =>      If SHORT: credit funding
7. Cross Margin Changes && PnL changes   =>  check if Margin < MaintainanceMargin  =>  Traders Realise: Starts Shorting their possition   =>   if Margin is less: AutoLiquidate whole position














# Some logic fixes I had to do, checked while testing
1. unRealisedPnL formula is different for LONG anfd SHORT
    LONG => as it was (updatedValue - entryPrice) * qty
    SHORT => (entryPrice - updatedValue) * qty
2. setInterval instead of while loop to update the prices




----------



locking a row in db
consumer group in redis => 1 queue 20 workers : how does this work => consumer groups
engine can be scalled but seperate Orderbook for seperate market 
snapshot ? what exactly happens here?
redis queue shapshotting to restore it if it goes down

all the features in redi, websocket, pubsub and then its working, it cons etc 
- like offset, transaction time for each data in queue, snapshotting and recovering for a queue
- redis streams

read the flow of each request on mainBackend and flowing to DB and Engine Memory
- using DB Pollar


Slipage isnt the average price but is the Max price
streams was implemented by him so was able to ans, he read it yesterday in front of me. get good with doing these things before hand, things that bhaiya mentioned in previous calss
and that global.d.ts syntax, learn those things man

lets create multiple small projects having all redis streams / queue/ caching quickly, snapshottig, zod, complex schema


-----

initialize turborepo project with a command bunx create-turbo@latest
clearing the project
import important things
create tests : some 2 types of tests the [integration test , __________ ]
implement ZOD to all of the incomming routes for validation
create basic signup and signin with JWT and middleware
write tests for signup, signin
write adminToken to have access of creating a market
design schema, for all entities, relations betwen them , that maker and taker thing i didnt get [2 maker with user and other + 2 taker with user and other]

whats happening ? => the flow of admin token, create a market and and all flow of queues ===> websockets => streams [ why not pubsub , why queue, how do they work in general ] ye sab samajh nahi aaraha



What to do now:
Watch it again and after that , BlindFold Coding and revising



## Websocket + Pubsub
- here a socket is a single user or user's browser tab that opened trades page for eg
- subscribe is nothing but creating a channel as string "trades:BTC" and storing it in memory in datascructure
    socketToChannel
    channelToSocket
  both are maps => {websocket, string} and {string, websocket} . thats it , this is the subscribe thing
- now Unscbscribe means deleting the socket and channel from both
- we using redis PubSub sending his channelName, he getSubscribers() from channelName => recieved all sockets he wants to send
  message to all the sockets for that channel => message comes from Engine and gets sent




## after completing the ws connections trying to imagine all the things done

so there are 
### DONE : 1 websocket [ user browser <-> ws-server ] 
1 pubsub [ engine -> ws-server ] (send channelName & positionUpdate + tradeUpdate + depthUpdate + tickerUpdate)

### DONE : 1 websocket [ ws-binance <-> binance-API] (incomming index price updates only) //needs to send to Engine for Liquidation + unrealisedPnL calculation || sending ticker updates || calculate funding rate

### DONE : 1 stream [ backend -> engine ]
### DONE : 1 stream [ engine -> DBPoller ]

# question
how is this so 1 redis connection, duplicate connection, pubsub connection , etc work under the hood for single redis URL ?


## Trigger and Actions
1. OrderCreate
2. positionUpdate => when a fill is happened and makers/takers position is updated
3. tradeUpdate => 
4. OrderUpdate
5. tickerUpdate
6. any other update remained