// Fetches listings for a given Twitch channel and outputs the merged JSON to stdout or a file.

package main

import (
	"bufio"
	"encoding/json"
	"flag"
	"log"
	"net/http"
	"os"

	"github.com/keunwoo/vodpile/twitch"
)

func main() {
	twitchChannel := flag.String("channel", "", "Name of Twitch channel to fetch (e.g. 'gsl')")
	output := flag.String("output", "", "Output file; if absent, prints to stdout.")
	flag.Parse()

	if *twitchChannel == "" {
		log.Fatal("Empty -channel argument; cannot fetch.")
	}

	var enc *json.Encoder
	if *output == "" {
		writer := bufio.NewWriter(os.Stdout)
		enc = json.NewEncoder(writer)
		defer writer.Flush()
	} else {
		log.Printf("Writing to output file: %s", *output)
		outfile, err := os.Create(*output)
		if err != nil {
			panic(err)
		}
		defer outfile.Close()
		enc = json.NewEncoder(outfile)
	}

	client := &http.Client{}
	vids := twitch.FetchVideoList(client, *twitchChannel)
	vidList := make([]twitch.Video, len(vids))
	i := 0
	for _, v := range vids {
		vidList[i] = v
		i++
	}
	log.Printf("Got %d unique videos.", i)
	enc.Encode(vidList)
}
