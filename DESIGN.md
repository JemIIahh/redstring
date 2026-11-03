# Redstring: visual design contract

Redstring is a shared case wall. A person names a company, an agent pulls public
records and pins them as index cards on a slate board, and red thread connects
what the records connect. Only the person decides what is confirmed.

## Product mode

- Mode: `operate`, used in short, focused sessions on one case.
- First view: the board. Where you are (case title), the work (cards and thread),
  and what needs you (proposed items) are visible without opening anything.
- Anything that is not the board (evidence, activity, review queue) opens beside
  or over it and closes again. The board never moves to make room.

## Direction: the case wall

An investigator's wall, kept tidy: paper index cards pinned to dark slate felt,
joined by thread that sags a little under its own weight. It is not a cork board
and not a graph tool: no glow, no force-directed hairball, no neon.

**The thread is the status.** A string says how much to trust the link without
needing a legend, and the card says who put it there.

| State | Thread | Card |
|---|---|---|
| confirmed | solid red thread, tacked to the edge of both cards | green "confirmed" stamp |
| proposed | thin dashed pink thread | amber "proposed" tab; "proposed by agent" when the agent added it |
| rejected | cut: two short strands hanging from their tacks, a gap between, grey | struck-through title, grey "rejected" stamp, the reason shown |
| dead end | thread ends in a knot before reaching the card | slate hatch, "dead end" stamp, the reason shown |

Who added it: a round ink mark for the person, a small square teal mark with a
spark for the agent, always with the word beside it. Evidence is a paper-clip
count ("3 sources"). A card with no evidence cannot exist, so there is no empty
state to design.

## Palette

Scoped to the board (`.rs-board`), independent of the app's light and dark
theme: the board is a surface, like a table, in either theme.

| Token | Value | Use |
|---|---|---|
| `--rs-felt` | `#232B33` | board background (slate felt) |
| `--rs-felt-dot` | `rgba(255,255,255,.06)` | dot grid |
| `--rs-card` | `#F3EFE6` | index card |
| `--rs-card-edge` | `#D8D1C2` | card hairline |
| `--rs-ink` | `#1D2328` | card text |
| `--rs-ink-soft` | `#5B6670` | secondary text on cards |
| `--rs-thread` | `#D8432F` | confirmed thread and its tacks |
| `--rs-thread-soft` | `#E58C7F` | proposed thread |
| `--rs-confirmed` | `#2F6B4F` | confirmed stamp |
| `--rs-proposed` | `#B26B00` | proposed tab |
| `--rs-agent` | `#2B7A78` | agent mark |
| `--rs-muted` | `#7A8590` | rejected and dead-end thread and stamps |

Red is only ever thread and the tacks that hold it, so it never reads as an accusation. Each card's own pin is steel. There
is no red badge, no warning colour, no score.

## Type

- Names on cards: Newsreader (variable serif), 17px, optical size on. Names are
  the content and should read like a document.
- Record ids, numbers, source names: IBM Plex Mono, 11.5px.
- Everything else (app chrome, buttons, labels): Inter, as the app already does.

## Shape and depth

- Cards 232px wide, 6px radius, hairline edge, one soft shadow, a steel pin at
  the top. A string is tacked to the edge of each card it joins, on the line
  between the two, so all of it shows; strings run in front of cards they cross. Each card sits at a fixed angle between -0.8 and 0.8 degrees taken
  from its id, so a board looks hand-pinned but never changes between visits.
- The board is a dot grid on felt. No gradients, no texture images.

## Motion

- Thread is drawn, not faded: on first view each string draws in over 450ms,
  staggered by 25ms. A new card drops in (8px, a 2 degree settle, 220ms).
- Dragging a card moves its thread live and the sag follows.
- Selecting a card brightens its strings and dims the rest to 25%. Clicking the
  board clears it.
- `prefers-reduced-motion`: no draw-in, no drop, no sag animation; state changes
  are instant.

## Layout

- Desktop: the board fills the page below a slim bar (case title, a small
  thread legend, zoom controls). The app sidebar and agent panel are the
  template's and are left alone.
- Phone: the same board, panned and pinched with touch; the bar keeps only the
  title. Cards are the same size, so the text never shrinks to fit: the board
  opens on the first confirmed card at a readable size, and the fit-all control
  is one tap away.

## Anti-references

Cork board with photographs; glowing node graphs; purple gradients; red warning
badges, risk scores or the words suspicious, criminal, guilty; a count strip over
the board; cards that restate their own title; a decorative hero.
