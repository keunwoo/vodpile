// Dumps selected data from a data file fetched by ../fetch/fetch.go.
// Input contents are assumed to be a JSON array of twitch.Video.

package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"

	"github.com/keunwoo/vodpile/twitch"
)

func main() {
	input := flag.String("input", "", "path to JSON file to parse")
	flag.Parse()

	if *input == "" {
		log.Fatal("need --input")
	}

	f, err := os.Open(*input)
	if err != nil {
		log.Fatal(err)
	}
	defer f.Close()

	var vids []twitch.Video
	dec := json.NewDecoder(f)
	err = dec.Decode(&vids)
	if err != nil {
		log.Fatal(err)
	}

	for _, v := range vids {
		fmt.Printf("%s:%s\n", v.ID, v.Title)
	}
}
