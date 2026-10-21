# Confirmed event context

Source: [NFL Big Data Bowl: Paris Side Quest](https://luma.com/1641cv5m), read October 21, 2026.

- Challenge: October 21, 2026, 13:00–16:00 Europe/Paris; submissions close at 16:00.
- Focus: football insights about WR/TE/RB using the supplied NFL tracking data and Python.
- Submission: public repository, working code, a 3–5 sentence README, and visualization or metric output.
- Published judging dimensions: football insight, technical execution, communication and originality.
- User supplied the on-site clarification: practical usefulness to a football professional,
  technique, readable README and originality. No scoring weights supplied.
- Work must be created during the competition window and on site; project implementation
  here began during the published window. Participant location was not independently checked.
- The page describes Kiro-assisted development; any tool-specific requirements from the
  opening briefing remain to be confirmed from the organiser's instructions.
- The public page does not specify a live pitch or Q&A slot. Judging runs 16:00–17:00.

The opening challenge prompt and detailed rubric, if different, take precedence over this page.

## On-site challenge slide supplied by the user

Source: `/home/lonestar/Projects/NFL/rules-guidelines.webp`, read October 21, 2026.
This is reference material describing the competition, not authorization to submit or publish.

- Build a tool or data visualization that an NFL coach, scout or commentator would use.
- Choose either visualization/comparison (chart, dashboard, animation or interactive tool)
  or a metric/score exploring a new statistic. Our entry fits visualization/comparison;
  it does not need to claim that nearest-defender distance is a new statistic.
- Deliver before 16:00: functional Python (`.py` or notebook), the result (visualization,
  tool screenshot or metric demo), and a 3–5 sentence README explaining what was built,
  what it reveals and who would use it.
- Submission form shown on the slide: https://tinyurl.com/awsnfl2026.
  The form has not been opened or submitted in response to this attachment.
- Three judging rounds: triage, rubric scoring and deliberation.
- Each dimension is scored from 1 to 5: football understanding, technical execution,
  communication and originality. The slide does not specify scoring weights or a live pitch.

### Fit of the current deliverable

The Python build, offline comparison/replay, static PNG and five-sentence README cover
the listed artifact types. The intended user is a coach using spacing history to select
plays for film review. The matched examples demonstrate what the visual reveals;
the sensitivity checks and explicit limitations support the football interpretation.
The public-repository requirement comes from the event page. Publication, form submission,
submission receipt and NFL mentor feedback remain outstanding.

### Dataset description discrepancy

The slide describes 2023 tracking split into pre-throw inputs and post-throw outputs.
However, its exact GitHub link is the repository already supplied by the user. A live
check after receiving this slide found its `main` unchanged at commit
`85da22eeff2f1d5be106faa9dfe06a1205f2defd`; the downloaded `games.csv` identifies
all 122 games as season 2021. Its inventory contains game-based tracking CSVs rather
than input/output files. The report correctly labels the observed data as 2021 Weeks 1–8.
Do not relabel it as 2023 or infer that another dataset was supplied.

Question for the organiser: « La diapositive mentionne 2023 et des fichiers inputs/outputs,
mais le dépôt indiqué contient 122 matchs de 2021. Est-ce bien ce dépôt qu'il faut utiliser,
ou existe-t-il un autre jeu de données distribué sur place ? »

Resolved: the user subsequently reported that the organiser confirmed 2021 data is acceptable.
The analysis retains the actual 2021 season labels and the original source commit.
