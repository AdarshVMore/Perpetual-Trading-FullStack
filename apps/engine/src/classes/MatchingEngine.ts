export class MatchingEngine {
  private orderBook;
  private fillManager;

  constructor() {
    ((this.orderBook = OrderBook), (this.fillManager = FillManager));
  }
  matchOrder() {}
}
