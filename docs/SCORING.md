# How NicheRadar scores a topic

NicheRadar answers one question: **if a small channel uploads on this topic, will YouTube show the video to
people, or hand the traffic to the big channels?** It searches YouTube the way a viewer would, then looks at who
ranks today, how big those channels are, and how their videos perform compared with their size.

All of this lives in [`desktop/src/core/scoring.ts`](../desktop/src/core/scoring.ts) and is covered by
`npm run selftest`.

## What it fetches

| Scan | Requests | Quota |
|---|---|---|
| Quick | `search.list` (top 50 by relevance) + `videos.list` + `channels.list` | ~102 units |
| Deep | Quick, plus `search.list` for the 50 most-viewed uploads of the last 90 days | ~204 units |

The free daily allowance is 10,000 units (about 95 quick scans). Responses are cached for 12 hours (configurable),
so reopening or re-running a topic the same day costs nothing.

## Terms

- **Small channel**: under 50K subscribers by default. With *Auto-size* on and your channel connected, it's 25×
  your subscriber count, kept between 10K and 250K. A 2K-subscriber channel competes with channels up to 50K.
- **Big channel**: 1M+ subscribers (configurable).
- **Views ÷ subs**: a video's views divided by its channel's subscribers. Above 1 means the video reached people
  who don't follow the channel.
- **× channel average**: a video's views divided by the channel's average views per video (total channel views ÷
  video count).
- **Breakout**: a video from a small channel with 5K+ views **and** either 3×+ its subscribers or 4×+ its
  channel's average. This is the clearest proof that YouTube is willing to recommend newcomers on the topic.
- **Shorts**: YouTube doesn't say which videos are Shorts. NicheRadar counts a video as a Short when it's 60
  seconds or less, or up to 3 minutes and tagged `#shorts`.

## The four signals (0-100, higher is better for you)

| Signal | Weight | How |
|---|---|---|
| **Demand** | 30% | Median views/day of the top 20 results (or of recent uploads, if higher). 10/day scores 0, 100/day 25, 1K/day 50, 10K/day 75, 100K/day 100. |
| **Breakout** | 30% | 7 points per small channel in the top 10, 6 per breakout video (up to 6), plus 8 if a small-channel video got 10× its subscribers. |
| **Openness** | 25% | 100 minus rank-weighted big-channel dominance of the top 10 (rank 1 counts most; mid-size channels count a bit under half), minus up to 15 when most top titles repeat the exact phrase. |
| **Freshness** | 15% | Share of the top 20 published within 180 days. A **content gap** (strong demand, under 30% fresh, top 10 mostly over a year old) scores at least 70: an up-to-date video can win. |

**Guard rails:** demand under 15 caps the score at 38 (no competition doesn't help if nobody watches), and a top 10
with 8+ big channels, no small channels and no breakouts caps it at 45.

| Score | Verdict |
|---|---|
| 70-100 | Strong opportunity |
| 55-69 | Good with the right angle |
| 40-54 | Risky - needs a unique angle |
| 0-39 | Saturated or low demand |

## Best format

Shorts and long-form videos in the results are compared on breakouts, share from small channels and median
views/day. NicheRadar picks the format where small channels do better, or says *both* when they're close.

## Upload playbook

Built from the reference set: the top 10 results plus every small-channel breakout.

- **Titles**: templates chosen by which patterns the winning titles use (numbers, questions, first person,
  warnings, comparisons, the year), plus long-tail versions from real autocomplete phrases. Capped at 70 characters.
- **Title patterns**: share of the winning titles using each pattern.
- **Tags**: the keyword, autocomplete phrases, tags repeated across the winning videos, and frequent two-word
  phrases, kept under YouTube's 500-character limit.
- **Hashtags**: three at most (YouTube shows up to 3 above the title).
- **Target length**: the middle half (25th-75th percentile) of the winning long-form videos' durations.
- **Checklists** for click-through, watch time, Shorts and metadata, with topic-specific lines added (for
  example, when big channels own the broad title or there's a content gap).

## Draft checker

The Upload optimizer starts at 100 and takes off 25 per failure, 10 per warning and 3 per tip, so one serious
problem isn't hidden by many small passes. Checks cover title length and keyword placement, clickbait patterns,
description opening, length, chapters and hashtags, the tag limit, Shorts length, and the winning length range
for the topic.

## YouTube Analytics tips

With your channel connected, tips come from your own numbers: average view percentage (under 35% is low, 50%+
strong), traffic mix (search, Suggested, Browse, Shorts feed, end screens), net subscribers per 1,000 views,
thumbnail click-through rate when the API provides it (under 4% weak, 8%+ excellent), and outlier videos. Each
video's retention curve flags a weak hook (under 60% still watching at 10%), steep drops (over 4 points between
adjacent points) and rewatch spikes.
