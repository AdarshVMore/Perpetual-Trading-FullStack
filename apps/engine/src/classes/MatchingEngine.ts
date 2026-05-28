export class MatchingEngine {
  private orderBook;
  private fillManager;

  constructor(OrderBook, FillManager) {
    this.orderBook = OrderBook
    this.fillManager = FillManager
  }
  matchOrder() {
    while (!list.isEmpty()){
        // find resting order
        // calculate traded qty
        // update remaining qty
        // dequeue if filled    
    }
    return {
        // fills: [],
        // averagePrice,
        // filledQty,
        // remainingQty
    }
  }
}
