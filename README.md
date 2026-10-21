# What a release snapshot misses

Across 122 NFL games, 3,598 of 10,870 eligible routes close to a defender at release had a sustained earlier spacing window under our exploratory definition.
We measure windows above two yards for at least half a second, starting one second after the snap, at least two yards downfield and ending at least three tenths of a second before release.
The [offline report](outputs/multigame/report.html) links a field replay to a separation timeline, compares alignment and coverage groups, and lets coaches filter and replay a 50-route review queue alongside a matched Scott Miller pair.
Coaches can use the [film-review queue](outputs/multigame/film_review_queue.csv) to inspect earlier windows, while sensitivity checks show that stricter timing and depth rules reduce the rate; spacing alone does not establish a passing opportunity or quarterback error.
See [the detailed findings](outputs/multigame/findings.md) and [locked reproduction instructions](REPRODUCE.md) for the source, exclusions, uncertainty and one-command build.
