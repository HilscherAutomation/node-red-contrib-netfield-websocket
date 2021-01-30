# node-red-contrib-netfield-websocket

Node-RED nodes to communicate to Hilscher **netFIELD Cloud** [WebSocket](https://tools.ietf.org/html/rfc6455) API services.

The section **Websocket** in the [online API](https://api.netfield.io/v1/documentation) documents the services:

<kbd>
<img src="https://github.com/HilscherAutomation/node-red-contrib-netfield-websocket/raw/master/images/api.png" alt="api" width="450" style='border:5px solid black'/>
</kbd>

## WebSocket Interface

In netFIELD Cloud WebSockets are used to stream process data of the cloud managed devices live to any clients such as Node-RED.

In a WebSocket session a device is determined by its unique **deviceId**. Device IDs can be retrieved from your cloud account:

<kbd>
<img src="https://github.com/HilscherAutomation/node-red-contrib-netfield-websocket/raw/master/images/deviceid.png" alt="deviceid" width="200" style='border:5px solid black'/>
</kbd>
<br/>
<br/>

The device's data object of interest is specified by a path formatted **topic**. Topics can be retrieved from the Device Manager in your cloud account. 

Depending on the device topics can either be static:

<kbd>
<img src="https://github.com/HilscherAutomation/node-red-contrib-netfield-websocket/raw/master/images/topics.png" alt="topicstat" width="450" style='border:5px solid black'/>
</kbd>
<br/>
<br/>

or created manually:

<kbd>
<img src="https://github.com/HilscherAutomation/node-red-contrib-netfield-websocket/raw/master/images/topicdyn.png" alt="topicdyn" width="450" style='border:5px solid black'/>
</kbd>
<br/>
<br/>

The streamed data object itself is [JSON](https://www.json.org/json-en.html) formatted.

The communication is [TLS](https://en.wikipedia.org/wiki/Transport_Layer_Security) secured and authenticated by an **authorization** key in [JSON Web Token](https://tools.ietf.org/html/rfc7519) format. Keys can be generated using the API Key Manager in your cloud account. 

When generating a key make sure the permission **viewDeviceMessages** is enabled for using WebSockets. This is a typical key details page:

<kbd>
<img src="https://github.com/HilscherAutomation/node-red-contrib-netfield-websocket/raw/master/images/key.png" alt="key" width="450" style='border:5px solid black'/>
</kbd>
<br/>
<br/>
The standard netFIELD Cloud WebSocket server URL is <strong>wss://api.netfield.io</strong>.

## Nodes usage

The module provides the nodes **websocket-in** and **websocket-config**. Configure the

* node **websocket-in** with

   |Parameter|Description|Example
   |:---------|:------------|:---------
   |Device ID | Device id of the addressed device. Copy value from your cloud account | **5f7b1bec199d7835e0929e9b**
   |Topic | Data object tag to listen to live. Copy the topic from your cloud account. Wildcard char # in the path creates pattern matching. # only listens to all objects | **#**

   The node injects a JSON formatted object in **msg.payload** for any data object received through the WebSocket.

* configuration node **websocket-config** with

   |Parameter|Description|Example
   |:---------|:------------|:---------
   |URL | WebSocket wss://... server URL | **wss://api.netfield.io**
   |Timeout Period [s]| Inactivity timeout (ping) in seconds if expired WebSocket is assumed as timed out and tried to get connected again | **30**
   |Key | Key to authorize on the server. Copy value from your cloud account key details page | **eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1S ...**

## Nodes installation

Use the Node-RED "Manage Palette" function to install. Enter *node-red-contrib-netfield-websocket* in the install tab search bar, wait for the package appearing and click install.

<kbd>
<img src="https://github.com/HilscherAutomation/node-red-contrib-netfield-websocket/raw/master/images/palette.png" alt="palette" width="450" style='border:5px solid black'/>
</kbd>

## License

Copyright (c) Hilscher Gesellschaft fuer Systemautomation mbH. All rights reserved.
Licensed under the LICENSE file information stored in the project's source code repository.
