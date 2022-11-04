import * as React from "react";
import { useState, useEffect } from "react";
import * as ReactDOM from "react-dom";
import { Noise } from "@chainsafe/libp2p-noise";
import { createLibp2p, Libp2p } from "libp2p";
import { multiaddr } from "@multiformats/multiaddr";
import { yamux } from "@chainsafe/libp2p-yamux";
import { mplex } from "@libp2p/mplex";
import { webSockets } from "@libp2p/websockets";
import { webTransport } from "@libp2p/webtransport";
import * as filters from "@libp2p/websockets/filters";
import { peerIdFromString } from "@libp2p/peer-id";
import * as dagCBOR from "@ipld/dag-cbor";
import { pipe } from "it-pipe";
import * as peerIdFactory from "@libp2p/peer-id-factory";
import { benchmarkPromise, Results } from "@stablelib/benchmark";

function report(name: string, results: Results) {
  const ops = results.iterations + " ops";
  const msPerOp = results.msPerOp.toFixed(2) + " ms/op";
  const opsPerSecond = results.opsPerSecond.toFixed(2) + " ops/sec";
  const mibPerSecond = results.bytesPerSecond
    ? (results.bytesPerSecond / 1024 / 1024).toFixed(2) + " MiB/s"
    : "";

  return (
    pad(name, 0, true) +
    "\n| " +
    pad(ops, 10) +
    " | " +
    pad(msPerOp, 10) +
    " | " +
    pad(opsPerSecond, 10) +
    " | " +
    pad(mibPerSecond, 10)
  );
}

const ADDR_KEY = "/maddr/default";

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

function pad(s: string, upto: number, end = false) {
  const padlen = upto - s.length;
  if (padlen <= 0) {
    return s;
  }
  const padding = new Array(padlen + 1).join(" ");
  if (end) {
    return s + padding;
  }
  return padding + s;
}

enum TransportType {
  WebSockets = "WEBSOCKETS",
  WebTransport = "WEBTRANSPORT",
}

function selectTransport(type: TransportType) {
  switch (type) {
    case TransportType.WebSockets:
      return webSockets({ filter: filters.all });
    case TransportType.WebTransport:
      return webTransport();
  }
}

enum PeerIdType {
  RSA = "RSA",
  Ed25519 = "ED25519",
  Secp256k1 = "SECP256K1",
}

function selectPeerId(type: PeerIdType) {
  switch (type) {
    case PeerIdType.RSA:
      return peerIdFactory.createRSAPeerId();
    case PeerIdType.Ed25519:
      return peerIdFactory.createEd25519PeerId();
    case PeerIdType.Secp256k1:
      return peerIdFactor.createSecp256k1PeerId();
  }
}

enum MultiplexerType {
  Mplex = "MPLEX",
  Yamux = "YAMUX",
}

function selectMplexer(type: MultiplexerType) {
  switch (type) {
    case MultiplexerType.Mplex:
      return mplex();
    case MultiplexerType.Yamux:
      return yamux();
  }
}

type BenchParams = {
  datasize: number;
  transport: TransportType;
  peerid: PeerIdType;
  multiplexer: MultiplexerType;
};

async function createClient(params: BenchParams): Promise<Libp2p> {
  const libp2p = await createLibp2p({
    transports: [selectTransport(params.transport)],
    connectionEncryption: [() => new Noise()],
    streamMuxers: [selectMplexer(params.multiplexer)],
    peerId: await selectPeerId(params.peerid),
  });
  await libp2p.start();
  return libp2p;
}

function App() {
  const [maddr, setMaddr] = useState(localStorage.getItem(ADDR_KEY) ?? "");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<string[]>([]);
  const [params, setParams] = useState<BenchParams>({
    datasize: 100 * 1024 * 1024,
    transport: TransportType.WebTransport,
    peerid: PeerIdType.Ed25519,
    multiplexer: MultiplexerType.Yamux,
  });

  async function fetchBytes() {
    if (loading) {
      return;
    }

    if (!maddr) {
      alert("Must provide a multiaddress to connect");
      return;
    }

    const ma = multiaddr(maddr);

    if (
      params.transport === TransportType.WebSockets &&
      ma.protos()[1].name !== "tcp"
    ) {
      alert("Invalid multiaddress for WebSocket transport");
      return;
    }
    if (
      params.transport === TransportType.WebTransport &&
      ma.protos()[1].name !== "udp"
    ) {
      alert("Invalid multiaddress for WebTransport transport");
      return;
    }

    setLoading(true);

    localStorage.setItem(ADDR_KEY, maddr);

    const client = await createClient(params);

    const idStr = ma.getPeerId();
    const id = peerIdFromString(idStr);

    client.peerStore.addressBook.add(id, [ma]);

    try {
      const result = report(
        "params = [ " +
          params.datasize +
          "BYTES, " +
          params.peerid +
          ", " +
          params.transport +
          ", " +
          params.multiplexer +
          " ]",
        await benchmarkPromise(async () => {
          const conn = await client.dialProtocol(id, "/bench/data");
          await pipe([dagCBOR.encode({ datasize: params.datasize })], conn);

          conn.closeWrite();

          let total = 0;
          let chunks = 0;

          for await (const buf of conn.source) {
            total += buf.byteLength;
            chunks += 1;
          }

          conn.closeRead();
        }, params.datasize)
      );
      setLoading(false);
      setResults([...results, result]);
    } catch (e) {
      console.log(e);
      setLoading(false);
    }
  }

  return (
    <div className="app">
      <div className="row">
        <div className="cel">
          <label htmlFor="maddr">Server multiaddress</label>
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
        </div>
      </div>
      <div className="cel">
        <label htmlFor="datasize">Data size</label>
        <input
          id="datasize"
          type="number"
          className="ipt"
          value={params.datasize}
          onChange={(e) =>
            setParams({ ...params, datasize: Number(e.target.value) })
          }
        />
      </div>
      <div className="row">
        <div className="cel">
          <label htmlFor="peerid">Peer ID</label>
          <select
            id="peerid"
            className="ipt"
            value={params.peerid}
            onChange={(e) => setParams({ ...params, peerid: e.target.value })}
          >
            <option value={PeerIdType.Ed25519}>Ed25519</option>
            <option value={PeerIdType.RSA}>RSA</option>
            <option value={PeerIdType.Secp256k1}>Secp256k1</option>
          </select>
        </div>
        <div className="spc" />
        <div className="cel">
          <label htmlFor="transport">Transport</label>
          <select
            id="transport"
            className="ipt"
            value={params.transport}
            onChange={(e) =>
              setParams({ ...params, transport: e.target.value })
            }
          >
            <option value={TransportType.WebTransport}>WebTransport</option>
            <option value={TransportType.WebSockets}>WebSockets</option>
          </select>
        </div>
        <div className="spc" />
        <div className="cel">
          <label htmlFor="multiplexer">Multiplexer</label>
          <select
            id="multiplexer"
            className="ipt"
            value={params.multiplexer}
            onChange={(e) =>
              setParams({ ...params, multiplexer: e.target.value })
            }
          >
            <option value={MultiplexerType.Mplex}>Mplex</option>
            <option value={MultiplexerType.Yamux}>Yamux</option>
          </select>
        </div>
      </div>

      <button className="btn" onClick={fetchBytes} disabled={loading}>
        run
      </button>
      <pre>
        <code>
          {results.map((r) => (
            <span key={r}>
              {r}
              <br />
            </span>
          ))}
        </code>
      </pre>
      {loading && <Spinner />}
    </div>
  );
}

ReactDOM.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
  document.getElementById("root")
);
