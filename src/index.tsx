import * as React from "react";
import { useState, useEffect } from "react";
import * as ReactDOM from "react-dom";
import { Noise } from "@chainsafe/libp2p-noise";
import { createLibp2p, Libp2p } from "libp2p";
import { getPeer } from "libp2p/dist/src/get-peer";
import { multiaddr } from "@multiformats/multiaddr";
import { yamux } from "@chainsafe/libp2p-yamux";
import { webSockets } from "@libp2p/websockets";
import { webTransport } from "@libp2p/webtransport";
import * as filters from "@libp2p/websockets/filters";
import { peerIdFromString } from "@libp2p/peer-id";
import * as dagCBOR from "@ipld/dag-cbor";
import { pipe } from "it-pipe";

const ADDR_KEY = "/maddr/default";
const MAX_CHUNK_SIZE = 262144;

function Spinner() {
  return (
    <div className="spin" role="progressbar">
      <svg height="100%" viewBox="0 0 32 32" width="100%">
        <circle
          cx="16"
          cy="16"
          fill="none"
          r="14"
          strokeWidth="4"
          style={{
            stroke: "#000",
            opacity: 0.2,
          }}
        />
        <circle
          cx="16"
          cy="16"
          fill="none"
          r="14"
          strokeWidth="4"
          style={{
            stroke: "#000",
            strokeDasharray: 80,
            strokeDashoffset: 60,
          }}
        />
      </svg>
    </div>
  );
}

function App() {
  const [maddr, setMaddr] = useState(localStorage.getItem(ADDR_KEY) ?? "");
  const [loading, setLoading] = useState(false);
  const [client, setClient] = useState<Libp2p | null>(null);

  const disabled = !maddr || loading || !client;

  async function sendRequest() {
    if (disabled) {
      return;
    }
    setLoading(true);
    localStorage.setItem(ADDR_KEY, maddr);

    const ma = multiaddr(maddr);
    const idStr = ma.getPeerId();
    const id = peerIdFromString(idStr);

    client.peerStore.addressBook.add(id, [ma]);

    const stream = await client.dialProtocol(id, "/test/hello");
    await pipe([dagCBOR.encode("Hello")], stream);

    console.log("Sent message");
  }
  async function createClient(): Promise<Libp2p> {
    const libp2p = await createLibp2p({
      // transports: [webSockets({filter: filters.all})],
      transports: [webTransport()],
      connectionEncryption: [() => new Noise()],
      // streamMuxers: [yamux()],
    });
    await libp2p.start();
    return libp2p;
  }
  useEffect(() => {
    createClient().then((client) => setClient(client));
  }, []);
  return (
    <div className="app">
      <div className="img">{loading && <Spinner />}</div>
      <input
        id="maddr"
        type="text"
        autoComplete="off"
        spellCheck="false"
        placeholder="multi address"
        className="ipt"
        value={maddr}
        onChange={(e) => setMaddr(e.target.value)}
      />
      <button className="btn" onClick={sendRequest} disabled={disabled}>
        request
      </button>
    </div>
  );
}

ReactDOM.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
  document.getElementById("root")
);
