1. Signin / Signup => db update => JWT Token recieve
2. Admin => Create_Market
2. Add Balance [or will have existing free balance] => add balance to EngineMemory Object "Availablebalance" => DB to users profile
# 3. view Ticker on top [depends on marketId]
4. view Position [depends on marketId + userId]
5. view Order History [depends on marketId + userId]
6. view Fills [depends on marketId]
# 7. view DepthUpdates [depends on marketId] [happens on trigger]
8. create an Order [responds with "order recieved"] [or may be respond with "no matching price so sitting on orderbook"] [or if we send notification on every movement happened in their order => filled / another partial fill / cancled / autoliquidated / ADL]
9. cancle an Order [responds with canceld the Order this is the PnL and amount is collected into your balance and your collateral is unlocked and collected in balance]