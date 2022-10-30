package main

import (
	"fmt"
	"os"
	"os/signal"
	"syscall"

	logging "github.com/ipfs/go-log/v2"
	"github.com/ipld/go-ipld-prime/codec/dagcbor"
	"github.com/ipld/go-ipld-prime/node/basicnode"
	"github.com/libp2p/go-libp2p"
	"github.com/libp2p/go-libp2p/core/network"
	"github.com/libp2p/go-libp2p/p2p/transport/tcp"
	"github.com/libp2p/go-libp2p/p2p/transport/websocket"
	webtransport "github.com/libp2p/go-libp2p/p2p/transport/webtransport"
)

var log = logging.Logger("hello-proto")

func handleNewStream(s network.Stream) {
	defer s.Close()

	nb := basicnode.Prototype__String{}.NewBuilder()
	err := dagcbor.Decode(nb, s)
	if err != nil {
		log.Debug("failed to decode node")
		s.Reset()
		return
	}

	nd := nb.Build()
	msg, err := nd.AsString()
	if err != nil {
		log.Debug("failed to read string from ipld node")
		s.Reset()
		return
	}
	log.Info("Received message", msg)
}

func run() error {
	lvl, err := logging.LevelFromString("debug")
	if err != nil {
		return err
	}
	logging.SetAllLoggers(lvl)

	host, err := libp2p.New(
		libp2p.ListenAddrStrings(
			"/ip4/0.0.0.0/tcp/41505",
			"/ip4/0.0.0.0/tcp/41506/ws",
			"/ip4/0.0.0.0/udp/41507/quic/webtransport",
		),
		// Explicitly declare transports
		libp2p.Transport(tcp.NewTCPTransport),
		libp2p.Transport(websocket.New),
		libp2p.Transport(webtransport.New),
		libp2p.DisableRelay(),
	)
	if err != nil {
		return err
	}

	host.SetStreamHandler("/test/hello", handleNewStream)

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
