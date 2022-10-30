# WebTransport example

> Trying to reproduce what seems to be a multiplexer issue with WebTransport

## Usage

- Run the go server:
```sh
go run .
```

- Run the web server:
```sh
npm install && npm run start
```

- Copy the localhost quic multiaddress, open the browser at `localhost:8000` and paste in the text input then press [request].

- A Libp2p handler should be called on the go side but isn't.
