const { EventEmitter } = require("events");

const WebSocket = require("ws");
const btoa = require("btoa");

const STATES = {
  INITIALIZING: "initializing",
  CONNECTING: "connecting",
  WAITING_FOR_RECONNECT: "waiting-for-reconnect",
  AUTHENTICATING: "authenticating",
  AUTHENTICATED: "authenticated",
  SUBSCRIBING: "subscribing",
  SUBSCRIBED: "subscribed",
  UNSUBSCRIBING: "unsubscribing",
  UNSUBSCRIBED: "unsubscribed",
  CLIENT_INITIATED_CLOSE: "client-initiated close",
  CLOSED: "closed",
  ERROR: "error",
};


/**
 * WebSocket client to communicate with the netFIELD Proxy WebSocket.
 *
 * @class NetFieldProxyWebSocketClient
 */
class netFIELDWebSocketClient extends EventEmitter {
  /**
   *Creates an instance of NetFieldProxyWebSocketClient.
   * @param {string} endpoint - WebSocket endpoint, e.g. wss://api.netfield.io/v1
   * @param {string} authorization - Access token or API key.
   * @param {string} deviceId - deviceId of the device running netFIELD Proxy.
   * @param {string} topic -
   *   topic to subscribe to (plaintext, converted to base64 automatically)
   * @param {string} service - can either be "netfieldproxy" or "platformconnector"
   * @param {number} inactivitytimeout - maximum time in seconds for ping inactivity until connection is assumed as timed out
   */
    constructor(
        endpoint,
        authorization,
        deviceId,
        topic = "#",
        service = "platformconnector",
        inactivitytimeout,
        autoReconnect = true
     ) {
        // extend with super()
        super();

        this.endpoint = endpoint;
        
        // a random Client ID is needed
        this.clientId = (Math.random() + 1).toString(36).substring(7);
        
        // fill internal objects
        this.deviceId = deviceId;
        this.service = service;
        this.topic = topic;

        this.authorization = authorization;
        this.inactivitytimeout = inactivitytimeout*1000;

        this.autoReconnect = autoReconnect;
        this.reconnectWaitTime_s = 1;

        this._setState = this._setState.bind(this);
        this._setState(STATES.INITIALIZING);
        
        this.subscribeToTopic = this.subscribeToTopic.bind(this);
        this.send = this.send.bind(this);
        this.sendObject = this.sendObject.bind(this);
        this.close = this.close.bind(this);
        this._reconnect = this._reconnect.bind(this);
        this.heartbeat = this._heartbeat.bind(this);

        this.pingTimeout = null;
        this.reconnectInterval = null;
        
        // create the WebSocket object
        this.wsClient = null;
        this._initializeWebSocketClient();
      }

      /**
       * Stops all pending timers just in case.
       *
       * @access private
       *
       */
      _clearAllPendingTimers() {
         if(this.pingTimeout) {
            clearTimeout(this.pingTimeout);
            this.pingTimeout = null;
         }

         if(this.reconnectInterval) {
            clearInterval(this.reconnectInterval);
            this.reconnectInterval = null;
          }
      }

      /**
       * Sets the given state as current state of client WebSocket handler.
       *
       * @param {string} nextState - the state to be set as current
       *
       * @access private
       *
       */
      _setState(nextState) {
        const currentState = this.state;
        this.emit("stateChanged", nextState, currentState);
        this.state = nextState;
      }

      /**
       * Initializes the WebSocket client.
       *
       * @access private
       *
       * @returns { WebSocket } WebSocket client.
       */
      _initializeWebSocketClient() {
        this._setState(STATES.CONNECTING);
        const client = new WebSocket(this.endpoint);
        client.onmessage = this._messageHandler.bind(this);
        client.onerror = (error) =>  {
           try { 
              this.emit("error", error.message);
           } catch (err) {

           }
        }
        client.onclose = this._handleWebsocketClose.bind(this);
        client.onopen = () => {
          this._sayHello();
          this.reconnectWaitTime_s = 1;
          this.heartbeat();
        };
        this.wsClient = client;
      }

      _handleWebsocketClose(closeEvent) {
        const { code, wasClean, reason } = closeEvent;

        this._clearAllPendingTimers();

        // let a short time pass after closing to give the caller the chance to visualize the reason of the closing
        setTimeout( () => {
          if (this.state === STATES.CLIENT_INITIATED_CLOSE) {
            this.wsClient.terminate();
            this._setState(STATES.CLOSED);
          } else {
            if (this.autoReconnect) {
              this._reconnect();
            }
          }
        }, 2000 );
      }

      /**
       * Heatbeat timer triggered on each ping received.
       *
       */
      _heartbeat() {
        clearTimeout(this.pingTimeout);
        this.pingTimeout = setTimeout(() => {
          this.wsClient.terminate();
          this._setState(STATES.CLOSED);
        },  this.inactivitytimeout );
      }

      /**
       * Function to count down to zero to start a new try to connect.
       *
       */
      _reconnect() {
        const MAX_RECONNECT_WAIT_TIME_S = 60;
        this.reconnectWaitTime_s = Math.min(
          1 + this.reconnectWaitTime_s,
          MAX_RECONNECT_WAIT_TIME_S
        ); 
        this.reconnectRemainingTime_s = this.reconnectWaitTime_s;
        this._setState(STATES.WAITING_FOR_RECONNECT);
        this.reconnectInterval = setInterval(() => {
          if(this.reconnectRemainingTime_s -= 1) {
            this.emit("reConnect", this.reconnectRemainingTime_s);
          } else {
             clearInterval(this.reconnectInterval);
             this.reconnectInterval = null;
             this._initializeWebSocketClient()
          }
        }, 1000 );
      }

      /**
       * Handler to be invoked on receiving a message on the WebSocket.
       *
       * @param { WebSocket.MessageEvent } event - WebSocket message event.
       * @param { WebSocket.Data } event.data - WebSocket message data.
       *
       * @access private
       */
      _messageHandler({ data }) {
        try {
          const dataObj = JSON.parse(data);
          const { type, message, payload } = dataObj;
          if (payload && payload.error) {
            this.emit("error", data);
            this._setState(STATES.ERROR);
            return;
          }
          if (type === "ping") {
            // got a keep-alive 'ping' heartbeat from the server
            this._respondToHeartbeatPing();
            this.heartbeat();
            return;
          }
          switch (this.state) {
            case STATES.AUTHENTICATING:
              if (type === "hello") {
                // got a 'hello' response after successfully authenticating, subscribing
                this._setState(STATES.AUTHENTICATED);
                this.subscribeToTopic(this.deviceId, this.topic);
              }
              break;
            case STATES.SUBSCRIBING:
              if (type === "sub") {
                // got a 'sub' response after successfully subscribing
                this._setState(STATES.SUBSCRIBED);
              }
              break;
            case STATES.SUBSCRIBED:
              if (type == "pub") {
                // got a 'pub' message from the server
                this.emit("data", message);
              }
              break;
            case STATES.UNSUBSCRIBING:
              if (type == "unsub") {
                // successfully unsubscribed
                this._setState(STATES.UNSUBSCRIBED);
              }
              break;
            default:
              break;
          }
        } catch (error) {
          this.emit("error", error);
        }
      }

      /**
      * Subscribe to netFIELD proxy messages for the given device on the given topic.
       *
       * @param {string} deviceId - deviceId of the device running netFIELD Proxy.
       * @param {string} topic - topic to subscribe to (plaintext, converted to base64 automatically)
       */
      subscribeToTopic(deviceId, topic) {
        this._setState(STATES.SUBSCRIBING);
        const topicAsBase64 = btoa(topic);
        const subscribePayload = {
          id: this.clientId,
          path: `/devices/${deviceId}/` + this.service + `/${topicAsBase64}`,
          type: "sub",
        };
        this.sendObject(subscribePayload);
      }

      /**
      *  Unsubscribe to netFIELD proxy messages for the given device on the given topic.
       *
       * @param {string} deviceId - deviceId of the device running netFIELD Proxy.
       * @param {string} topic - topic to subscribe to (plaintext, converted to base64 automatically)
       */
      unsubscribe(deviceId, topic) {
        this._setState(STATES.UNSUBSCRIBING);
        const topicAsBase64 = btoa(topic);
        const subscribePayload = {
          id: this.clientId,
          path: `/devices/${deviceId}/` + this.service + `/${topicAsBase64}`,
          type: "unsub",
        };
        this.sendObject(subscribePayload);
      }

      /**
       * Send a string message.
       *
       * @param {string} dataString - string to send.
       */
      send(dataString) {
        const { wsClient } = this;
        if (wsClient && wsClient.readyState === WebSocket.OPEN) {
          try {
            // for whatever reason, sending might fail even though the WebSocket state has been checked before
            wsClient.send(dataString);
          } catch (err) {

          }
        }
      }

      /**
       * Send a message by passing in an object which will be serialized before sending.
       *
       * @param {Object} dataObj - data object to send.
       */
      sendObject(dataObj) {
        this.send(JSON.stringify(dataObj));
      }

      /**
       * Close indication from the calling application to close the WebSocket.
       *
       * @param {number} [code] - reason code
       * @param {string} [data] - reason
       */
      close(code, data) {

        this._clearAllPendingTimers();
        this.removeAllListeners();

        const { wsClient } = this;
        if (wsClient) {
          if( wsClient.readyState === wsClient.OPEN) {

            this.on("stateChanged", (state) => {
              if (state === STATES.UNSUBSCRIBED)
                setTimeout( () => {
                     this._setState(STATES.CLIENT_INITIATED_CLOSE);
                     this.wsClient.close(code, data);
                  }, 200);
            });

            if (this.state === STATES.SUBSCRIBED) {
              this.unsubscribe(this.deviceId, this.topic);
            }
          } else {
            wsClient.terminate();
          }
        }
      }

      /**
       * Send a 'hello' message according the nes protocol which authenticates this client.
       *
       * https://github.com/hapijs/nes/blob/master/PROTOCOL.md#Hello
       *
       * @access private
       */
      _sayHello() {
        this._setState(STATES.AUTHENTICATING);
        const helloPayload = {
          type: "hello",
          auth: {
            headers: {
              authorization: this.authorization,
            },
          },
          id: this.clientId,
          version: "2",
        };
        this.sendObject(helloPayload);
      }

      /**
       * Send a heartbeat keep-alive ping response according to the nes protocol.
       *
       * https://github.com/hapijs/nes/blob/master/PROTOCOL.md#Heartbeat
       *
       * @access private
       */
      _respondToHeartbeatPing() {
        const pingResponsePayload = {
          id: this.clientId,
          type: "ping",
        };
        this.sendObject(pingResponsePayload);
      }
}

module.exports = {
  netFIELDWebSocketClient,
  STATES,
};
