const {
  netFIELDWebSocketClient,
  STATES,
} = require("./netFIELDWebSocketClient");

module.exports = function (RED) {

  // websocket-in node function
  function netFIELDWebSocketInNode(config) {
    RED.nodes.createNode(this, config);

    var node = this;

    // signal WebSocket is uninitialized
    this.status({ fill: "red", shape: "dot", text: "uninitialized" });
 
    // get the websocket-config node configuration
    this.websocket = RED.nodes.getNode(config.websocket);
    const endpoint = this.websocket.endpoint;
    const authorization = this.websocket.authorization;
    const service = this.websocket.service;
    const inactivitytimeout = parseInt(this.websocket.inactivitytimeout,10);

    // get the websocket-in node configuration
    const deviceId = config["deviceid"];
    const topic = config["topic"];

    // create a new WebSocket object
    const client = new netFIELDWebSocketClient(
      endpoint,
      authorization,
      deviceId,
      topic,
      service,
      inactivitytimeout
    );

    // signal a websocket has been initialized
    this.status({ fill: "red", shape: "ring", text: "initialized" });

    // some statistics
    let cntEmittedDataEventsTotal = 0;
    let cntSubscriptionsTotal = 0;

    // node state handling
    client.on("stateChanged", (curr, prev) => {
      switch (curr) {
        case STATES.INITIALIZING:
        case STATES.CONNECTING:
        case STATES.AUTHENTICATING:
          node.status({ fill: "yellow", shape: "ring", text: "connecting" });
          break;
        case STATES.AUTHENTICATED:
          node.status({ fill: "green", shape: "ring", text: "authenticated" });
          break;
        case STATES.SUBSCRIBING:
          node.status({ fill: "yellow", shape: "ring", text: "subscribing" });
          break;
        case STATES.SUBSCRIBED:
          cntSubscriptionsTotal +=1;
          node.status({ fill: "green", shape: "dot", text: `reconnects: ${cntSubscriptionsTotal-1} / messages: ${ cntEmittedDataEventsTotal}`});
          break;
        case STATES.REVOKED:
          break;
        case STATES.CLIENT_INITIATED_CLOSE:
        case STATES.UNSUBSCRIBING:
          node.status({ fill: "red", shape: "ring", text: "disconnecting" });
          break;
        case STATES.CLOSED:
          node.status({ fill: "red", shape: "dot", text: "disconnected" });
          break;
        case STATES.WAITING_FOR_RECONNECT:
          node.status({ fill: "yellow", shape: "ring", text: "reconnecting" });
          break;
        default:
          node.status({ fill: "grey", shape: "ring", text: "unknown" });
     }
    });

    // for cases where a reconnection is ongoing 
    client.on("reConnect", (remainingTime) => {
      node.status({ fill: "yellow", shape: "ring", text: `reconnecting in ${remainingTime} seconds` });
    });

    // inject the message as node's output
    client.on("data", function sendMessageToNodeOutput(message) {
      cntEmittedDataEventsTotal +=1;
      node.status({ fill: "green", shape: "dot", text: `reconnects: ${cntSubscriptionsTotal-1} / messages: ${cntEmittedDataEventsTotal}`});
      node.send({ payload: message });
    });

    // a subscription has been revokedn
    client.on("revoke", function SetNodeStatusToRevoked(message) {
      node.status({ fill: "yellow", shape: "dot", text: `${message}` });
    });

    // an error happened during communication
    client.on("error", function SetNodeStatusToError(error) {
      node.status({ fill: "red", shape: "dot", text: `${error}` });
    });

    // handler when node-red fires a close event
    this.on("close", (done) => {
        client.close(1000, "client-initiated close");
        done();
    });
  }
  RED.nodes.registerType("websocket-in", netFIELDWebSocketInNode);

  // websocket-config node function
  function netFIELDWebSocketConfig(config) {
    RED.nodes.createNode(this, config);

    this.endpoint = config["apiendpoint"];
    this.authorization = config["authorization"];
    this.service = "platformconnector";
    this.inactivitytimeout = config["inactivitytimeout"];
  }
  RED.nodes.registerType("websocket-config", netFIELDWebSocketConfig);
};
