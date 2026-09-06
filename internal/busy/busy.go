package busy

import "time"

type Interval struct {
	Start      time.Time
	End        time.Time
	Summary    string
	CalendarID int64
	Provider   string
}
