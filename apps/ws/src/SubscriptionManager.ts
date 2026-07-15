import WebSocket from "ws";

export class SubcriptionManager {
  private socketToChannel = new Map<WebSocket, Set<string>>();
  private channelToSocket = new Map<string, Set<WebSocket>>();

  subscribe(channel: string, socket: WebSocket) {
    if (!this.socketToChannel.has(socket)) {
      this.socketToChannel.set(socket, new Set());
    }

    this.socketToChannel.get(socket)?.add(channel);

    if (!this.channelToSocket.has(channel)) {
      this.channelToSocket.set(channel, new Set());
    }

    this.channelToSocket.get(channel)?.add(socket);
  }
  removeSocket(socket: WebSocket) {
    const channels = this.socketToChannel.get(socket);
    if (!channels) {
      return [];
    }

    const emptiedChannels: string[] = [];
    for (const channel of channels) {
      if (this.removeSocketFromChannel(channel, socket)) {
        emptiedChannels.push(channel);
      }
    }

    this.socketToChannel.delete(socket);
    return emptiedChannels;
  }

  createChannel(channel: string, market: string, userId?: string) {
    if (channel === "position" && userId) {
      return `${channel}:${userId}:${market}`;
    }
    if (channel === "order" && userId) {
      return `${channel}:${userId}:${market}`;
    }
    return `${channel}:${market}`;
  }

  unsubscribeChannel(channel: string, socket: WebSocket) {
    this.socketToChannel.get(socket)?.delete(channel);

    if (this.socketToChannel.get(socket)?.size === 0) {
      this.socketToChannel.delete(socket);
    }

    const channelIsEmpty = this.removeSocketFromChannel(channel, socket);

    return channelIsEmpty;
  }

  getSubscribers(channel: string) {
    return this.channelToSocket.get(channel);
  }

  hasSubscribers(channel: string) {
    return (this.channelToSocket.get(channel)?.size ?? 0) > 0;
  }

  private removeSocketFromChannel(channel: string, socket: WebSocket) {
    const sockets = this.channelToSocket.get(channel);
    if (!sockets) {
      return false;
    }

    sockets.delete(socket);

    if (sockets.size > 0) {
      return false;
    }

    this.channelToSocket.delete(channel);
    return true;
  }
}
