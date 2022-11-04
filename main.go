package main

import (
	"fmt"
	"io"
	"math/rand"
	"os"
	"os/signal"
	"syscall"

	logging "github.com/ipfs/go-log/v2"
	"github.com/ipld/go-ipld-prime/codec/dagcbor"
	"github.com/ipld/go-ipld-prime/node/basicnode"
	"github.com/libp2p/go-libp2p"
	"github.com/libp2p/go-libp2p/core/network"
	"github.com/libp2p/go-libp2p/p2p/muxer/mplex"
	"github.com/libp2p/go-libp2p/p2p/muxer/yamux"
	"github.com/libp2p/go-libp2p/p2p/transport/tcp"
	"github.com/libp2p/go-libp2p/p2p/transport/websocket"
	webtransport "github.com/libp2p/go-libp2p/p2p/transport/webtransport"
)

var log = logging.Logger("data-proto")

func handleDataStream(s network.Stream) {
	defer s.Close()

	nb := basicnode.Prototype__Map{}.NewBuilder()
	err := dagcbor.Decode(nb, s)
	if err != nil {
		log.Debug("failed to decode node", err)
		s.Reset()
		return
	}

	nd := nb.Build()
	snd, err := nd.LookupByString("datasize")
	if err != nil {
		log.Debug("failed to read chunksize from ipld node", err)
		s.Reset()
		return
	}
	size, err := snd.AsInt()
	if err != nil {
		log.Debug("failed to interpret size as int", err)
		s.Reset()
		return
	}

	r := rand.New(rand.NewSource(42))
	lr := io.LimitReader(r, size)

	n, err := io.Copy(s, lr)
	if err != nil {
		log.Debug("failed to write bytes", err)
		return
	}
	log.Info("wrote %d bytes", n)
}

func run() error {
	lvl, err := logging.LevelFromString("debug")
	if err != nil {
		return err
	}
	logging.SetAllLoggers(lvl)

	host, err := libp2p.New(
		libp2p.ListenAddrStrings(
			"/ip4/0.0.0.0/tcp/41605",
			"/ip4/0.0.0.0/tcp/41606/ws",
			"/ip4/0.0.0.0/udp/41607/quic/webtransport",
		),
		libp2p.Transport(tcp.NewTCPTransport),
		libp2p.Transport(websocket.New),
		libp2p.Transport(webtransport.New),
		libp2p.Muxer("/yamux/1.0.0", yamux.DefaultTransport),
		libp2p.Muxer("/mplex/6.7.0", mplex.DefaultTransport),
		libp2p.DisableRelay(),
	)
	if err != nil {
		return err
	}

	host.SetStreamHandler("/bench/data", handleDataStream)

	for _, a := range host.Addrs() {
		fmt.Printf("%s/p2p/%s\n", a, host.ID())
	}

	interrupt := make(chan os.Signal, 1)
	signal.Notify(interrupt, syscall.SIGINT, syscall.SIGTERM)

	signal.Ignore(syscall.SIGPIPE)
	s := <-interrupt
	fmt.Printf("\nShutting down, reason: %s\n", s.String())
	return nil
}

func main() {
	if err := run(); err != nil {
		fmt.Println("error: ", err)
	}
}
