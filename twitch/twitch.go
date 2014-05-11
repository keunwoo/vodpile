package twitch

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
)

// Video describes one entry in the response to the /channels/:channel/videos twitch.tv REST API:
// https://github.com/justintv/Twitch-API/blob/master/v2_resources/videos.md#get-channelschannelvideos
// We do not attempt to capture every single field, only those needed for our application.
type Video struct {
	ID         string `json:"_id"`
	Title      string `json:"title"`
	RecordedAt string `json:"recorded_at"`
	Links      struct {
		Self    string `json:"self"`
		Channel string `json:"channel"`
	} `json:"_links"`
	Embed   string  `json:"embed"`
	URL     string  `json:"url"`
	Preview string  `json:"preview"`
	Length  float64 `json:"length"`
}

// FetchVideoList uses c to retrieve metadata about all the videos in a twitch.tv channel.
func FetchVideoList(c *http.Client, channelName string) map[string]Video {
	vids := make(map[string]Video, 500)
	defer func() {
		log.Printf("Total videos parsed: %d", len(vids))
	}()

	// Loop over chunks.
	url := fmt.Sprintf(
		"https://api.twitch.tv/kraken/channels/%s/videos?limit=%d",
		channelName,
		100)
	for {
		fetchReq, err := http.NewRequest("GET", url, nil)
		if err != nil {
			log.Fatal(err)
		}
		fetchReq.Header.Add("Accept", "application/vnd.twitchtv.v2+json")
		fetchReq.Header.Add("Cliient-ID", "38hlgc6gs8kj60lo4r8c4j9m5g6ih94")
		resp, err := c.Do(fetchReq)
		if err != nil {
			log.Fatal(err)
		}
		if resp.StatusCode != 200 {
			log.Fatalf("Failing with HTTP code: %d", resp.StatusCode)
		}
		log.Printf("Content length %d bytes for URL %q", resp.ContentLength, url)

		// Process current message
		var chunkCount, channelCount int
		chunkCount, channelCount, url = DecodeVideos(resp.Body, vids)

		// Stop fetching if we appear to have processed all the videos.
		// There's an inherent race condition with fetching paginated data while the source
		// may be changing, so we stop in any of 3 cases:
		// 1. Twitch didn't give us any videos on this fetch.
		// 2. We have fetched as many videos as twitch reports for the channel total.
		// 3. Twitch didn't give us a next-chunk URL.
		if chunkCount == 0 {
			break
		}
		if (len(vids) >= channelCount) || (url == "") {
			break
		}
	}

	return vids
}

// DecodeVideos decodes one batch of videos from a twitch.tv JSON response message, which should be
// readable from r, and stores them in vids keyed by the ID field.  Returns the count of Video
// objects parsed from this message, the total count of videos expected for the current twitch.tv
// channel, and the "next chunk" URL given to us by twitch.
func DecodeVideos(r io.Reader, vids map[string]Video) (int, int, string) {
	dec := json.NewDecoder(r)
	type VideosMessage struct {
		Total float64 `json:"_total"`
		Links struct {
			Self string `json:"self"`
			Next string `json:"next"`
		} `json:"_links"`
		Videos []Video `json:"videos"`
	}
	count := 0
	total := 0
	nextURL := ""
	for {
		var m VideosMessage
		if err := dec.Decode(&m); err == io.EOF {
			break
		} else if err != nil {
			log.Fatal(err)
		}
		total = int(m.Total)
		nextURL = m.Links.Next
		for _, v := range m.Videos {
			vids[v.ID] = v
			count++
		}
	}
	return count, total, nextURL
}
